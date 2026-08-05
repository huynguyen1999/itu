import { Injectable } from '@nestjs/common';
import {
  FocusSessionStatus,
  CommitmentPolicyLevel,
  GrowthSourceType,
  HabitDirection,
  HabitOccurrenceStatus,
  HabitProgressSource,
  HabitScheduleType,
  Prisma,
  ReminderStatus,
  ScheduledJobStatus,
} from '@prisma/client';
import { DomainException, EntityNotFoundException } from '@core/domain/exceptions';
import { PrismaService } from './prisma.service';
import { createUlid } from './ulid';
import { PrismaFocusPersistence } from './prisma-focus.persistence';
import { isHabitScheduled, utcDay } from '@core/application/use-cases/productivity-rules';
import { awardGrowthActivityWithReceipt, reverseGrowthActivity, reverseGrowthActivityWithReceipt, GrowthAwardReceipt } from '@core/application/use-cases/growth-awards';
import { ensureHabitGrowthRule } from '@core/application/use-cases/ensure-habit-growth-rule';
import { HABIT_ACTION_MARKER_PREFIX } from './prisma-sync.helpers';
import { focusActionSemanticPayload, focusAdjustSemanticPayload, focusPayloadsEqual } from './focus-idempotency';
import { commitmentDefaults, commitmentFeatureEnabled, commitmentSnapshot, evaluateMissedCommitment, recoveryWindowOpen, reverseCommitmentPenalty } from '@core/application/use-cases/habit-commitments';

const DAY_MS = 86_400_000;
const MAX_HABIT_RANGE_DAYS = 366;
const HABIT_GENERATION_LOOKBACK_DAYS = 31;

async function serializableWithRetry<T>(db: PrismaService, work: (tx: any) => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await db.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2034' || attempt === 2) {
        if ((error as { code?: string })?.code === 'P2034') {
          throw new DomainException(`${label} conflicted with a concurrent update; retry the request`, 'SERIALIZATION_CONFLICT', 409);
        }
        throw error;
      }
    }
  }
  throw new DomainException(`${label} conflicted with a concurrent update; retry the request`, 'SERIALIZATION_CONFLICT', 409);
}

const HABIT_INCLUDE = {
  timeBlock: true,
  tags: { include: { tag: true } },
  reminders: true,
  checklistItems: { orderBy: { sortOrder: 'asc' as const } },
  taskTemplateConfig: true,
  commitmentPolicy: true,
} satisfies Prisma.HabitInclude;

@Injectable()
export class PrismaProductivityHabits {
  private readonly focus: PrismaFocusPersistence;

  constructor(private readonly db: PrismaService) {
    this.focus = new PrismaFocusPersistence(db);
  }

  listFocusPresets(userId: string) { return this.focus.listFocusPresets(userId); }
  findFocusPresetById(userId: string, id: string) { return this.focus.findFocusPresetById(userId, id); }
  createFocusPreset(userId: string, data: any) { return this.focus.createFocusPreset(userId, data); }
  updateFocusPreset(userId: string, id: string, data: any) { return this.focus.updateFocusPreset(userId, id, data); }
  deleteFocusPreset(userId: string, id: string) { return this.focus.deleteFocusPreset(userId, id); }
  listFocusSessions(userId: string, filter?: any) { return this.focus.listFocusSessions(userId, filter); }
  findFocusSessionById(userId: string, id: string) { return this.focus.findFocusSessionById(userId, id); }
  findActiveFocusSession(userId: string) { return this.focus.findActiveFocusSession(userId); }
  createFocusSession(userId: string, data: any) { return this.focus.createFocusSession(userId, data); }
  updateFocusSession(userId: string, id: string, data: any) { return this.focus.updateFocusSession(userId, id, data); }

  // ─── Time Blocks ─────────────────────────────────────────────────────────────

