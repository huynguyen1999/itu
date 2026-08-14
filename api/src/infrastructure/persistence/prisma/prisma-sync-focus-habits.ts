import { Tx, recordSyncChange, HABIT_SYNC_INCLUDE } from './prisma-sync-mutation.shared';
import {
  CommitmentPolicyLevel,
  FocusPhase,
  FocusSessionStatus,
  GrowthSourceType,
  HabitDirection,
  HabitOccurrenceStatus,
  HabitProgressSource,
  HabitScheduleType,
  HabitTargetType,
  Prisma,
} from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { createUlid } from './ulid';
import { awardGrowthActivityWithReceipt, reverseGrowthActivity, reverseGrowthActivityWithReceipt } from '@core/application/use-cases/growth-awards';
import { ensureHabitGrowthRule } from '@core/application/use-cases/ensure-habit-growth-rule';
import { focusActionSemanticPayload, focusAdjustSemanticPayload, focusPayloadsEqual, focusStartSemanticPayload } from './focus-idempotency';
import { commitmentDefaults, commitmentFeatureEnabled, evaluateMissedCommitment, recoveryWindowOpen, reverseCommitmentPenalty } from '@core/application/use-cases/habit-commitments';
import { settleFocusGrowth } from './prisma-focus.persistence';
import {
  assertClientId,
  enumValue,
  fieldConflict,
  notFound,
  numberArray,
  optionalString,
  requiredString,
  stringArray,
  HABIT_ACTION_MARKER_PREFIX,
} from './prisma-sync.helpers';


