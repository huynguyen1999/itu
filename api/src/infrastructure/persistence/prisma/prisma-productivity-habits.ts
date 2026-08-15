import { Injectable } from '@nestjs/common';
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
import { commitmentDefaults, commitmentFeatureEnabled, commitmentSnapshot, evaluateMissedCommitment, recoveryWindowOpen, reverseCommitmentPenalty } from '@core/application/use-cases/habit-commitments';

const DAY_MS = 86_400_000;
const MAX_HABIT_RANGE_DAYS = 366;
const HABIT_GENERATION_LOOKBACK_DAYS = 31;

function normalizeLocalDate(value: string): string {
  const date = value.slice(0, 10);
  parseLocalDate(date);
  return date;
}

function weekStartDayFromPreferences(value: unknown): number {
  if (!value || typeof value !== 'object') return 1;
  const day = (value as { weekStartDay?: unknown }).weekStartDay;
  return String(day).toUpperCase() === 'SUNDAY' ? 0 : 1;
}

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

  private async habitCalendarPreferences(db: any, userId: string): Promise<{ weekStartDay: number; dayRolloverCutoffHour: number }> {
    if (!db.userPreferences?.findUnique) return { weekStartDay: 1, dayRolloverCutoffHour: 4 };
    const preferences = await db.userPreferences.findUnique({ where: { userId }, select: { habitPreferences: true } });
    const raw = preferences?.habitPreferences as { dayRolloverCutoffHour?: unknown } | null | undefined;
    const cutoff = Number(raw?.dayRolloverCutoffHour ?? 4);
    return {
      weekStartDay: weekStartDayFromPreferences(preferences?.habitPreferences),
      dayRolloverCutoffHour: Number.isInteger(cutoff) ? Math.min(23, Math.max(0, cutoff)) : 4,
    };
  }

  private async habitWeekStartDay(db: any, userId: string): Promise<number> {
    return (await this.habitCalendarPreferences(db, userId)).weekStartDay;
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

  private async cancelHabitReminderJobs(tx: any, habitId: string) {
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

  private async scheduleHabitReminders(tx: any, userId: string, habitId: string, now = new Date()) {
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
    return serializableWithRetry(this.db, (tx) => this.checkInInTransaction(tx, userId, occurrenceId, input), 'Habit check-in');
  }

  private async checkInInTransaction(tx: any, userId: string, occurrenceId: string, input: any) {
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
        const total = await tx.habitProgressLog.aggregate({ where: { occurrenceId }, _sum: { value: true } });
        const value = total._sum.value ?? 0;
        const targetValue = effectiveTarget(occurrence.habit);
        return {
          ...occurrence,
          value,
          targetValue,
          progressRatio: Math.min(1, value / targetValue),
          growthReceipt: existingLog.growthReceipt ?? null,
        };
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
      const occurrenceDate = localDateKey(occurrence.occurrenceDate ?? new Date());
      const calendarPreferences = await this.habitCalendarPreferences(tx, userId);
      const weekStartDay = calendarPreferences.weekStartDay;
      const periodEnd = occurrence.habit.scheduleType === HabitScheduleType.TIMES_PER_PERIOD
        ? periodBounds(occurrenceDate, String(occurrence.habit.period ?? 'WEEK').toUpperCase() === 'MONTH' ? 'MONTH' : 'WEEK', weekStartDay).end
        : occurrenceDate;
      const closed = logicalLocalDate(new Date(), occurrence.habit.timezone ?? 'UTC', calendarPreferences.dayRolloverCutoffHour) > periodEnd;
      const projectedStatus = statusForValue(occurrence.habit, value, undefined, closed);
      const targetReached = projectedStatus === 'COMPLETED';
      const failed = projectedStatus === 'FAILED';
      const incompleteRequired = await tx.habitOccurrenceChecklistItem.count({
        where: { occurrenceId, required: true, completedAt: null },
      });
      const newStatus = failed
        ? HabitOccurrenceStatus.FAILED
        : targetReached && incompleteRequired === 0 ? HabitOccurrenceStatus.COMPLETED : HabitOccurrenceStatus.PENDING;

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

      return {
        ...updated,
        value,
        targetValue: effectiveTarget(occurrence.habit),
        progressRatio: Math.min(1, value / effectiveTarget(occurrence.habit)),
        growthReceipt,
      };
  }

  private async ensureHabitOccurrenceInTransaction(tx: any, userId: string, habitId: string, localDate: string) {
    const habit = await tx.habit.findFirst({ where: { id: habitId, userId }, include: { checklistItems: true } });
    if (!habit) throw new EntityNotFoundException('Habit', habitId);
    if (!isHabitDateInRange(habit, localDate)) throw new DomainException('Habit is not active on this date', 'HABIT_NOT_SCHEDULED', 400);
    const weekStartDay = await this.habitWeekStartDay(tx, userId);
    const bucketDate = habit.scheduleType === HabitScheduleType.TIMES_PER_PERIOD
      ? periodBounds(localDate, String(habit.period ?? 'WEEK').toUpperCase() === 'MONTH' ? 'MONTH' : 'WEEK', weekStartDay).start
      : localDate;
    if (!isHabitScheduled(habit, bucketDate, weekStartDay)) throw new DomainException('Habit is not scheduled for this date', 'HABIT_NOT_SCHEDULED', 400);
    const occurrenceDate = new Date(`${bucketDate}T00:00:00.000Z`);
    const existing = await tx.habitOccurrence.findUnique({
      where: { habitId_occurrenceDate: { habitId, occurrenceDate } },
      include: { habit: true, checkIn: true, checklistItems: true },
    });
    if (existing) return existing;
    const policy = commitmentFeatureEnabled()
      ? await tx.habitCommitmentPolicy.findFirst({ where: { habitId, userId, enabled: true, effectiveFrom: { lte: occurrenceDate }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: occurrenceDate } }] } })
      : null;
    const occurrence = await tx.habitOccurrence.create({
      data: {
        id: createUlid(),
        habitId,
        occurrenceDate,
        ...(policy ? commitmentSnapshot(policy) : {}),
        checklistItems: habit.checklistItems.length
          ? { create: habit.checklistItems.map((item: any) => ({ id: createUlid(), sourceItemId: item.id, title: item.title, required: item.required, sortOrder: item.sortOrder })) }
          : undefined,
      },
      include: { habit: true, checkIn: true, checklistItems: true },
    });
    return occurrence;
  }

  async checkInByDate(userId: string, habitId: string, localDate: string, input: any) {
    const date = normalizeLocalDate(localDate);
    return serializableWithRetry(this.db, async (tx) => {
      const occurrence = await this.ensureHabitOccurrenceInTransaction(tx, userId, habitId, date);
      const result = await this.checkInInTransaction(tx, userId, occurrence.id, input);
      return { ...result, habitId, occurrenceId: result.id, localDate: date };
    }, 'Habit progress');
  }

  async habitOccurrenceActionByDate(
    userId: string,
    habitId: string,
    localDate: string,
    action: 'skip' | 'fail' | 'undo',
    idempotencyKey?: string,
  ) {
    const date = normalizeLocalDate(localDate);
    return serializableWithRetry(this.db, async (tx) => {
      const occurrence = await this.ensureHabitOccurrenceInTransaction(tx, userId, habitId, date);
      return this.habitOccurrenceActionInTransaction(tx, userId, occurrence.id, action, idempotencyKey);
    }, 'Habit occurrence action');
  }

  async listHabitProgress(userId: string, habitId: string, filter: { from?: string; to?: string } = {}) {
    const from = filter.from ? normalizeLocalDate(filter.from) : undefined;
    const to = filter.to ? normalizeLocalDate(filter.to) : undefined;
    return this.db.habitProgressLog.findMany({
      where: {
        occurrence: {
          habitId,
          habit: { userId },
          ...(filter.from || filter.to
            ? {
                occurrenceDate: {
                  ...(from ? { gte: parseLocalDate(from) } : {}),
                  ...(to ? { lte: parseLocalDate(to) } : {}),
                },
              }
            : {}),
        },
      },
      orderBy: { recordedAt: 'desc' },
    });
  }

  async deleteHabitProgress(userId: string, progressId: string) {
    return serializableWithRetry(this.db, async (tx) => {
      const log = await tx.habitProgressLog.findFirst({
        where: { id: progressId, occurrence: { habit: { userId } } },
        include: { occurrence: { include: { habit: true } } },
      });
      if (!log) return null;
      if (log.note?.startsWith(HABIT_ACTION_MARKER_PREFIX)) {
        throw new DomainException('Habit action markers cannot be deleted');
      }
      const before = log.occurrence;
      await tx.habitProgressLog.delete({ where: { id: progressId } });
      const total = await tx.habitProgressLog.aggregate({ where: { occurrenceId: before.id }, _sum: { value: true } });
      const value = total._sum.value ?? 0;
      const date = localDateKey(before.occurrenceDate);
      const calendarPreferences = await this.habitCalendarPreferences(tx, userId);
      const weekStartDay = calendarPreferences.weekStartDay;
      const periodEnd = before.habit.scheduleType === HabitScheduleType.TIMES_PER_PERIOD
        ? periodBounds(date, String(before.habit.period ?? 'WEEK').toUpperCase() === 'MONTH' ? 'MONTH' : 'WEEK', weekStartDay).end
        : date;
      const projectedStatus = statusForValue(
        before.habit,
        value,
        undefined,
        logicalLocalDate(new Date(), before.habit.timezone ?? 'UTC', calendarPreferences.dayRolloverCutoffHour) > periodEnd,
      );
      const required = await tx.habitOccurrenceChecklistItem.count({ where: { occurrenceId: before.id, required: true, completedAt: null } });
      const newStatus = projectedStatus === 'FAILED'
        ? HabitOccurrenceStatus.FAILED
        : projectedStatus === 'COMPLETED' && required === 0 ? HabitOccurrenceStatus.COMPLETED : HabitOccurrenceStatus.PENDING;
      const updated = await tx.habitOccurrence.update({
        where: { id: before.id },
        data: { status: newStatus, statusSource: HabitProgressSource.MANUAL, statusChangedAt: new Date() },
        include: { habit: true, checkIn: true, checklistItems: true },
      });
      let growthReceipt: GrowthAwardReceipt | null = null;
      if (before.status !== HabitOccurrenceStatus.COMPLETED && newStatus === HabitOccurrenceStatus.COMPLETED) {
        await ensureHabitGrowthRule(tx, userId, before.habitId);
        growthReceipt = await awardGrowthActivityWithReceipt(tx, userId, GrowthSourceType.HABIT, before.habitId, before.habit.name, {}, before.id);
      } else if (before.status === HabitOccurrenceStatus.COMPLETED && newStatus !== HabitOccurrenceStatus.COMPLETED) {
        growthReceipt = await reverseGrowthActivityWithReceipt(tx, userId, GrowthSourceType.HABIT, before.id, before.habit.name);
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
      return {
        ...updated,
        progressLogId: progressId,
        value,
        targetValue: effectiveTarget(before.habit),
        progressRatio: Math.min(1, value / effectiveTarget(before.habit)),
        occurrence: updated,
        growthReceipt,
      };
    }, 'Habit progress deletion');
  }

  async habitOccurrenceAction(userId: string, id: string, action: 'skip' | 'fail' | 'undo', idempotencyKey?: string) {
    return serializableWithRetry(this.db, (tx) => this.habitOccurrenceActionInTransaction(tx, userId, id, action, idempotencyKey), 'Habit occurrence action');
  }

  private async habitOccurrenceActionInTransaction(tx: any, userId: string, id: string, action: 'skip' | 'fail' | 'undo', idempotencyKey?: string) {
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
          const total = await tx.habitProgressLog.aggregate({ where: { occurrenceId: id }, _sum: { value: true } });
          const value = total._sum.value ?? 0;
          const targetValue = effectiveTarget(occurrence.habit);
          return {
            ...occurrence,
            value,
            targetValue,
            progressRatio: Math.min(1, value / targetValue),
            growthReceipt: existingMarker.growthReceipt ?? null,
          };
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
        const occurrenceDate = localDateKey(occurrence.occurrenceDate);
        const calendarPreferences = await this.habitCalendarPreferences(tx, userId);
        const weekStartDay = calendarPreferences.weekStartDay;
        const periodEnd = occurrence.habit.scheduleType === HabitScheduleType.TIMES_PER_PERIOD
          ? periodBounds(occurrenceDate, String(occurrence.habit.period ?? 'WEEK').toUpperCase() === 'MONTH' ? 'MONTH' : 'WEEK', weekStartDay).end
          : occurrenceDate;
        const projectedStatus = statusForValue(
          occurrence.habit,
          value,
          undefined,
          logicalLocalDate(new Date(), occurrence.habit.timezone ?? 'UTC', calendarPreferences.dayRolloverCutoffHour) > periodEnd,
        );
        const newStatus =
          projectedStatus === 'FAILED'
            ? HabitOccurrenceStatus.FAILED
            : projectedStatus === 'COMPLETED' && !incompleteRequired ? HabitOccurrenceStatus.COMPLETED : HabitOccurrenceStatus.PENDING;

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

  async habitStats(userId: string, habitId: string) {
    const habit = await this.db.habit.findFirst({ where: { id: habitId, userId } });
    if (!habit) throw new EntityNotFoundException('Habit', habitId);
    const calendarPreferences = await this.habitCalendarPreferences(this.db, userId);
    const to = logicalLocalDate(new Date(), habit.timezone ?? 'UTC', calendarPreferences.dayRolloverCutoffHour);
    const insights = await this.habitInsights(userId, habitId, { from: addLocalDays(to, -365), to });
    const focused = await this.db.habitProgressLog.aggregate({
      where: { occurrence: { habitId }, source: HabitProgressSource.FOCUS_SESSION },
      _sum: { value: true },
    });
    return {
      ...insights,
      streak: insights.currentStreak,
      successRate: insights.last30Rate,
      focusedMinutes: focused._sum.value ?? 0,
      missed: insights.missed,
      failed: insights.missed,
      total: insights.heatmap.length,
    };
  }

  async habitInsights(userId: string, habitId: string, filter: { from: string; to: string }) {
    const habit = await this.db.habit.findFirst({ where: { id: habitId, userId } });
    if (!habit) throw new EntityNotFoundException('Habit', habitId);
    const fromKey = normalizeLocalDate(filter.from);
    const toKey = normalizeLocalDate(filter.to);
    const from = parseLocalDate(fromKey);
    const to = parseLocalDate(toKey);
    const calendarPreferences = await this.habitCalendarPreferences(this.db, userId);
    if (to < from || to.getTime() - from.getTime() > MAX_HABIT_RANGE_DAYS * DAY_MS) {
      throw new DomainException('Habit range must be between 0 and 366 days');
    }
    const occurrences = await this.db.habitOccurrence.findMany({
      where: {
        habitId,
        occurrenceDate: { gte: new Date(from.getTime() - HABIT_GENERATION_LOOKBACK_DAYS * DAY_MS), lte: to },
      },
      include: { progressLogs: true },
      orderBy: { occurrenceDate: 'asc' },
    });
    return calculateInsights(
      habit,
      projectHabitDays(habit, fromKey, toKey, occurrences, new Date(), calendarPreferences.weekStartDay, calendarPreferences.dayRolloverCutoffHour),
      toKey,
    );
  }

  async habitReminderAction(userId: string, deliveryId: string, action: 'snooze' | 'dismiss' | 'complete', remindAt?: string) {
    const requestedAt = remindAt ? new Date(remindAt) : new Date(Date.now() + 15 * 60 * 1000);
    if (action === 'snooze' && (Number.isNaN(requestedAt.getTime()) || requestedAt <= new Date())) {
      throw new DomainException('Habit reminder snooze time must be in the future', 'INVALID_REMINDER_TIME', 400);
    }
    return this.db.$transaction(async (tx) => {
      const delivery = await tx.habitReminderDelivery.findFirst({
        where: { id: deliveryId, reminder: { habit: { userId } } },
        include: { reminder: { include: { habit: true } } },
      });
      if (!delivery) throw new EntityNotFoundException('Habit reminder delivery', deliveryId);
      if (!([HabitReminderDeliveryStatus.SCHEDULED, HabitReminderDeliveryStatus.SNOOZED, HabitReminderDeliveryStatus.DELIVERED] as HabitReminderDeliveryStatus[]).includes(delivery.status)) {
        return delivery;
      }
      if (action === 'complete') {
        if (String(delivery.reminder.habit.targetType).toUpperCase() !== 'BOOLEAN') {
          throw new DomainException('Only BOOLEAN habits can be completed from a reminder', 'HABIT_REMINDER_REQUIRES_LOG', 400);
        }
        const occurrence = await this.ensureHabitOccurrenceInTransaction(tx, userId, delivery.reminder.habitId, localDateKey(delivery.localDate));
        const result = await this.checkInInTransaction(tx, userId, occurrence.id, {
          value: effectiveTarget(delivery.reminder.habit),
          source: HabitProgressSource.MANUAL,
          idempotencyKey: `habit-reminder:${delivery.id}:complete`,
        });
        if (delivery.scheduledJobId) {
          await tx.scheduledJob.updateMany({
            where: { id: delivery.scheduledJobId, status: { notIn: [ScheduledJobStatus.COMPLETED, ScheduledJobStatus.CANCELED] } },
            data: { status: ScheduledJobStatus.CANCELED },
          });
        }
        await tx.notification.updateMany({ where: { habitReminderDeliveryId: delivery.id }, data: { readAt: new Date() } });
        const updatedDelivery = await tx.habitReminderDelivery.update({
          where: { id: delivery.id },
          data: { status: HabitReminderDeliveryStatus.DISMISSED, scheduledJobId: null },
        });
        await this.scheduleHabitReminders(tx, userId, delivery.reminder.habitId);
        return { ...result, delivery: updatedDelivery };
      }
      if (delivery.scheduledJobId) {
        await tx.scheduledJob.updateMany({
          where: { id: delivery.scheduledJobId, status: { notIn: [ScheduledJobStatus.COMPLETED, ScheduledJobStatus.CANCELED] } },
          data: { status: ScheduledJobStatus.CANCELED },
        });
      }
      if (action === 'dismiss') {
        await tx.notification.updateMany({ where: { habitReminderDeliveryId: delivery.id }, data: { readAt: new Date() } });
        const updatedDelivery = await tx.habitReminderDelivery.update({ where: { id: delivery.id }, data: { status: HabitReminderDeliveryStatus.DISMISSED, scheduledJobId: null } });
        await this.scheduleHabitReminders(tx, userId, delivery.reminder.habitId);
        return updatedDelivery;
      }
      const jobId = createUlid();
      await tx.scheduledJob.create({
        data: { id: jobId, userId, type: ScheduledJobType.HABIT_REMINDER, payload: { deliveryId: delivery.id }, runAt: requestedAt },
      });
      await tx.notification.updateMany({ where: { habitReminderDeliveryId: delivery.id }, data: { readAt: null } });
      return tx.habitReminderDelivery.update({
        where: { id: delivery.id },
        data: {
          status: HabitReminderDeliveryStatus.SNOOZED,
          scheduledFor: requestedAt,
          scheduledJobId: jobId,
          snoozedFrom: delivery.scheduledFor,
          deliveredAt: null,
        },
      });
    });
  }

  async listHabitStats(userId: string, habitIds: string[]) {
    if (habitIds.length === 0) return {};
    const habits = await this.db.habit.findMany({ where: { id: { in: habitIds }, userId } });
    const now = new Date();
    const occurrences = await this.db.habitOccurrence.findMany({
      where: {
        habitId: { in: habitIds },
        occurrenceDate: { gte: new Date(now.getTime() - 60 * DAY_MS), lte: new Date(now.getTime() + DAY_MS) },
      },
      include: { progressLogs: true },
      orderBy: { occurrenceDate: 'asc' },
    });
    const byHabit = new Map<string, any[]>();
    for (const occ of occurrences) {
      const list = byHabit.get(occ.habitId) ?? [];
      list.push(occ);
      byHabit.set(occ.habitId, list);
    }
    const result: Record<string, any> = {};
    const calendarPreferences = await this.habitCalendarPreferences(this.db, userId);
    for (const habit of habits) {
      const to = logicalLocalDate(now, habit.timezone ?? 'UTC', calendarPreferences.dayRolloverCutoffHour);
      const from = addLocalDays(to, -29);
      const states = projectHabitDays(habit, from, to, byHabit.get(habit.id) ?? [], now, calendarPreferences.weekStartDay, calendarPreferences.dayRolloverCutoffHour);
      const insights = calculateInsights(habit, states, to);
      result[habit.id] = {
        streak: insights.currentStreak,
        currentStreak: insights.currentStreak,
        bestStreak: insights.bestStreak,
        successRate: insights.last30Rate,
        focusedMinutes: (byHabit.get(habit.id) ?? [])
          .flatMap((occurrence) => occurrence.progressLogs)
          .filter((log) => log.source === HabitProgressSource.FOCUS_SESSION)
          .reduce((sum, log) => sum + log.value, 0),
        completed: insights.completed,
        missed: insights.missed,
        failed: insights.missed,
        skipped: insights.skipped,
      };
    }
    return result;
  }
}
