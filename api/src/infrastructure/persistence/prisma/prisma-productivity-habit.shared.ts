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


export const DAY_MS = 86_400_000;
export const MAX_HABIT_RANGE_DAYS = 366;
export const HABIT_GENERATION_LOOKBACK_DAYS = 31;

export function normalizeLocalDate(value: string): string {
  const date = value.slice(0, 10);
  parseLocalDate(date);
  return date;
}

export function weekStartDayFromPreferences(value: unknown): number {
  if (!value || typeof value !== 'object') return 1;
  const day = (value as { weekStartDay?: unknown }).weekStartDay;
  return String(day).toUpperCase() === 'SUNDAY' ? 0 : 1;
}

export async function serializableWithRetry<T>(db: PrismaService, work: (tx: any) => Promise<T>, label: string): Promise<T> {
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

export const HABIT_INCLUDE = {
  timeBlock: true,
  tags: { include: { tag: true } },
  reminders: true,
  checklistItems: { orderBy: { sortOrder: 'asc' as const } },
  taskTemplateConfig: true,
  commitmentPolicy: true,
} satisfies Prisma.HabitInclude;
