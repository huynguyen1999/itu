import {
  FocusSessionStatus,
  CommitmentPolicyLevel,
  GrowthSourceType,
  HabitOccurrenceStatus,
  HabitProgressSource,
  HabitReminderDeliveryStatus,
  HabitScheduleType,
  Prisma,
  ScheduledJobStatus,
  ScheduledJobType,
} from '@prisma/client';
import { DomainException, EntityNotFoundException } from '@core/domain/exceptions';
import { PrismaService } from './prisma.service';
import { createUlid } from './ulid';
import { PrismaFocusPersistence } from './prisma-focus.persistence';
import { utcDay } from '@core/application/use-cases/productivity-rules';
import {
  addLocalDays,
  calculateInsights,
  effectiveTarget,
  isHabitDateInRange,
  isHabitScheduled,
  localDateKey,
  localDateTimeToUtc,
  logicalLocalDate,
  parseLocalDate,
  periodBounds,
  projectHabitDays,
  statusForValue,
  type HabitDayState,
} from '@core/application/use-cases/habit-v2';
import { awardGrowthActivityWithReceipt, reverseGrowthActivityWithReceipt, GrowthAwardReceipt } from '@core/application/use-cases/growth-awards';
import { ensureHabitGrowthRule } from '@core/application/use-cases/ensure-habit-growth-rule';
import { HABIT_ACTION_MARKER_PREFIX } from './prisma-sync.helpers';
import { focusActionSemanticPayload, focusAdjustSemanticPayload, focusPayloadsEqual } from './focus-idempotency';
import { commitmentDefaults, commitmentSnapshot, evaluateMissedCommitment, recoveryWindowOpen, reverseCommitmentPenalty } from '@core/application/use-cases/habit-commitments';
import { configuredCommitmentFeatureEnabled } from '@infrastructure/config/commitment-feature.adapter';
import {
  DAY_MS,
  HABIT_GENERATION_LOOKBACK_DAYS,
  HABIT_INCLUDE,
  MAX_HABIT_RANGE_DAYS,
  normalizeLocalDate,
  serializableWithRetry,
  weekStartDayFromPreferences,
} from './prisma-productivity-habit.shared';

export class PrismaProductivityHabitCore {
  constructor(protected readonly db: PrismaService) {}

  protected async habitCalendarPreferences(db: any, userId: string): Promise<{ weekStartDay: number; dayRolloverCutoffHour: number }> {
    if (!db.userPreferences?.findUnique) return { weekStartDay: 1, dayRolloverCutoffHour: 4 };
    const preferences = await db.userPreferences.findUnique({ where: { userId }, select: { habitPreferences: true } });
    const raw = preferences?.habitPreferences as { dayRolloverCutoffHour?: unknown } | null | undefined;
    const cutoff = Number(raw?.dayRolloverCutoffHour ?? 4);
    return {
      weekStartDay: weekStartDayFromPreferences(preferences?.habitPreferences),
      dayRolloverCutoffHour: Number.isInteger(cutoff) ? Math.min(23, Math.max(0, cutoff)) : 4,
    };
  }

