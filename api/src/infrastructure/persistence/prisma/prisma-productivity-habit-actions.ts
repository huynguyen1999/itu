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
import { PrismaProductivityHabitCore } from './prisma-productivity-habit-core';


import { PrismaProductivityHabitFocus } from './prisma-productivity-habit-focus';

export class PrismaProductivityHabitActions extends PrismaProductivityHabitFocus {
  async checkIn(userId: string, occurrenceId: string, input: any) {
    return serializableWithRetry(this.db, (tx) => this.checkInInTransaction(tx, userId, occurrenceId, input), 'Habit check-in');
  }

  protected async checkInInTransaction(tx: any, userId: string, occurrenceId: string, input: any) {
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
      const commitmentResult = await evaluateMissedCommitment(tx, userId, occurrenceId, new Date(), undefined, configuredCommitmentFeatureEnabled());
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
          const reversal = await reverseCommitmentPenalty(tx, userId, occurrence.id, 'RECOVERY', new Date(), configuredCommitmentFeatureEnabled());
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

  protected async ensureHabitOccurrenceInTransaction(tx: any, userId: string, habitId: string, localDate: string) {
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
    const policy = configuredCommitmentFeatureEnabled()
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


}