export class PrismaSyncFocusHabits {
  readonly kinds: readonly string[] = ["focussession.create","focussession.action","focussession.adjust","habit.create","habit.update","habit.commitment-policy","habitoccurrence.commitment-evaluate","habitoccurrence.commitment-excuse","habitoccurrence.checkin","habitoccurrence.action","habitoccurrence.checklist"];
  async applyMutation(
    tx: Tx,
    userId: string,
    mutation: SyncMutation,
    outcome: { growthReceipt?: unknown },
  ): Promise<SyncConflict | null | undefined> {
    const payload = mutation.payload;
    switch (mutation.kind) {
      case 'focussession.create': {
        assertClientId(mutation.entityId);
        const startIdempotencyKey = optionalString(payload, 'idempotencyKey');
        const startEventPayload = focusStartSemanticPayload(payload);
        if (startIdempotencyKey) {
          const keyed = await tx.focusSession.findUnique({ where: { userId_startIdempotencyKey: { userId, startIdempotencyKey } } });
          if (keyed) {
            const same =
              (keyed.taskId ?? null) === startEventPayload.taskId &&
              keyed.mode === startEventPayload.mode &&
              keyed.phase === startEventPayload.phase &&
              (keyed.presetId ?? null) === startEventPayload.presetId &&
              (keyed.policyId ?? null) === startEventPayload.policyId &&
              (keyed.ownerDeviceId ?? null) === startEventPayload.ownerDeviceId &&
              (keyed.plannedSeconds ?? null) === startEventPayload.plannedSeconds;
            if (!same) throw new InvalidSyncMutationException('Focus start idempotency key was reused with a different payload');
            return null;
          }
        }
        const existingActive = await tx.focusSession.findFirst({
          where: {
            userId,
            status: { in: [FocusSessionStatus.ACTIVE, FocusSessionStatus.PAUSED] },
          },
        });
        if (existingActive && existingActive.id !== mutation.entityId) {
          throw new InvalidSyncMutationException('An active focus session is already in progress');
        }
        const taskId = optionalString(payload, 'taskId');
        const task = taskId ? await tx.task.findFirst({ where: { id: taskId, userId } }) : null;
        if (taskId && !task) throw new InvalidSyncMutationException('Focus session task is unavailable');
        const presetId = optionalString(payload, 'presetId');
        if (presetId) {
          const preset = await tx.focusPreset.findFirst({ where: { id: presetId, userId } });
          if (!preset) throw new InvalidSyncMutationException('Focus preset is unavailable');
        }
        const policyId = optionalString(payload, 'policyId');
        if (policyId) {
          const policy = await tx.focusPolicy.findFirst({ where: { id: policyId, userId } });
          if (!policy) throw new InvalidSyncMutationException('Focus policy is unavailable');
        }
        const session = await tx.focusSession.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            taskId,
            presetId,
            mode: startEventPayload.mode,
            phase: startEventPayload.phase,
            status: FocusSessionStatus.ACTIVE,
            plannedSeconds: typeof payload.plannedSeconds === 'number' ? payload.plannedSeconds : null,
            taskTitleSnapshot: task?.title,
            customTitle: optionalString(payload, 'customTitle'),
            startedAt: payload.startedAt ? new Date(requiredString(payload, 'startedAt')) : new Date(),
            ownerDeviceId: optionalString(payload, 'ownerDeviceId'),
            policyId,
            startIdempotencyKey,
          },
          update: {},
        });
        await recordSyncChange(tx, userId, 'focussession', session.id, 'UPSERT', session);
        return null;
      }
      case 'focussession.action': {
        const session = await tx.focusSession.findFirst({ where: { id: mutation.entityId, userId } });
        if (!session) return notFound(mutation, 'focussession');
        const actionIdempotencyKey = optionalString(payload, 'idempotencyKey');
        const action = requiredString(payload, 'action');
        const actionEventPayload = focusActionSemanticPayload(action, payload);
        if (actionIdempotencyKey) {
          const existingEvent = await tx.focusEvent.findUnique({ where: { sessionId_idempotencyKey: { sessionId: session.id, idempotencyKey: actionIdempotencyKey } } });
          if (existingEvent) {
            if (!focusPayloadsEqual(existingEvent.payload, actionEventPayload)) throw new InvalidSyncMutationException('Focus action idempotency key was reused with a different payload');
            if (existingEvent.growthReceipt) outcome.growthReceipt = existingEvent.growthReceipt;
            return null;
          }
        }
        if (!['pause', 'resume', 'complete', 'abandon', 'extend', 'takeover', 'attach', 'rename'].includes(action)) {
          throw new InvalidSyncMutationException('Invalid focus action');
        }
        if (
          (action === 'complete' && session.status === FocusSessionStatus.COMPLETED) ||
          (action === 'abandon' && session.status === FocusSessionStatus.ABANDONED) ||
          (action === 'pause' && session.status === FocusSessionStatus.PAUSED) ||
          (action === 'resume' && session.status === FocusSessionStatus.ACTIVE)
        ) {
          return null;
        }
        const occurredAt = payload.occurredAt ? new Date(requiredString(payload, 'occurredAt')) : new Date();
        const pauseSeconds =
          action === 'resume' && session.pausedAt
            ? Math.max(0, Math.floor((occurredAt.getTime() - session.pausedAt.getTime()) / 1000))
            : 0;
        const taskId = action === 'attach' ? optionalString(payload, 'taskId') : session.taskId;
        if (action === 'attach' && taskId) {
          const task = await tx.task.findFirst({ where: { id: taskId, userId } });
          if (!task) throw new InvalidSyncMutationException('Focus session task is unavailable');
        }
        const updated = await tx.focusSession.update({
          where: { id: session.id },
          data: {
            status:
              action === 'pause'
                ? FocusSessionStatus.PAUSED
                : action === 'resume'
                  ? FocusSessionStatus.ACTIVE
                  : action === 'complete'
                    ? FocusSessionStatus.COMPLETED
                    : action === 'abandon'
                      ? FocusSessionStatus.ABANDONED
                      : session.status,
            pausedAt: action === 'pause' ? occurredAt : action === 'resume' ? null : session.pausedAt,
            accumulatedPauseSecs: pauseSeconds ? { increment: pauseSeconds } : undefined,
            completedAt: action === 'complete' || action === 'abandon' ? occurredAt : session.completedAt,
            plannedSeconds:
              action === 'extend'
                ? { increment: typeof payload.extendSeconds === 'number' ? payload.extendSeconds : 300 }
                : undefined,
            ownerDeviceId: action === 'takeover' ? optionalString(payload, 'ownerDeviceId') : session.ownerDeviceId,
            taskId,
            customTitle: action === 'rename' ? optionalString(payload, 'customTitle') : session.customTitle,
            reflection: payload.reflection === undefined ? session.reflection : optionalString(payload, 'reflection'),
            version: { increment: 1 },
          },
        });
        const growthReceipt = await settleFocusGrowth(tx, userId, session, updated);
        if (growthReceipt) outcome.growthReceipt = growthReceipt;
        if (actionIdempotencyKey) {
          const event = await tx.focusEvent.create({ data: { id: createUlid(), sessionId: session.id, idempotencyKey: actionIdempotencyKey, type: action, payload: actionEventPayload as unknown as Prisma.InputJsonValue } });
          if (tx.focusEvent.update) await tx.focusEvent.update({ where: { id: event.id }, data: { growthReceipt: growthReceipt ? (growthReceipt as unknown as Prisma.InputJsonValue) : Prisma.JsonNull } });
        }
        await recordSyncChange(tx, userId, 'focussession', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'focussession.adjust': {
        const session = await tx.focusSession.findFirst({ where: { id: mutation.entityId, userId } });
        if (!session) return notFound(mutation, 'focussession');
        const adjustIdempotencyKey = optionalString(payload, 'idempotencyKey');
        const adjustEventPayload = focusAdjustSemanticPayload(requiredString(payload, 'startedAt'), requiredString(payload, 'completedAt'), optionalString(payload, 'taskId') ?? undefined);
        if (adjustIdempotencyKey) {
          const existingEvent = await tx.focusEvent.findUnique({ where: { sessionId_idempotencyKey: { sessionId: session.id, idempotencyKey: adjustIdempotencyKey } } });
          if (existingEvent) {
            if (!focusPayloadsEqual(existingEvent.payload, adjustEventPayload)) throw new InvalidSyncMutationException('Focus adjustment idempotency key was reused with a different payload');
            if (existingEvent.growthReceipt) outcome.growthReceipt = existingEvent.growthReceipt;
            return null;
          }
        }
        const conflict = fieldConflict(mutation, 'focussession', session);
        if (conflict) return conflict;
        const taskId = optionalString(payload, 'taskId');
        if (taskId) {
          const task = await tx.task.findFirst({ where: { id: taskId, userId } });
          if (!task) throw new InvalidSyncMutationException('Focus session task is unavailable');
        }
        const updated = await tx.focusSession.update({
          where: { id: session.id },
          data: {
            adjustedStartedAt: new Date(requiredString(payload, 'startedAt')),
            adjustedCompletedAt: new Date(requiredString(payload, 'completedAt')),
            adjustedAt: new Date(),
            taskId,
            version: { increment: 1 },
          },
        });
        const growthReceipt = await settleFocusGrowth(tx, userId, session, updated);
        if (growthReceipt) outcome.growthReceipt = growthReceipt;
        if (adjustIdempotencyKey) {
          const event = await tx.focusEvent.create({ data: { id: createUlid(), sessionId: session.id, idempotencyKey: adjustIdempotencyKey, type: 'adjust', payload: adjustEventPayload as unknown as Prisma.InputJsonValue } });
          if (tx.focusEvent.update) await tx.focusEvent.update({ where: { id: event.id }, data: { growthReceipt: growthReceipt ? (growthReceipt as unknown as Prisma.InputJsonValue) : Prisma.JsonNull } });
        }
        await recordSyncChange(tx, userId, 'focussession', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'habit.create': {
        assertClientId(mutation.entityId);
        const timeBlockId = optionalString(payload, 'timeBlockId');
        if (timeBlockId) {
          const block = await tx.habitTimeBlock.findFirst({ where: { id: timeBlockId, userId } });
          if (!block) throw new InvalidSyncMutationException('Habit time block is unavailable');
        }
        const tagIds = stringArray(payload, 'tagIds');
        if (tagIds.length) {
          const ownedTags = await tx.taskTag.count({ where: { userId, id: { in: tagIds } } });
          if (ownedTags !== tagIds.length) throw new InvalidSyncMutationException('Habit contains an unavailable tag');
        }
        const habit = await tx.habit.upsert({
          where: { id: mutation.entityId },
          create: {
            id: mutation.entityId,
            userId,
            name: requiredString(payload, 'name'),
            description: optionalString(payload, 'description') ?? '',
            icon: optionalString(payload, 'icon') ?? 'CHECK',
            color: optionalString(payload, 'color') ?? 'EMERALD',
            targetType: enumValue(HabitTargetType, payload.targetType ?? 'BOOLEAN', 'targetType'),
            targetValue: typeof payload.targetValue === 'number' ? payload.targetValue : 1,
            unit: optionalString(payload, 'unit'),
            direction: enumValue(HabitDirection, payload.direction ?? 'BUILD', 'direction'),
            timezone: optionalString(payload, 'timezone') ?? 'UTC',
            timeBlockId,
            scheduleType: enumValue(HabitScheduleType, payload.scheduleType ?? 'WEEKDAYS', 'scheduleType'),
            weekdays: numberArray(payload, 'weekdays'),
            intervalDays: typeof payload.intervalDays === 'number' ? payload.intervalDays : null,
            timesPerPeriod: typeof payload.timesPerPeriod === 'number' ? payload.timesPerPeriod : null,
            period: optionalString(payload, 'period'),
            startDate: new Date(requiredString(payload, 'startDate')),
            endDate: payload.endDate ? new Date(requiredString(payload, 'endDate')) : null,
            difficulty: typeof payload.difficulty === 'number' ? payload.difficulty : 1,
            allowedSkips: typeof payload.allowedSkips === 'number' ? payload.allowedSkips : 0,
            restDays: numberArray(payload, 'restDays'),
            tags: tagIds.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
          },
          update: {},
        });
        const syncedHabit = await tx.habit.findUniqueOrThrow({ where: { id: habit.id }, include: HABIT_SYNC_INCLUDE });
        await ensureHabitGrowthRule(tx, userId, habit.id);
        await recordSyncChange(tx, userId, 'habit', habit.id, 'UPSERT', syncedHabit);
        return null;
      }
      case 'habit.update': {
        const habit = await tx.habit.findFirst({ where: { id: mutation.entityId, userId } });
        if (!habit) return notFound(mutation, 'habit');
        const conflict = fieldConflict(mutation, 'habit', habit);
        if (conflict) return conflict;
        if (payload.tagIds !== undefined) {
          const tagIds = stringArray(payload, 'tagIds');
          const ownedTags = await tx.taskTag.count({ where: { userId, id: { in: tagIds } } });
          if (ownedTags !== tagIds.length) throw new InvalidSyncMutationException('Habit contains an unavailable tag');
          await tx.habitTagAssignment.deleteMany({ where: { habitId: habit.id } });
          if (tagIds.length) {
            await tx.habitTagAssignment.createMany({ data: tagIds.map((tagId) => ({ habitId: habit.id, tagId })) });
          }
        }
        const updated = await tx.habit.update({
          where: { id: habit.id },
          data: {
            name: payload.name === undefined ? habit.name : requiredString(payload, 'name'),
            description:
              payload.description === undefined ? habit.description : (optionalString(payload, 'description') ?? ''),
            icon: payload.icon === undefined ? habit.icon : (optionalString(payload, 'icon') ?? habit.icon),
            color: payload.color === undefined ? habit.color : (optionalString(payload, 'color') ?? habit.color),
            targetType:
              payload.targetType === undefined
                ? habit.targetType
                : enumValue(HabitTargetType, payload.targetType, 'targetType'),
            targetValue: typeof payload.targetValue === 'number' ? payload.targetValue : habit.targetValue,
            unit: payload.unit === undefined ? habit.unit : optionalString(payload, 'unit'),
            direction:
              payload.direction === undefined
                ? habit.direction
                : enumValue(HabitDirection, payload.direction, 'direction'),
            timezone:
              payload.timezone === undefined ? habit.timezone : (optionalString(payload, 'timezone') ?? habit.timezone),
            timeBlockId: payload.timeBlockId === undefined ? habit.timeBlockId : optionalString(payload, 'timeBlockId'),
            scheduleType:
              payload.scheduleType === undefined
                ? habit.scheduleType
                : enumValue(HabitScheduleType, payload.scheduleType, 'scheduleType'),
            weekdays: payload.weekdays === undefined ? habit.weekdays : numberArray(payload, 'weekdays'),
            intervalDays: typeof payload.intervalDays === 'number' ? payload.intervalDays : habit.intervalDays,
            timesPerPeriod: typeof payload.timesPerPeriod === 'number' ? payload.timesPerPeriod : habit.timesPerPeriod,
            period: payload.period === undefined ? habit.period : optionalString(payload, 'period'),
            startDate:
              payload.startDate === undefined ? habit.startDate : new Date(requiredString(payload, 'startDate')),
            endDate:
              payload.endDate === undefined
                ? habit.endDate
                : payload.endDate
                  ? new Date(requiredString(payload, 'endDate'))
                  : null,
            difficulty: typeof payload.difficulty === 'number' ? payload.difficulty : habit.difficulty,
            allowedSkips: typeof payload.allowedSkips === 'number' ? payload.allowedSkips : habit.allowedSkips,
            restDays: payload.restDays === undefined ? habit.restDays : numberArray(payload, 'restDays'),
            archivedAt:
              typeof payload.archived === 'boolean' ? (payload.archived ? new Date() : null) : habit.archivedAt,
            version: { increment: 1 },
          },
        });
        const syncedHabit = await tx.habit.findUniqueOrThrow({ where: { id: updated.id }, include: HABIT_SYNC_INCLUDE });
        await recordSyncChange(tx, userId, 'habit', updated.id, 'UPSERT', syncedHabit);
        return null;
      }
      case 'habit.commitment-policy': {
        if (!commitmentFeatureEnabled()) return null;
        const habit = await tx.habit.findFirst({ where: { id: mutation.entityId, userId }, select: { id: true, timezone: true } });
        if (!habit) return notFound(mutation, 'habit');
        const level = payload.level === CommitmentPolicyLevel.STANDARD ? CommitmentPolicyLevel.STANDARD : payload.level === CommitmentPolicyLevel.GENTLE ? CommitmentPolicyLevel.GENTLE : (() => { throw new InvalidSyncMutationException('Invalid commitment level'); })();
        const values = commitmentDefaults(level, { ...payload, timezone: optionalString(payload, 'timezone') ?? habit.timezone });
        const current = await tx.habitCommitmentPolicy.findUnique({ where: { habitId: habit.id } });
        const effectiveFrom = payload.effectiveFrom ? new Date(requiredString(payload, 'effectiveFrom')) : new Date();
        if (!Number.isFinite(effectiveFrom.getTime())) throw new InvalidSyncMutationException('Invalid commitment effectiveFrom');
        if (current && effectiveFrom <= current.effectiveFrom) throw new InvalidSyncMutationException('Commitment policy effectiveFrom must advance');
        if (current) await tx.habitCommitmentPolicy.update({ where: { id: current.id }, data: { effectiveTo: effectiveFrom, enabled: false } });
        const enabled = payload.enabled === undefined ? (current?.enabled ?? false) : payload.enabled === true;
        const policy = await tx.habitCommitmentPolicy.upsert({
          where: { habitId: habit.id },
          create: { id: createUlid(), userId, habitId: habit.id, enabled, effectiveFrom, version: current ? current.version + 1 : 1, ...values },
          update: { ...values, enabled, effectiveFrom, effectiveTo: null, version: { increment: 1 } },
        });
        await recordSyncChange(tx, userId, 'habitcommitmentpolicy', habit.id, 'UPSERT', policy);
        return null;
      }
      case 'habitoccurrence.commitment-evaluate': {
        const result = await evaluateMissedCommitment(tx, userId, mutation.entityId, new Date(mutation.occurredAt), optionalString(payload, 'idempotencyKey') ?? undefined);
        if (result.penalty) await recordSyncChange(tx, userId, 'growthcommitmentpenalty', result.penalty.id, 'UPSERT', result.penalty);
        if (result.breached) {
          const updated = await tx.habitOccurrence.findFirst({ where: { id: mutation.entityId, habit: { userId } }, include: { habit: true, checkIn: true, checklistItems: true } });
          if (updated) await recordSyncChange(tx, userId, 'habitoccurrence', updated.id, 'UPSERT', updated);
        }
        return null;
      }
      case 'habitoccurrence.commitment-excuse': {
        const occurrence = await tx.habitOccurrence.findFirst({ where: { id: mutation.entityId, habit: { userId } }, include: { commitmentPenalty: true } });
        if (!occurrence) return notFound(mutation, 'habitoccurrence');
        const reversal = occurrence.commitmentPenalty?.state === 'ACTIVE'
          ? await reverseCommitmentPenalty(tx, userId, mutation.entityId, 'EXCUSE')
          : null;
        if (reversal?.penalty) await recordSyncChange(tx, userId, 'growthcommitmentpenalty', reversal.penalty.id, 'UPSERT', reversal.penalty);
        if (reversal?.reversal) await recordSyncChange(tx, userId, 'growthledgerentry', reversal.reversal.id, 'UPSERT', reversal.reversal);
        else await tx.habitOccurrence.update({ where: { id: mutation.entityId }, data: { commitmentState: 'EXCUSED' } });
        const updated = await tx.habitOccurrence.findFirst({ where: { id: mutation.entityId, habit: { userId } }, include: { habit: true, checkIn: true, checklistItems: true } });
        if (updated) await recordSyncChange(tx, userId, 'habitoccurrence', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'habitoccurrence.checkin': {
        let occurrence = await tx.habitOccurrence.findFirst({
          where: { id: mutation.entityId, habit: { userId } },
          include: { habit: true },
        });
        if (!occurrence) return notFound(mutation, 'habitoccurrence');
        const source = enumValue(HabitProgressSource, payload.source ?? 'MANUAL', 'source');
        const sourceEventId = requiredString(payload, 'idempotencyKey');
        const inputValue = typeof payload.value === 'number' ? payload.value : 0;
        const note = optionalString(payload, 'note');
        const focusSessionId = optionalString(payload, 'focusSessionId');
        const adjusted = payload.adjusted === true;
        const existingLog = await tx.habitProgressLog.findUnique({ where: { source_sourceEventId: { source, sourceEventId } } });
        if (existingLog) {
          const samePayload =
            existingLog.occurrenceId === occurrence.id &&
            existingLog.value === inputValue &&
            (existingLog.note ?? null) === note &&
            (existingLog.focusSessionId ?? null) === focusSessionId &&
            (existingLog.adjusted ?? false) === adjusted;
          if (!samePayload) throw new InvalidSyncMutationException('Habit check-in idempotency key was reused with a different payload');
          if (existingLog.growthReceipt) outcome.growthReceipt = existingLog.growthReceipt;
          return null;
        }
        // Sync can arrive after the local deadline. Evaluate server-side before
        // completion so delayed clients cannot bypass a committed penalty.
        // Use the client event time, not server arrival time: an on-time
        // completion queued offline must not become a late commitment breach.
        const commitmentResult = await evaluateMissedCommitment(tx, userId, occurrence.id, new Date(mutation.occurredAt));
        if (commitmentResult.breached) {
          occurrence = await tx.habitOccurrence.findFirst({ where: { id: occurrence.id, habit: { userId } }, include: { habit: true } });
          if (!occurrence) return notFound(mutation, 'habitoccurrence');
        }
        const progressLogId = createUlid();
        await tx.habitProgressLog.create({
          data: {
            id: progressLogId,
            occurrenceId: occurrence.id,
            source,
            sourceEventId,
            value: inputValue,
            note,
            focusSessionId,
            adjusted,
            rewardEligible: !adjusted,
          },
        });
        const total = await tx.habitProgressLog.aggregate({
          where: { occurrenceId: occurrence.id },
          _sum: { value: true },
        });
        const value = total._sum.value ?? 0;
        const incompleteRequired = await tx.habitOccurrenceChecklistItem.count({
          where: { occurrenceId: occurrence.id, required: true, completedAt: null },
        });
        const targetReached =
          occurrence.habit.direction === HabitDirection.BUILD
            ? value >= occurrence.habit.targetValue
            : value <= occurrence.habit.targetValue;
        const completed = targetReached && incompleteRequired === 0;
        const updated = await tx.habitOccurrence.update({
          where: { id: occurrence.id },
          data: {
            status: completed ? HabitOccurrenceStatus.COMPLETED : HabitOccurrenceStatus.PENDING,
            statusSource: source,
            statusChangedAt: new Date(),
          },
        });
        let growthReceipt: unknown = null;
        if (occurrence.status !== HabitOccurrenceStatus.COMPLETED && updated.status === HabitOccurrenceStatus.COMPLETED) {
          if (occurrence.commitmentState === 'BREACHED' && recoveryWindowOpen(occurrence)) {
            const reversal = await reverseCommitmentPenalty(tx, userId, occurrence.id, 'RECOVERY');
            if (reversal) (updated as { commitmentState?: string }).commitmentState = 'RECOVERED';
          }
          await ensureHabitGrowthRule(tx, userId, occurrence.habitId);
          const receipt = await awardGrowthActivityWithReceipt(
            tx,
            userId,
            GrowthSourceType.HABIT,
            occurrence.habitId,
            occurrence.habit.name,
            {},
            occurrence.id,
          );
          growthReceipt = receipt;
          if (receipt) outcome.growthReceipt = receipt;
        } else if (occurrence.status === HabitOccurrenceStatus.COMPLETED && updated.status !== HabitOccurrenceStatus.COMPLETED) {
          growthReceipt = await reverseGrowthActivityWithReceipt(tx, userId, GrowthSourceType.HABIT, occurrence.id, occurrence.habit.name);
          if (growthReceipt) outcome.growthReceipt = growthReceipt;
        }
        if (tx.habitProgressLog.update) await tx.habitProgressLog.update({ where: { id: progressLogId }, data: { growthReceipt: growthReceipt ? (growthReceipt as Prisma.InputJsonValue) : Prisma.JsonNull } });
        await recordSyncChange(tx, userId, 'habitoccurrence', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'habitoccurrence.action': {
        const occurrence = await tx.habitOccurrence.findFirst({
          where: { id: mutation.entityId, habit: { userId } },
          include: { habit: true },
        });
        if (!occurrence) return notFound(mutation, 'habitoccurrence');
        const action = requiredString(payload, 'action');
        if (!['skip', 'fail', 'undo'].includes(action)) throw new InvalidSyncMutationException('Invalid habit action');
        const idempotencyKey = optionalString(payload, 'idempotencyKey');
        const markerId = idempotencyKey ? `${occurrence.id}:${idempotencyKey}` : null;
        let markerRecordId: string | null = null;
        if (markerId) {
          const existingMarker = await tx.habitProgressLog.findUnique({ where: { source_sourceEventId: { source: HabitProgressSource.MANUAL, sourceEventId: markerId } } });
          if (existingMarker) {
            if (existingMarker.note !== `${HABIT_ACTION_MARKER_PREFIX}${action}`) throw new InvalidSyncMutationException('Habit action idempotency key was reused with a different payload');
            if (existingMarker.growthReceipt) outcome.growthReceipt = existingMarker.growthReceipt;
            return null;
          }
          markerRecordId = createUlid();
          if (tx.habitProgressLog.create) await tx.habitProgressLog.create({ data: { id: markerRecordId, occurrenceId: occurrence.id, source: HabitProgressSource.MANUAL, sourceEventId: markerId, value: 0, note: `${HABIT_ACTION_MARKER_PREFIX}${action}`, adjusted: true, rewardEligible: false } });
        }
        if (action === 'undo') {
          await tx.habitProgressLog.deleteMany({
            where: {
              occurrenceId: occurrence.id,
              NOT: {
                source: HabitProgressSource.MANUAL,
                adjusted: true,
                rewardEligible: false,
                note: { startsWith: HABIT_ACTION_MARKER_PREFIX },
              },
            },
          });
          await tx.habitCheckIn.deleteMany({ where: { occurrenceId: occurrence.id } });
        }
        const updated = await tx.habitOccurrence.update({
          where: { id: occurrence.id },
          data: {
            status:
              action === 'skip'
                ? HabitOccurrenceStatus.SKIPPED
                : action === 'fail'
                  ? HabitOccurrenceStatus.FAILED
                  : HabitOccurrenceStatus.PENDING,
            statusSource: HabitProgressSource.MANUAL,
            statusChangedAt: new Date(),
          },
        });
        let growthReceipt: unknown = null;
        if (occurrence.status === HabitOccurrenceStatus.COMPLETED) {
          growthReceipt = await reverseGrowthActivityWithReceipt(tx, userId, GrowthSourceType.HABIT, occurrence.id, occurrence.habit.name);
          if (growthReceipt) outcome.growthReceipt = growthReceipt;
        }
        if (markerRecordId && tx.habitProgressLog.update) await tx.habitProgressLog.update({ where: { id: markerRecordId }, data: { growthReceipt: growthReceipt ? (growthReceipt as Prisma.InputJsonValue) : Prisma.JsonNull } });
        await recordSyncChange(tx, userId, 'habitoccurrence', updated.id, 'UPSERT', updated);
        return null;
      }
      case 'habitoccurrence.checklist': {
        const occurrenceId = requiredString(payload, 'occurrenceId');
        const item = await tx.habitOccurrenceChecklistItem.findFirst({
          where: { id: mutation.entityId, occurrenceId, occurrence: { habit: { userId } } },
          include: { occurrence: { include: { habit: true } } },
        });
        if (!item) return notFound(mutation, 'habitoccurrence');
        await tx.habitOccurrenceChecklistItem.update({
          where: { id: item.id },
          data: { completedAt: payload.completed === true ? new Date() : null },
        });
        const occurrence = item.occurrence;
        if (
          occurrence.status !== HabitOccurrenceStatus.SKIPPED &&
          occurrence.status !== HabitOccurrenceStatus.FAILED
        ) {
          const [progress, incompleteRequired] = await Promise.all([
            tx.habitProgressLog.aggregate({ where: { occurrenceId: occurrence.id }, _sum: { value: true } }),
            tx.habitOccurrenceChecklistItem.count({ where: { occurrenceId: occurrence.id, required: true, completedAt: null } }),
          ]);
          const value = progress._sum.value ?? 0;
          const targetReached =
            occurrence.habit.direction === HabitDirection.BUILD
              ? value >= occurrence.habit.targetValue
              : value <= occurrence.habit.targetValue;
          const completed = targetReached && incompleteRequired === 0;
          const updatedOccurrence = await tx.habitOccurrence.update({
            where: { id: occurrence.id },
            data: {
              status: completed ? HabitOccurrenceStatus.COMPLETED : HabitOccurrenceStatus.PENDING,
              statusSource: HabitProgressSource.MANUAL,
              statusChangedAt: new Date(),
            },
          });
          if (occurrence.status !== HabitOccurrenceStatus.COMPLETED && updatedOccurrence.status === HabitOccurrenceStatus.COMPLETED) {
            await ensureHabitGrowthRule(tx, userId, occurrence.habitId);
            const receipt = await awardGrowthActivityWithReceipt(
              tx,
              userId,
              GrowthSourceType.HABIT,
              occurrence.habitId,
              occurrence.habit.name,
              {},
              occurrence.id,
            );
            if (receipt) outcome.growthReceipt = receipt;
          } else if (occurrence.status === HabitOccurrenceStatus.COMPLETED && updatedOccurrence.status !== HabitOccurrenceStatus.COMPLETED) {
            const growthReceipt = await reverseGrowthActivityWithReceipt(
              tx,
              userId,
              GrowthSourceType.HABIT,
              occurrence.id,
              occurrence.habit.name,
            );
            if (growthReceipt) outcome.growthReceipt = growthReceipt;
          }
          await recordSyncChange(tx, userId, 'habitoccurrence', updatedOccurrence.id, 'UPSERT', updatedOccurrence);
        } else {
          await recordSyncChange(tx, userId, 'habitoccurrence', occurrence.id, 'UPSERT', occurrence);
        }
        return null;
      }
      default:
        return undefined;
    }
  }

}