  async listTimeBlocks(userId: string) {
    return this.db.habitTimeBlock.findMany({
      where: { userId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createTimeBlock(userId: string, data: any) {
    const last = await this.db.habitTimeBlock.aggregate({ where: { userId }, _max: { sortOrder: true } });
    return this.db.habitTimeBlock.create({
      data: { id: createUlid(), userId, sortOrder: (last._max?.sortOrder ?? 0) + 1, ...data },
    });
  }

  async updateTimeBlock(userId: string, id: string, data: any) {
    return this.db.habitTimeBlock.update({ where: { id }, data });
  }

  async deleteTimeBlock(userId: string, id: string) {
    const deleted = await this.db.habitTimeBlock.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }

  // ─── Habits ──────────────────────────────────────────────────────────────────

  async listHabits(userId: string, includeArchived = false) {
    return this.db.habit.findMany({
      where: { userId, ...(includeArchived ? {} : { archivedAt: null }) },
      include: HABIT_INCLUDE,
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  async findHabitById(userId: string, id: string) {
    return this.db.habit.findFirst({ where: { id, userId }, include: HABIT_INCLUDE });
  }

  async createHabit(userId: string, data: any) {
    const tagIds = await this.availableTagIds(userId, data.tagIds);
    return this.db.$transaction(async (tx) => {
      const habit = await tx.habit.create({
        data: {
          id: createUlid(),
          userId,
          name: data.name,
          description: data.description ?? '',
          icon: data.icon ?? 'CHECK',
          color: data.color ?? 'EMERALD',
          targetType: data.targetType ?? 'BOOLEAN',
          targetValue: data.targetValue ?? 1,
          unit: data.unit ?? null,
          direction: data.direction ?? 'BUILD',
          timezone: data.timezone ?? 'UTC',
          timeBlockId: data.timeBlockId ?? null,
          scheduleType: data.scheduleType ?? 'WEEKDAYS',
          weekdays: data.weekdays ?? [],
          intervalDays: data.intervalDays ?? null,
          timesPerPeriod: data.timesPerPeriod ?? null,
          period: data.period ?? null,
          startDate: data.startDate ? new Date(data.startDate) : new Date(),
          endDate: data.endDate ? new Date(data.endDate) : null,
          difficulty: data.difficulty ?? 1,
          allowedSkips: data.allowedSkips ?? 0,
          restDays: data.restDays ?? [],
          tags: tagIds.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
        },
      });
      await ensureHabitGrowthRule(tx, userId, habit.id);
      return tx.habit.findUniqueOrThrow({ where: { id: habit.id }, include: HABIT_INCLUDE });
    });
  }

  async updateHabit(userId: string, id: string, data: any) {
    const existing = await this.db.habit.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const tagIds = data.tagIds === undefined ? undefined : await this.availableTagIds(userId, data.tagIds);
    return this.db.$transaction(async (tx) => {
      if (tagIds) {
        await tx.habitTagAssignment.deleteMany({ where: { habitId: id } });
        if (tagIds.length) {
          await tx.habitTagAssignment.createMany({ data: tagIds.map((tagId) => ({ habitId: id, tagId })) });
        }
      }
      await tx.habit.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          icon: data.icon,
          color: data.color,
          targetType: data.targetType,
          targetValue: data.targetValue,
          unit: data.unit,
          direction: data.direction,
          timezone: data.timezone,
          timeBlockId: data.timeBlockId,
          scheduleType: data.scheduleType,
          weekdays: data.weekdays,
          intervalDays: data.intervalDays,
          timesPerPeriod: data.timesPerPeriod,
          period: data.period,
          startDate: data.startDate ? new Date(data.startDate) : undefined,
          endDate: data.endDate === undefined ? undefined : data.endDate ? new Date(data.endDate) : null,
          difficulty: data.difficulty,
          allowedSkips: data.allowedSkips,
          restDays: data.restDays,
          taskTemplateId: data.taskTemplateId,
          focusPresetId: data.focusPresetId,
          archivedAt: data.archived === undefined ? undefined : data.archived ? new Date() : null,
          version: { increment: 1 },
        },
      });
      return tx.habit.findUniqueOrThrow({ where: { id }, include: HABIT_INCLUDE });
    });
  }

  private async availableTagIds(userId: string, tagIds?: unknown): Promise<string[]> {
    if (!Array.isArray(tagIds)) return [];
    const uniqueTagIds = [...new Set(tagIds.filter((tagId): tagId is string => typeof tagId === 'string'))];
    if (!uniqueTagIds.length) return [];
    const ownedTags = await this.db.taskTag.findMany({
      where: { userId, id: { in: uniqueTagIds } },
      select: { id: true },
    });
    if (ownedTags.length !== uniqueTagIds.length) {
      throw new DomainException('Habit contains an unavailable tag', 'INVALID_HABIT_TAG', 400);
    }
    return ownedTags.map((tag) => tag.id);
  }

  async deleteHabit(userId: string, id: string) {
    const breached = await this.db.growthCommitmentPenalty.count({ where: { userId, occurrence: { habitId: id } } });
    if (breached > 0) {
      await this.db.habit.updateMany({ where: { id, userId }, data: { archivedAt: new Date(), version: { increment: 1 } } });
      return true;
    }
    const deleted = await this.db.habit.deleteMany({ where: { id, userId } });
    return deleted.count > 0;
  }

  // ─── Habit Occurrences ──────────────────────────────────────────────────────

  async listHabitOccurrences(userId: string, filter?: any) {
    if (filter?.from && filter?.to) {
      const from = utcDay(new Date(filter.from));
      const to = utcDay(new Date(filter.to));
      if (to < from || to.getTime() - from.getTime() > MAX_HABIT_RANGE_DAYS * DAY_MS) {
        throw new DomainException('Habit range must be between 0 and 366 days');
      }

      const generationFrom = new Date(from.getTime() - HABIT_GENERATION_LOOKBACK_DAYS * DAY_MS);
      const habits = await this.db.habit.findMany({
        where: {
          userId,
          archivedAt: null,
          startDate: { lte: to },
          ...(filter.habitId ? { id: filter.habitId } : {}),
        },
        include: { checklistItems: true },
      });

      await this.db.$transaction(async (tx) => {
        for (const habit of habits) {
          for (let date = new Date(generationFrom); date <= to; date = new Date(date.getTime() + DAY_MS)) {
            if (!isHabitScheduled(habit, date)) continue;
            const policy = commitmentFeatureEnabled() && tx.habitCommitmentPolicy?.findFirst
              ? await tx.habitCommitmentPolicy.findFirst({ where: { habitId: habit.id, userId, enabled: true, effectiveFrom: { lte: date }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: date } }] } })
              : null;
            const occurrence = await tx.habitOccurrence.upsert({
              where: { habitId_occurrenceDate: { habitId: habit.id, occurrenceDate: date } },
              create: { id: createUlid(), habitId: habit.id, occurrenceDate: date, ...(policy ? commitmentSnapshot(policy) : {}) },
              update: {},
            });
            if (habit.checklistItems.length) {
              await tx.habitOccurrenceChecklistItem.createMany({
                data: habit.checklistItems.map((item) => ({
                  id: createUlid(),
                  occurrenceId: occurrence.id,
                  sourceItemId: item.id,
                  title: item.title,
                  required: item.required,
                  sortOrder: item.sortOrder,
                })),
                skipDuplicates: true,
              });
            }
          }
        }
      });

      const occurrences = await this.db.habitOccurrence.findMany({
        where: {
          habit: { userId },
          occurrenceDate: { gte: generationFrom, lte: to },
          ...(filter.habitId ? { habitId: filter.habitId } : {}),
        },
        include: { habit: true, checkIn: true, checklistItems: true },
        orderBy: [{ occurrenceDate: 'asc' }, { id: 'asc' }],
      });

      return occurrences.filter((occurrence) => {
        if (occurrence.habit.scheduleType !== HabitScheduleType.TIMES_PER_PERIOD) {
          return occurrence.occurrenceDate >= from && occurrence.occurrenceDate <= to;
        }
        const period = (occurrence.habit.period ?? 'WEEK').toUpperCase();
        if (period === 'MONTH') {
          return (
            occurrence.occurrenceDate.getUTCFullYear() === to.getUTCFullYear() &&
            occurrence.occurrenceDate.getUTCMonth() === to.getUTCMonth()
          );
        }
        const mondayOffset = (to.getUTCDay() + 6) % 7;
        const monday = new Date(to.getTime() - mondayOffset * DAY_MS);
        return occurrence.occurrenceDate.getTime() === monday.getTime();
      });
    }

    const where: Prisma.HabitOccurrenceWhereInput = {
      habit: { userId },
      ...(filter?.habitId ? { habitId: filter.habitId } : {}),
      ...(filter?.from || filter?.to
        ? {
            occurrenceDate: {
              ...(filter.from ? { gte: new Date(filter.from) } : {}),
              ...(filter.to ? { lte: new Date(filter.to) } : {}),
            },
          }
        : {}),
    };
    return this.db.habitOccurrence.findMany({
      where,
      include: { habit: true, checkIn: true, checklistItems: true },
      orderBy: [{ occurrenceDate: 'asc' }, { id: 'asc' }],
      ...(filter?.limit ? { take: Math.min(filter.limit, 50) } : {}),
      ...(filter?.cursor && { cursor: { id: filter.cursor }, skip: 1 }),
    });
  }

  async findHabitOccurrenceById(userId: string, id: string) {
    return this.db.habitOccurrence.findFirst({ where: { id } });
  }

  async upsertHabitOccurrence(userId: string, data: any) {
    const occurrenceDate = new Date(data.date);
    const habit = await this.db.habit.findFirst({ where: { id: data.habitId, userId } });
    if (!habit) throw new EntityNotFoundException('Habit', data.habitId);
    const policy = commitmentFeatureEnabled()
      ? await this.db.habitCommitmentPolicy.findFirst({ where: { habitId: habit.id, userId, enabled: true, effectiveFrom: { lte: occurrenceDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: occurrenceDate } }] } })
      : null;
    return this.db.habitOccurrence.upsert({
      where: { habitId_occurrenceDate: { habitId: data.habitId, occurrenceDate } },
      create: { id: createUlid(), habitId: data.habitId, occurrenceDate, status: data.status ?? 'PENDING', ...(policy ? commitmentSnapshot(policy) : {}) },
      update: { status: data.status },
    });
  }

  async getHabitCommitmentPolicy(userId: string, habitId: string) {
    const habit = await this.db.habit.findFirst({ where: { id: habitId, userId }, select: { id: true } });
    if (!habit) throw new EntityNotFoundException('Habit', habitId);
    return this.db.habitCommitmentPolicy.findUnique({ where: { habitId } });
  }

  async upsertHabitCommitmentPolicy(userId: string, habitId: string, input: any) {
    if (!commitmentFeatureEnabled()) return { enabled: false, featureEnabled: false, policy: null };
    const habit = await this.db.habit.findFirst({ where: { id: habitId, userId }, select: { id: true, timezone: true } });
    if (!habit) throw new EntityNotFoundException('Habit', habitId);
    const level = input.level === CommitmentPolicyLevel.STANDARD ? CommitmentPolicyLevel.STANDARD : input.level === CommitmentPolicyLevel.GENTLE ? CommitmentPolicyLevel.GENTLE : (() => { throw new DomainException('Commitment level must be GENTLE or STANDARD', 'INVALID_COMMITMENT_POLICY', 400); })();
    const values = commitmentDefaults(level, { ...input, timezone: input.timezone ?? habit.timezone });
    return this.db.$transaction(async (tx) => {
      const current = await tx.habitCommitmentPolicy.findUnique({ where: { habitId } });
      const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();
      if (current && effectiveFrom <= current.effectiveFrom) throw new DomainException('Commitment policy effectiveFrom must advance', 'INVALID_COMMITMENT_POLICY', 400);
      if (current) await tx.habitCommitmentPolicy.update({ where: { id: current.id }, data: { effectiveTo: effectiveFrom, enabled: false } });
      const enabled = input.enabled === undefined ? (current?.enabled ?? false) : Boolean(input.enabled);
      const policy = await tx.habitCommitmentPolicy.upsert({
        where: { habitId },
        create: { id: createUlid(), userId, habitId, enabled, effectiveFrom, version: current ? current.version + 1 : 1, ...values },
        update: { ...values, enabled, effectiveFrom, effectiveTo: null, version: { increment: 1 } },
      });
      return { featureEnabled: true, policy };
    });
  }

  async evaluateHabitCommitment(userId: string, occurrenceId: string, now = new Date(), idempotencyKey?: string) {
    return serializableWithRetry(this.db, (tx) => evaluateMissedCommitment(tx, userId, occurrenceId, now, idempotencyKey), 'Commitment evaluation');
  }

  async excuseHabitCommitment(userId: string, occurrenceId: string, idempotencyKey?: string) {
    if (!commitmentFeatureEnabled()) return { enabled: false, excused: false };
    return serializableWithRetry(this.db, async (tx) => {
      const occurrence = await tx.habitOccurrence.findFirst({ where: { id: occurrenceId, habit: { userId } }, include: { commitmentPenalty: true } });
      if (!occurrence) throw new EntityNotFoundException('Habit occurrence', occurrenceId);
      if (idempotencyKey) {
        const marker = await tx.growthCommitmentPenalty.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
        if (marker) return { enabled: true, excused: true, reversal: marker.reversalEntryId ? await tx.growthLedgerEntry.findUnique({ where: { id: marker.reversalEntryId } }) : null };
      }
      const reversal = await reverseCommitmentPenalty(tx, userId, occurrenceId, 'EXCUSE');
      if (!reversal) await tx.habitOccurrence.update({ where: { id: occurrenceId }, data: { commitmentState: 'EXCUSED' } });
      return { enabled: true, excused: true, reversal };
    }, 'Commitment excuse');
  }

  // ─── Focus Actions ──────────────────────────────────────────────────────────

  async focusAction(userId: string, sessionId: string, action: string, input: any = {}) {
    const idempotencyKey = typeof input.idempotencyKey === 'string' ? input.idempotencyKey : null;
    const eventPayload = focusActionSemanticPayload(action, input);
    try {
      return await this.db.$transaction(async (tx) => {
      const current = await tx.focusSession.findFirst({ where: { id: sessionId, userId } });
      if (!current) throw new EntityNotFoundException('Focus session', sessionId);
      if (idempotencyKey) {
        const existingEvent = await tx.focusEvent.findUnique({ where: { sessionId_idempotencyKey: { sessionId, idempotencyKey } } });
        if (existingEvent) {
          if (!focusPayloadsEqual(existingEvent.payload, eventPayload)) {
            throw new DomainException('Focus action idempotency key was reused with a different payload');
          }
          return { ...current, growthReceipt: existingEvent.growthReceipt ?? null };
        }
      }
      if (action === 'complete' && current.status === FocusSessionStatus.COMPLETED) return current;
      if (input.expectedVersion !== undefined && input.expectedVersion !== current.version) {
        throw new DomainException('Focus session has changed; refresh before retrying');
      }
      const now = new Date();
      const pauseSeconds =
        action === 'resume' && current.pausedAt
          ? Math.max(0, Math.floor((now.getTime() - new Date(current.pausedAt).getTime()) / 1000))
          : 0;

      const updateData = {
          status:
            action === 'pause'
              ? FocusSessionStatus.PAUSED
              : action === 'complete'
                ? FocusSessionStatus.COMPLETED
                : action === 'abandon'
                  ? FocusSessionStatus.ABANDONED
                  : action === 'resume'
                    ? FocusSessionStatus.ACTIVE
                    : undefined,
          pausedAt: action === 'pause' ? now : action === 'resume' ? null : undefined,
          accumulatedPauseSecs: pauseSeconds ? { increment: pauseSeconds } : undefined,
          completedAt: action === 'complete' || action === 'abandon' ? now : undefined,
          plannedSeconds: action === 'extend' ? { increment: input.extendSeconds ?? 300 } : undefined,
          ownerDeviceId: action === 'takeover' ? input.ownerDeviceId : undefined,
          customTitle: action === 'rename' ? input.customTitle : undefined,
          reflection: input.reflection,
          version: { increment: 1 },
      };
      let updated;
      if (input.expectedVersion !== undefined) {
        const result = await tx.focusSession.updateMany({
          where: { id: sessionId, userId, version: input.expectedVersion },
          data: updateData,
        });
        if (!result.count) throw new DomainException('Focus session has changed; refresh before retrying');
        updated = await tx.focusSession.findFirst({ where: { id: sessionId, userId } });
        if (!updated) throw new EntityNotFoundException('Focus session', sessionId);
      } else {
        updated = await tx.focusSession.update({ where: { id: sessionId }, data: updateData });
      }
      const focusEventId = idempotencyKey ? createUlid() : null;
      if (focusEventId) {
        await tx.focusEvent.create({ data: { id: focusEventId, sessionId, idempotencyKey, type: action, payload: eventPayload } });
      }
      const growthReceipt = await this.focus.settleFocusGrowth(tx, userId, current, updated);
      if (focusEventId && tx.focusEvent?.update) {
        await tx.focusEvent.update({ where: { id: focusEventId }, data: { growthReceipt: growthReceipt ? (growthReceipt as unknown as Prisma.InputJsonValue) : Prisma.JsonNull } });
      }
      return { ...updated, growthReceipt };
      });
    } catch (error) {
      // Two concurrent requests can both pass the read-before-write check. If
      // the unique event key is won by the other transaction, resolve this as
      // the same idempotent replay after the failed transaction has rolled back.
      const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
      if (idempotencyKey && code === 'P2002') {
        const existingEvent = await this.db.focusEvent.findUnique({
          where: { sessionId_idempotencyKey: { sessionId, idempotencyKey } },
        });
        if (existingEvent) {
          if (!focusPayloadsEqual(existingEvent.payload, eventPayload)) {
            throw new DomainException('Focus action idempotency key was reused with a different payload');
          }
          const current = await this.db.focusSession.findFirst({ where: { id: sessionId, userId } });
          if (current) return { ...current, growthReceipt: existingEvent.growthReceipt ?? null };
        }
      }
      throw error;
    }
  }

  async adjustFocus(
    userId: string,
    id: string,
    startedAt?: string,
    completedAt?: string,
    taskId?: string,
    expectedVersion?: number,
    idempotencyKey?: string,
  ) {
    const eventPayload = focusAdjustSemanticPayload(startedAt, completedAt, taskId);
    try {
      return await this.db.$transaction(async (tx) => {
        const session = await tx.focusSession.findFirst({ where: { id, userId } });
        if (!session) throw new EntityNotFoundException('Focus session', id);
        if (idempotencyKey && tx.focusEvent?.findUnique) {
          const existingEvent = await tx.focusEvent.findUnique({ where: { sessionId_idempotencyKey: { sessionId: id, idempotencyKey } } });
          if (existingEvent) {
            if (!focusPayloadsEqual(existingEvent.payload, eventPayload)) {
              throw new DomainException('Focus adjustment idempotency key was reused with a different payload');
            }
            return { ...session, growthReceipt: existingEvent.growthReceipt ?? null };
          }
        }
        if (expectedVersion !== undefined && expectedVersion !== session.version) {
          throw new DomainException('Focus session has changed; refresh before retrying');
        }
        const updateData = {
            adjustedStartedAt: startedAt ? new Date(startedAt) : undefined,
            adjustedCompletedAt: completedAt ? new Date(completedAt) : undefined,
            adjustedAt: startedAt || completedAt ? new Date() : undefined,
            taskId: taskId !== undefined ? taskId : undefined,
            version: { increment: 1 },
        };
        let updated;
        if (expectedVersion !== undefined) {
          const result = await tx.focusSession.updateMany({ where: { id, userId, version: expectedVersion }, data: updateData });
          if (!result.count) throw new DomainException('Focus session has changed; refresh before retrying');
          updated = await tx.focusSession.findFirst({ where: { id, userId } });
          if (!updated) throw new EntityNotFoundException('Focus session', id);
        } else {
          updated = await tx.focusSession.update({ where: { id }, data: updateData });
        }
        const focusEventId = idempotencyKey ? createUlid() : null;
        if (focusEventId && tx.focusEvent?.create) {
          await tx.focusEvent.create({ data: { id: focusEventId, sessionId: id, idempotencyKey: idempotencyKey!, type: 'adjust', payload: eventPayload } });
        }
        const growthReceipt = await this.focus.settleFocusGrowth(tx, userId, session, updated);
        if (focusEventId && tx.focusEvent?.update) {
          await tx.focusEvent.update({ where: { id: focusEventId }, data: { growthReceipt: growthReceipt ? (growthReceipt as unknown as Prisma.InputJsonValue) : Prisma.JsonNull } });
        }
        return { ...updated, growthReceipt };
      });
    } catch (error) {
      const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
      if (idempotencyKey && code === 'P2002' && this.db.focusEvent?.findUnique) {
        const existingEvent = await this.db.focusEvent.findUnique({ where: { sessionId_idempotencyKey: { sessionId: id, idempotencyKey } } });
        if (existingEvent) {
          if (!focusPayloadsEqual(existingEvent.payload, eventPayload)) {
            throw new DomainException('Focus adjustment idempotency key was reused with a different payload');
          }
          const current = await this.db.focusSession.findFirst({ where: { id, userId } });
          if (current) return { ...current, growthReceipt: existingEvent.growthReceipt ?? null };
        }
      }
      throw error;
    }
  }

  // ─── Habit Check-in & Actions ──────────────────────────────────────────────

  async checkIn(userId: string, occurrenceId: string, input: any) {
    return serializableWithRetry(this.db, async (tx) => {
      let occurrence = await tx.habitOccurrence.findFirst({
        where: { id: occurrenceId, habit: { userId } },
        include: { habit: true },
      });
      if (!occurrence) throw new EntityNotFoundException('Habit occurrence', occurrenceId);
      const source = input.source ?? HabitProgressSource.MANUAL;
      const sourceEventId = input.idempotencyKey ?? createUlid();
      const existingLog = await tx.habitProgressLog.findUnique({
        where: { source_sourceEventId: { source, sourceEventId } },
      });
      if (existingLog) {
        const samePayload =
          existingLog.occurrenceId === occurrenceId &&
          existingLog.value === input.value &&
          existingLog.source === source &&
          (existingLog.focusSessionId ?? null) === (input.focusSessionId ?? null) &&
          (existingLog.adjusted ?? false) === (input.adjusted ?? false) &&
          (existingLog.note ?? null) === (input.note ?? null);
        if (!samePayload) throw new DomainException('Habit check-in idempotency key was reused with a different payload');
        return { ...occurrence, growthReceipt: existingLog.growthReceipt ?? null };
      }
      // Evaluate on the server before applying a delayed check-in. A client may
      // have been offline past the deadline; recovery then reverses the penalty
      // when completion lands inside the policy recovery window.
      const commitmentResult = await evaluateMissedCommitment(tx, userId, occurrenceId);
      if (commitmentResult.breached) {
        occurrence = await tx.habitOccurrence.findFirst({ where: { id: occurrenceId, habit: { userId } }, include: { habit: true } });
        if (!occurrence) throw new EntityNotFoundException('Habit occurrence', occurrenceId);
      }
      const progressLogId = createUlid();
      if (!existingLog) {
        await tx.habitProgressLog.create({
          data: {
            id: progressLogId,
            occurrenceId,
            source,
            sourceEventId,
            value: input.value,
            note: input.note,
            focusSessionId: input.focusSessionId,
            adjusted: input.adjusted ?? false,
            rewardEligible: !(input.adjusted ?? false),
          },
        });
      }
      const total = await tx.habitProgressLog.aggregate({ where: { occurrenceId }, _sum: { value: true } });
      const value = total._sum.value ?? 0;
      const targetReached =
        occurrence.habit.direction === HabitDirection.BUILD
          ? value >= occurrence.habit.targetValue
          : value <= occurrence.habit.targetValue;
      const incompleteRequired = await tx.habitOccurrenceChecklistItem.count({
        where: { occurrenceId, required: true, completedAt: null },
      });
      const newStatus =
        targetReached && incompleteRequired === 0 ? HabitOccurrenceStatus.COMPLETED : HabitOccurrenceStatus.PENDING;

      const updated = await tx.habitOccurrence.update({
        where: { id: occurrenceId },
        data: {
          status: newStatus,
          statusSource: source,
          statusChangedAt: new Date(),
        },
        include: { habit: true, checkIn: true, checklistItems: true },
      });

      let growthReceipt: GrowthAwardReceipt | null = null;
      if (occurrence.status !== HabitOccurrenceStatus.COMPLETED && newStatus === HabitOccurrenceStatus.COMPLETED) {
        if (occurrence.commitmentState === 'BREACHED' && recoveryWindowOpen(occurrence)) {
          const reversal = await reverseCommitmentPenalty(tx, userId, occurrence.id, 'RECOVERY');
          if (reversal) (updated as { commitmentState?: string }).commitmentState = 'RECOVERED';
        }
        await ensureHabitGrowthRule(tx, userId, occurrence.habitId);
        growthReceipt = await awardGrowthActivityWithReceipt(
          tx,
          userId,
          GrowthSourceType.HABIT,
          occurrence.habitId,
          occurrence.habit.name,
          {},
          occurrence.id,
        );
      } else if (occurrence.status === HabitOccurrenceStatus.COMPLETED && newStatus !== HabitOccurrenceStatus.COMPLETED) {
        growthReceipt = await reverseGrowthActivityWithReceipt(tx, userId, GrowthSourceType.HABIT, occurrence.id, occurrence.habit.name);
      }

      if (input.idempotencyKey) {
        await tx.habitProgressLog.update({
          where: { id: progressLogId },
          data: { growthReceipt: growthReceipt ? (growthReceipt as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
        });
      }

      await tx.syncChange.create({
        data: {
          userId,
          entityType: 'habitoccurrence',
          entityId: updated.id,
          operation: 'UPSERT',
          data: updated as unknown as Prisma.InputJsonValue,
        },
      });

      return { ...updated, growthReceipt };
    }, 'Habit check-in');
  }

  async habitOccurrenceAction(userId: string, id: string, action: 'skip' | 'fail' | 'undo', idempotencyKey?: string) {
    return this.db.$transaction(async (tx) => {
      const occurrence = await tx.habitOccurrence.findFirst({
        where: { id, habit: { userId } },
        include: { habit: true },
      });
      if (!occurrence) throw new EntityNotFoundException('Habit occurrence', id);
      const markerId = idempotencyKey ? `${id}:${idempotencyKey}` : null;
      let markerRecordId: string | null = null;
      if (markerId) {
        const existingMarker = await tx.habitProgressLog.findUnique({ where: { source_sourceEventId: { source: HabitProgressSource.MANUAL, sourceEventId: markerId } } });
        if (existingMarker) {
          if (existingMarker.note !== `${HABIT_ACTION_MARKER_PREFIX}${action}`) throw new DomainException('Habit action idempotency key was reused with a different payload');
          return { ...occurrence, growthReceipt: existingMarker.growthReceipt ?? null };
        }
        markerRecordId = createUlid();
        await tx.habitProgressLog.create({
          data: {
            id: markerRecordId, occurrenceId: id, source: HabitProgressSource.MANUAL, sourceEventId: markerId,
            value: 0, note: `${HABIT_ACTION_MARKER_PREFIX}${action}`, adjusted: true, rewardEligible: false,
          },
        });
      }
      if (action === 'undo') {
        await tx.habitProgressLog.deleteMany({
          where: {
            occurrenceId: id,
            NOT: {
              source: HabitProgressSource.MANUAL,
              adjusted: true,
              rewardEligible: false,
              note: { startsWith: HABIT_ACTION_MARKER_PREFIX },
            },
          },
        });
        await tx.habitCheckIn.deleteMany({ where: { occurrenceId: id } });
      }
      const newStatus =
        action === 'skip'
          ? HabitOccurrenceStatus.SKIPPED
          : action === 'fail'
            ? HabitOccurrenceStatus.FAILED
            : HabitOccurrenceStatus.PENDING;

      const updated = await tx.habitOccurrence.update({
        where: { id },
        data: {
          status: newStatus,
          statusSource: HabitProgressSource.MANUAL,
          statusChangedAt: new Date(),
        },
        include: { habit: true, checkIn: true, checklistItems: true },
      });

      let growthReceipt: GrowthAwardReceipt | null = null;
      if (occurrence.status === HabitOccurrenceStatus.COMPLETED) {
        growthReceipt = await reverseGrowthActivityWithReceipt(tx, userId, GrowthSourceType.HABIT, occurrence.id, occurrence.habit.name);
      }

      if (markerRecordId) {
        await tx.habitProgressLog.update({
          where: { id: markerRecordId },
          data: { growthReceipt: growthReceipt ? (growthReceipt as unknown as Prisma.InputJsonValue) : Prisma.JsonNull },
        });
      }

      await tx.syncChange.create({
        data: {
          userId,
          entityType: 'habitoccurrence',
          entityId: updated.id,
          operation: 'UPSERT',
          data: updated as unknown as Prisma.InputJsonValue,
        },
      });

      return { ...updated, growthReceipt };
    });
  }

  async updateChecklistItem(userId: string, id: string, data: any) {
    return this.db.habitOccurrenceChecklistItem.update({ where: { id }, data });
  }

  async setOccurrenceChecklistItem(userId: string, occurrenceId: string, itemId: string, completed: boolean) {
    return this.db.$transaction(async (tx) => {
      const item = await tx.habitOccurrenceChecklistItem.findFirst({
        where: { id: itemId, occurrenceId, occurrence: { habit: { userId } } },
      });
      if (!item) throw new EntityNotFoundException('Habit checklist item', itemId);
      const updated = await tx.habitOccurrenceChecklistItem.update({
        where: { id: itemId },
        data: { completedAt: completed ? new Date() : null },
      });
      const occurrence = await tx.habitOccurrence.findUnique({
        where: { id: occurrenceId },
        include: { habit: true },
      });
      let growthReceipt: GrowthAwardReceipt | null = null;
      if (
        occurrence &&
        occurrence.status !== HabitOccurrenceStatus.SKIPPED &&
        occurrence.status !== HabitOccurrenceStatus.FAILED
      ) {
        const [progress, incompleteRequired] = await Promise.all([
          tx.habitProgressLog.aggregate({ where: { occurrenceId }, _sum: { value: true } }),
          tx.habitOccurrenceChecklistItem.count({ where: { occurrenceId, required: true, completedAt: null } }),
        ]);
        const value = progress._sum.value ?? 0;
        const targetReached =
          occurrence.habit.direction === HabitDirection.BUILD
            ? value >= occurrence.habit.targetValue
            : value <= occurrence.habit.targetValue;
        const newStatus =
          targetReached && !incompleteRequired ? HabitOccurrenceStatus.COMPLETED : HabitOccurrenceStatus.PENDING;

        const updatedOccurrence = await tx.habitOccurrence.update({
          where: { id: occurrenceId },
          data: {
            status: newStatus,
            statusSource: HabitProgressSource.MANUAL,
            statusChangedAt: new Date(),
          },
        });

        if (occurrence.status !== HabitOccurrenceStatus.COMPLETED && newStatus === HabitOccurrenceStatus.COMPLETED) {
          await ensureHabitGrowthRule(tx, userId, occurrence.habitId);
          growthReceipt = await awardGrowthActivityWithReceipt(
            tx,
            userId,
            GrowthSourceType.HABIT,
            occurrence.habitId,
            occurrence.habit.name,
            {},
            occurrence.id,
          );
        } else if (occurrence.status === HabitOccurrenceStatus.COMPLETED && newStatus !== HabitOccurrenceStatus.COMPLETED) {
          growthReceipt = await reverseGrowthActivityWithReceipt(
            tx,
            userId,
            GrowthSourceType.HABIT,
            occurrence.id,
            occurrence.habit.name,
          );
        }

        await tx.syncChange.create({
          data: {
            userId,
            entityType: 'habitoccurrence',
            entityId: updatedOccurrence.id,
            operation: 'UPSERT',
            data: updatedOccurrence as unknown as Prisma.InputJsonValue,
          },
        });
      }
      return { ...updated, growthReceipt };
    });
  }

  private computeStats(habit: { allowedSkips: number }, occurrences: any[]) {
    let currentStreak = 0;
    let skipBudget = habit.allowedSkips;
    for (const item of occurrences) {
      if (item.status === HabitOccurrenceStatus.COMPLETED) currentStreak += 1;
      else if (item.status === HabitOccurrenceStatus.SKIPPED && skipBudget > 0) {
        currentStreak += 1;
        skipBudget -= 1;
      } else break;
    }
    let bestStreak = 0;
    let running = 0;
    for (const item of [...occurrences].reverse()) {
      if (item.status === HabitOccurrenceStatus.COMPLETED) running += 1;
      else if (item.status === HabitOccurrenceStatus.SKIPPED) running += 1;
      else running = 0;
      bestStreak = Math.max(bestStreak, running);
    }
    const completed = occurrences.filter((item) => item.status === HabitOccurrenceStatus.COMPLETED).length;
    const eligible = occurrences.filter((item) => item.status !== HabitOccurrenceStatus.SKIPPED).length;
    const focusedMinutes = occurrences
      .flatMap((item) => item.progressLogs)
      .filter((log) => log.source === HabitProgressSource.FOCUS_SESSION)
      .reduce((sum, log) => sum + log.value, 0);
    return {
      streak: currentStreak,
      currentStreak,
      bestStreak,
      successRate: eligible ? completed / eligible : 0,
      focusedMinutes,
      completed,
      failed: occurrences.filter((item) => item.status === HabitOccurrenceStatus.FAILED).length,
      skipped: occurrences.filter((item) => item.status === HabitOccurrenceStatus.SKIPPED).length,
    };
  }

  async habitStats(userId: string, habitId: string) {
    const habit = await this.db.habit.findFirst({ where: { id: habitId, userId } });
    if (!habit) throw new EntityNotFoundException('Habit', habitId);
    const occurrences = await this.db.habitOccurrence.findMany({
      where: { habitId },
      include: { progressLogs: true },
      orderBy: { occurrenceDate: 'desc' },
      take: 366,
    });
    return this.computeStats(habit, occurrences);
  }

  async listHabitStats(userId: string, habitIds: string[]) {
    if (habitIds.length === 0) return {};
    const habits = await this.db.habit.findMany({ where: { id: { in: habitIds }, userId } });
    const occurrences = await this.db.habitOccurrence.findMany({
      where: { habitId: { in: habitIds } },
      include: { progressLogs: true },
      orderBy: { occurrenceDate: 'desc' },
    });
    const byHabit = new Map<string, any[]>();
    for (const occ of occurrences) {
      const list = byHabit.get(occ.habitId) ?? [];
      list.push(occ);
      byHabit.set(occ.habitId, list);
    }
    const result: Record<string, any> = {};
    for (const habit of habits) {
      const occs = (byHabit.get(habit.id) ?? []).slice(0, 366);
      result[habit.id] = this.computeStats(habit, occs);
    }
    return result;
  }
}
