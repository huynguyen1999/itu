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


import { PrismaProductivityHabitActions } from './prisma-productivity-habit-actions';

export class PrismaProductivityHabitInsights extends PrismaProductivityHabitActions {
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

