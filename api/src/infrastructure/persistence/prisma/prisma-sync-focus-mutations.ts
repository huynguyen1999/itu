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
import { commitmentDefaults, commitmentSnapshot, evaluateMissedCommitment, recoveryWindowOpen, reverseCommitmentPenalty } from '@core/application/use-cases/habit-commitments';
import { configuredCommitmentFeatureEnabled } from '@infrastructure/config/commitment-feature.adapter';
import { settleFocusGrowth } from './prisma-focus.persistence';
import { isHabitDateInRange, isHabitScheduled, localDateKey, logicalLocalDate, parseLocalDate, periodBounds, statusForValue, type HabitCalendarDefinition } from '@core/application/use-cases/habit-v2';
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
import { focusActionSemanticPayload, focusAdjustSemanticPayload, focusPayloadsEqual, focusStartSemanticPayload } from './focus-idempotency';

export class PrismaSyncFocusMutations {
  readonly kinds = ['focussession.create', 'focussession.action', 'focussession.adjust'] as const;

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
      default:
        return undefined;
    }
  }
}