  protected async habitWeekStartDay(db: any, userId: string): Promise<number> {
    return (await this.habitCalendarPreferences(db, userId)).weekStartDay;
  }

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
    const reminderTimes: string[] = Array.isArray(data.reminderTimes)
      ? Array.from(new Set<string>(data.reminderTimes.filter((time: unknown) => typeof time === 'string') as string[]))
      : [];
    if (reminderTimes.length > 3) throw new DomainException('A habit may have at most 3 reminders', 'TOO_MANY_HABIT_REMINDERS', 400);
    const checklistItems = Array.isArray(data.checklistItems) ? data.checklistItems : [];
    return this.db.$transaction(async (tx) => {
      const taskTemplate = data.taskTemplate
        ? await tx.habitTaskTemplate.create({
            data: {
              id: createUlid(),
              userId,
              title: data.taskTemplate.title,
              descriptionMarkdown: data.taskTemplate.descriptionMarkdown ?? '',
              taskListId: data.taskTemplate.projectId ?? null,
              sectionId: data.taskTemplate.sectionId ?? null,
              priority: data.taskTemplate.priority ?? 'NONE',
              estimatedMinutes: data.taskTemplate.estimatedMinutes ?? null,
              tagIds: data.taskTemplate.tagIds ?? [],
              syncPolicy: data.taskTemplate.syncPolicy ?? 'NONE',
              enabled: data.taskTemplate.enabled ?? false,
            },
          })
        : null;
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
          taskTemplateId: data.taskTemplateId ?? null,
          taskTemplateConfigId: taskTemplate?.id ?? null,
          focusPresetId: data.focusPresetId ?? null,
          tags: tagIds.length ? { create: tagIds.map((tagId) => ({ tagId })) } : undefined,
          reminders: reminderTimes.length
            ? { create: reminderTimes.map((timeLocal) => ({ id: createUlid(), timeLocal, enabled: true })) }
            : undefined,
          checklistItems: checklistItems.length
            ? {
                create: checklistItems.map((item: any, index: number) => ({
                  id: createUlid(),
                  title: item.title,
                  required: item.required ?? false,
                  sortOrder: index,
                })),
              }
            : undefined,
        },
      });
      await ensureHabitGrowthRule(tx, userId, habit.id);
      await this.scheduleHabitReminders(tx, userId, habit.id);
      return tx.habit.findUniqueOrThrow({ where: { id: habit.id }, include: HABIT_INCLUDE });
    });
  }

  async updateHabit(userId: string, id: string, data: any) {
    const existing = await this.db.habit.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const tagIds = data.tagIds === undefined ? undefined : await this.availableTagIds(userId, data.tagIds);
    const reminderTimes = data.reminderTimes === undefined
      ? undefined
      : Array.from(new Set<string>((Array.isArray(data.reminderTimes) ? data.reminderTimes : []).filter((time: unknown) => typeof time === 'string')));
    if (reminderTimes && reminderTimes.length > 3) throw new DomainException('A habit may have at most 3 reminders', 'TOO_MANY_HABIT_REMINDERS', 400);
    const checklistItems = data.checklistItems === undefined
      ? undefined
      : (Array.isArray(data.checklistItems) ? data.checklistItems : []).filter((item: any) => typeof item?.title === 'string' && item.title.trim().length > 0);
    const rescheduleReminders = data.reminderTimes !== undefined || ['timezone', 'scheduleType', 'weekdays', 'intervalDays', 'timesPerPeriod', 'period', 'startDate', 'endDate', 'archived'].some((key) => data[key] !== undefined);
    return this.db.$transaction(async (tx) => {
      if (rescheduleReminders) await this.cancelHabitReminderJobs(tx, id);
      if (reminderTimes !== undefined) await tx.habitReminder.deleteMany({ where: { habitId: id } });
      if (checklistItems !== undefined) {
        await tx.habitChecklistItem.deleteMany({ where: { habitId: id } });
        if (checklistItems.length) {
          await tx.habitChecklistItem.createMany({
            data: checklistItems.map((item: any, index: number) => ({
              id: createUlid(),
              habitId: id,
              title: item.title.trim(),
              required: item.required ?? false,
              sortOrder: index,
            })),
          });
        }
      }
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
      if (reminderTimes !== undefined && reminderTimes.length) {
        await tx.habitReminder.createMany({ data: reminderTimes.map((timeLocal) => ({ id: createUlid(), habitId: id, timeLocal, enabled: true })) });
      }
      const updated = await tx.habit.findUniqueOrThrow({ where: { id }, include: HABIT_INCLUDE });
      if (rescheduleReminders && !updated.archivedAt) await this.scheduleHabitReminders(tx, userId, id);
      return updated;
    });
  }

  protected async availableTagIds(userId: string, tagIds?: unknown): Promise<string[]> {
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
    return this.db.$transaction(async (tx) => {
      const habit = await tx.habit.findFirst({ where: { id, userId }, select: { id: true } });
      if (!habit) return false;
      await this.cancelHabitReminderJobs(tx, id);
      const breached = await tx.growthCommitmentPenalty.count({ where: { userId, occurrence: { habitId: id } } });
      if (breached > 0) {
        await tx.habit.update({ where: { id }, data: { archivedAt: new Date(), version: { increment: 1 } } });
        return true;
      }
      const deleted = await tx.habit.deleteMany({ where: { id, userId } });
      return deleted.count > 0;
    });
  }

  protected async cancelHabitReminderJobs(tx: any, habitId: string) {
    const deliveries = await tx.habitReminderDelivery.findMany({
      where: { reminder: { habitId }, status: { in: [HabitReminderDeliveryStatus.SCHEDULED, HabitReminderDeliveryStatus.SNOOZED] } },
      select: { id: true, scheduledJobId: true },
    });
    const jobIds = deliveries.flatMap((delivery: { scheduledJobId: string | null }) => delivery.scheduledJobId ? [delivery.scheduledJobId] : []);
    if (jobIds.length) {
      await tx.scheduledJob.updateMany({
        where: { id: { in: jobIds }, status: { in: [ScheduledJobStatus.SCHEDULED, ScheduledJobStatus.PUBLISHING, ScheduledJobStatus.PUBLISHED] } },
        data: { status: ScheduledJobStatus.CANCELED },
      });
    }
    if (deliveries.length) {
      await tx.habitReminderDelivery.updateMany({ where: { id: { in: deliveries.map((delivery: { id: string }) => delivery.id) } }, data: { status: HabitReminderDeliveryStatus.CANCELED } });
    }
  }

  protected async scheduleHabitReminders(tx: any, userId: string, habitId: string, now = new Date()) {
    const habit = await tx.habit.findFirst({ where: { id: habitId, userId }, include: { reminders: true } });
    if (!habit || habit.archivedAt) return;
    const calendarPreferences = await this.habitCalendarPreferences(tx, userId);
    const firstDate = logicalLocalDate(now, habit.timezone ?? 'UTC', calendarPreferences.dayRolloverCutoffHour);
    const weekStartDay = calendarPreferences.weekStartDay;
    for (let offset = 0; offset < 7; offset += 1) {
      const localDate = addLocalDays(firstDate, offset);
      if (!isHabitScheduled(habit, localDate, weekStartDay)) continue;
      for (const reminder of habit.reminders.filter((item: { enabled: boolean }) => item.enabled)) {
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.timeLocal)) continue;
        const scheduledFor = localDateTimeToUtc(localDate, reminder.timeLocal, habit.timezone ?? 'UTC');
        if (scheduledFor <= now) continue;
        const existing = await tx.habitReminderDelivery.findUnique({ where: { reminderId_localDate: { reminderId: reminder.id, localDate: parseLocalDate(localDate) } } });
        if (existing && existing.status !== HabitReminderDeliveryStatus.CANCELED) continue;
        const deliveryId = existing?.id ?? createUlid();
        const jobId = createUlid();
        if (existing) {
          await tx.habitReminderDelivery.update({ where: { id: existing.id }, data: { scheduledFor, status: HabitReminderDeliveryStatus.SCHEDULED, scheduledJobId: jobId, snoozedFrom: null, deliveredAt: null } });
        } else {
          await tx.habitReminderDelivery.create({ data: { id: deliveryId, reminderId: reminder.id, localDate: parseLocalDate(localDate), scheduledFor, status: HabitReminderDeliveryStatus.SCHEDULED } });
        }
        await tx.scheduledJob.create({ data: { id: jobId, userId, type: ScheduledJobType.HABIT_REMINDER, payload: { deliveryId }, runAt: scheduledFor } });
        await tx.habitReminderDelivery.update({ where: { id: deliveryId }, data: { scheduledJobId: jobId } });
      }
    }
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
      const occurrences = await this.db.habitOccurrence.findMany({
        where: {
          habit: { userId },
          occurrenceDate: { gte: generationFrom, lte: to },
          ...(filter.habitId ? { habitId: filter.habitId } : {}),
        },
        include: { habit: true, checkIn: true, checklistItems: true },
        orderBy: [{ occurrenceDate: 'asc' }, { id: 'asc' }],
      });
      return occurrences.filter((occurrence) => occurrence.occurrenceDate >= from && occurrence.occurrenceDate <= to);
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

  async listHabitCalendar(userId: string, filter: { from: string; to: string; habitId?: string }) {
    const fromKey = normalizeLocalDate(filter.from);
    const toKey = normalizeLocalDate(filter.to);
    const from = parseLocalDate(fromKey);
    const to = parseLocalDate(toKey);
    if (to < from || to.getTime() - from.getTime() > MAX_HABIT_RANGE_DAYS * DAY_MS) {
      throw new DomainException('Habit range must be between 0 and 366 days');
    }
    const habits = await this.db.habit.findMany({
      where: {
        userId,
        archivedAt: null,
        startDate: { lte: to },
        ...(filter.habitId ? { id: filter.habitId } : {}),
      },
    });
    if (habits.length === 0) return { from: fromKey, to: toKey, days: [] };
    const calendarPreferences = await this.habitCalendarPreferences(this.db, userId);
    const stored = await this.db.habitOccurrence.findMany({
      where: {
        habitId: { in: habits.map((habit) => habit.id) },
        occurrenceDate: { gte: new Date(from.getTime() - HABIT_GENERATION_LOOKBACK_DAYS * DAY_MS), lte: to },
      },
      include: { progressLogs: true },
      orderBy: [{ occurrenceDate: 'asc' }, { id: 'asc' }],
    });
    const storedByHabit = new Map<string, any[]>();
    for (const occurrence of stored) {
      const items = storedByHabit.get(occurrence.habitId) ?? [];
      items.push(occurrence);
      storedByHabit.set(occurrence.habitId, items);
    }
    const days: Array<{ habitId: string } & HabitDayState> = [];
    for (const habit of habits) {
      const projected = projectHabitDays(
        habit,
        fromKey,
        toKey,
        storedByHabit.get(habit.id) ?? [],
        new Date(),
        calendarPreferences.weekStartDay,
        calendarPreferences.dayRolloverCutoffHour,
      );
      days.push(...projected.map((day) => ({ habitId: habit.id, ...day })));
    }
    return { from: fromKey, to: toKey, days };
  }

  async findHabitOccurrenceById(userId: string, id: string) {
    return this.db.habitOccurrence.findFirst({ where: { id } });
  }

  async upsertHabitOccurrence(userId: string, data: any) {
    const occurrenceDate = new Date(data.date);
    const habit = await this.db.habit.findFirst({ where: { id: data.habitId, userId } });
    if (!habit) throw new EntityNotFoundException('Habit', data.habitId);
    const policy = configuredCommitmentFeatureEnabled()
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
    if (!configuredCommitmentFeatureEnabled()) return { enabled: false, featureEnabled: false, policy: null };
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
    return serializableWithRetry(this.db, (tx) => evaluateMissedCommitment(tx, userId, occurrenceId, now, idempotencyKey, configuredCommitmentFeatureEnabled()), 'Commitment evaluation');
  }

  async excuseHabitCommitment(userId: string, occurrenceId: string, idempotencyKey?: string) {
    if (!configuredCommitmentFeatureEnabled()) return { enabled: false, excused: false };
    return serializableWithRetry(this.db, async (tx) => {
      const occurrence = await tx.habitOccurrence.findFirst({ where: { id: occurrenceId, habit: { userId } }, include: { commitmentPenalty: true } });
      if (!occurrence) throw new EntityNotFoundException('Habit occurrence', occurrenceId);
      if (idempotencyKey) {
        const marker = await tx.growthCommitmentPenalty.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
        if (marker) return { enabled: true, excused: true, reversal: marker.reversalEntryId ? await tx.growthLedgerEntry.findUnique({ where: { id: marker.reversalEntryId } }) : null };
      }
      const reversal = await reverseCommitmentPenalty(tx, userId, occurrenceId, 'EXCUSE', new Date(), configuredCommitmentFeatureEnabled());
      if (!reversal) await tx.habitOccurrence.update({ where: { id: occurrenceId }, data: { commitmentState: 'EXCUSED' } });
      return { enabled: true, excused: true, reversal };
    }, 'Commitment excuse');
  }

}
