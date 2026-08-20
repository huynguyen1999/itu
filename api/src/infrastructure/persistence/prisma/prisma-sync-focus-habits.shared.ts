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

export function syncedHabitStatus(
  occurrence: { occurrenceDate: Date; habit: any },
  value: number,
  weekStartDay = 1,
  cutoffHour = 0,
) {
  const habit = occurrence.habit as HabitCalendarDefinition;
  const date = localDateKey(occurrence.occurrenceDate);
  const periodEnd = habit.scheduleType === HabitScheduleType.TIMES_PER_PERIOD
    ? periodBounds(date, String(habit.period ?? 'WEEK').toUpperCase() === 'MONTH' ? 'MONTH' : 'WEEK', weekStartDay).end
    : date;
  const closed = logicalLocalDate(new Date(), habit.timezone ?? 'UTC', cutoffHour) > periodEnd;
  return statusForValue(habit, value, undefined, closed);
}

export async function habitSyncPreferences(tx: any, userId: string) {
  const record = tx.userPreferences?.findUnique
    ? await tx.userPreferences.findUnique({ where: { userId }, select: { habitPreferences: true } })
    : null;
  const preferences = record?.habitPreferences as { weekStartDay?: unknown; dayRolloverCutoffHour?: unknown } | null | undefined;
  const cutoff = Number(preferences?.dayRolloverCutoffHour ?? 4);
  return {
    weekStartDay: String(preferences?.weekStartDay).toUpperCase() === 'SUNDAY' ? 0 : 1,
    cutoffHour: Number.isInteger(cutoff) ? Math.min(23, Math.max(0, cutoff)) : 4,
  };
}

export async function ensureSyncedHabitOccurrence(tx: any, userId: string, habitId: string, localDate: string) {
  const habit = await tx.habit.findFirst({ where: { id: habitId, userId }, include: { checklistItems: true } });
  if (!habit) throw new InvalidSyncMutationException('Habit is unavailable');
  if (!isHabitDateInRange(habit, localDate)) throw new InvalidSyncMutationException('Habit is not active on this date');
  const preferences = await habitSyncPreferences(tx, userId);
  const bucketDate = habit.scheduleType === HabitScheduleType.TIMES_PER_PERIOD
    ? periodBounds(localDate, String(habit.period ?? 'WEEK').toUpperCase() === 'MONTH' ? 'MONTH' : 'WEEK', preferences.weekStartDay).start
    : localDate;
  if (!isHabitScheduled(habit, bucketDate, preferences.weekStartDay)) throw new InvalidSyncMutationException('Habit is not scheduled for this date');
  const occurrenceDate = parseLocalDate(bucketDate);
  const existing = await tx.habitOccurrence.findUnique({
    where: { habitId_occurrenceDate: { habitId, occurrenceDate } },
    include: { habit: true },
  });
  if (existing) return existing;
  const policy = configuredCommitmentFeatureEnabled()
    ? await tx.habitCommitmentPolicy.findFirst({
        where: {
          habitId,
          userId,
          enabled: true,
          effectiveFrom: { lte: occurrenceDate },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: occurrenceDate } }],
        },
      })
    : null;
  return tx.habitOccurrence.create({
    data: {
      id: createUlid(),
      habitId,
      occurrenceDate,
      ...(policy ? commitmentSnapshot(policy) : {}),
      checklistItems: habit.checklistItems.length
        ? { create: habit.checklistItems.map((item: any) => ({ id: createUlid(), sourceItemId: item.id, title: item.title, required: item.required, sortOrder: item.sortOrder })) }
        : undefined,
    },
    include: { habit: true },
  });
}
