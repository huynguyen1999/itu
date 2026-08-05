import { CommitmentPenaltyState, CommitmentPolicyLevel, GrowthCurrency, GrowthLedgerKind, HabitCommitmentState, HabitOccurrenceStatus } from '@prisma/client';
import { DomainException, EntityNotFoundException } from '@core/domain/exceptions';
import { growthLevelProgress } from './growth-rules';
import { createUlid } from '@core/application/ulid';

type Tx = Record<string, any>;

export const COMMITMENT_CONFIG = {
  featureFlag: 'COMMITMENT_FEATURE_ENABLED',
  gentleRate: 0.5,
  standardRate: 1,
  maxRecoveryWindowMinutes: 14_400,
} as const;
const DAY_MS = 86_400_000;

export function commitmentFeatureEnabled(): boolean {
  return (process.env[COMMITMENT_CONFIG.featureFlag] ?? '').trim().toLowerCase() === 'true';
}

function localDateKey(instant: Date, formatter: Intl.DateTimeFormat): string {
  const parts = formatter.formatToParts(instant).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function timezoneOffsetMs(instant: Date, formatter: Intl.DateTimeFormat): number {
  const parts = formatter.formatToParts(instant).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)) - instant.getTime();
}

export function localOccurrenceStartUtc(occurrenceDate: Date, timezone: string): Date {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    formatter.format(occurrenceDate);
  } catch {
    throw new DomainException(`Invalid commitment timezone: ${timezone}`, 'INVALID_COMMITMENT_POLICY', 400);
  }
  const utcDay = Date.UTC(occurrenceDate.getUTCFullYear(), occurrenceDate.getUTCMonth(), occurrenceDate.getUTCDate());
  const targetDate = new Date(utcDay).toISOString().slice(0, 10);

  // Find the first instant whose local date is the occurrence date. This handles
  // DST transitions at midnight (where local 00:00 does not exist) without a
  // timezone database or dependency. Precision is one second, matching the
  // occurrence/grace-minute contract.
  let low = utcDay - 2 * DAY_MS;
  let high = utcDay + 2 * DAY_MS;
  while (high - low > 1_000) {
    const middle = low + Math.floor((high - low) / 2);
    if (localDateKey(new Date(middle), formatter) >= targetDate) high = middle;
    else low = middle + 1;
  }
  const candidate = new Date(Math.floor(high / 1_000) * 1_000);
  if (localDateKey(candidate, formatter) === targetDate) return candidate;

  // A skipped calendar day (for example Pacific/Apia 2011-12-30) has no exact
  // midnight. Keep a deterministic fallback rather than silently using UTC.
  const fallback = new Date(utcDay);
  return new Date(utcDay - timezoneOffsetMs(fallback, formatter));
}

export function commitmentDefaults(level: CommitmentPolicyLevel, input: Record<string, unknown>) {
  if (level !== CommitmentPolicyLevel.GENTLE && level !== CommitmentPolicyLevel.STANDARD) {
    throw new DomainException('Commitment level must be GENTLE or STANDARD', 'INVALID_COMMITMENT_POLICY', 400);
  }
  const expectedAccountXp = Number(input.expectedAccountXp);
  const graceMinutes = Number(input.graceMinutes);
  const recoveryWindowMinutes = Number(input.recoveryWindowMinutes);
  if (!Number.isInteger(expectedAccountXp) || expectedAccountXp <= 0) {
    throw new DomainException('Commitment expectedAccountXp must be a positive integer', 'INVALID_COMMITMENT_POLICY', 400);
  }
  if (!Number.isInteger(graceMinutes) || graceMinutes < 0 || graceMinutes > 10080) {
    throw new DomainException('Commitment graceMinutes must be between 0 and 10080', 'INVALID_COMMITMENT_POLICY', 400);
  }
  if (!Number.isInteger(recoveryWindowMinutes) || recoveryWindowMinutes < 0 || recoveryWindowMinutes > COMMITMENT_CONFIG.maxRecoveryWindowMinutes) {
    throw new DomainException('Commitment recoveryWindowMinutes is invalid', 'INVALID_COMMITMENT_POLICY', 400);
  }
  const timezone = typeof input.timezone === 'string' && input.timezone.trim() ? input.timezone.trim() : 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    throw new DomainException(`Invalid commitment timezone: ${timezone}`, 'INVALID_COMMITMENT_POLICY', 400);
  }
  return {
    level,
    expectedAccountXp,
    penaltyRate: level === CommitmentPolicyLevel.GENTLE ? COMMITMENT_CONFIG.gentleRate : COMMITMENT_CONFIG.standardRate,
    graceMinutes,
    recoveryWindowMinutes,
    timezone,
  };
}

export function commitmentSnapshot(policy: {
  id: string;
  version: number;
  level: CommitmentPolicyLevel;
  expectedAccountXp: number;
  penaltyRate: number;
  graceMinutes: number;
  recoveryWindowMinutes: number;
  timezone: string;
  effectiveFrom: Date;
}) {
  return {
    commitmentPolicyId: policy.id,
    commitmentPolicyVersion: policy.version,
    commitmentPolicyLevel: policy.level,
    commitmentExpectedAccountXp: policy.expectedAccountXp,
    commitmentPenaltyRate: policy.penaltyRate,
    commitmentGraceMinutes: policy.graceMinutes,
    commitmentRecoveryWindowMinutes: policy.recoveryWindowMinutes,
    commitmentTimezone: policy.timezone,
    commitmentEffectiveFrom: policy.effectiveFrom,
    commitmentState: HabitCommitmentState.COMMITTED,
  };
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function penaltyCap(profile: { lifetimeEarnedXp: number; outstandingPenaltyDebt: number; protectedLevelFloor: number; highestLevelReached: number; accountBaseXp: number }, recentAwards: number[]) {
  const effectiveXp = Math.max(0, profile.lifetimeEarnedXp - profile.outstandingPenaltyDebt);
  const progress = growthLevelProgress(effectiveXp, profile.accountBaseXp);
  const remainingLevelRequirement = Math.max(1, progress.nextLevelXp - effectiveXp);
  const levelCap = Math.max(1, Math.floor(remainingLevelRequirement * 0.25));
  const recentMedian = median(recentAwards);
  // New/returning users have no seven-day median yet; the level cap remains
  // the explicit safe fallback until they earn Account XP.
  const noHistoryCap = levelCap;
  const recentMedianCap = recentMedian > 0 ? Math.max(1, Math.floor(recentMedian * 7)) : noHistoryCap;
  return { cap: Math.min(levelCap, recentMedianCap), level: Math.max(progress.level, profile.protectedLevelFloor, profile.highestLevelReached) };
}

function policyMetadata(occurrence: any) {
  return {
    policyId: occurrence.commitmentPolicyId,
    policyVersion: occurrence.commitmentPolicyVersion,
    level: occurrence.commitmentPolicyLevel,
    expectedAccountXp: occurrence.commitmentExpectedAccountXp,
    penaltyRate: occurrence.commitmentPenaltyRate,
    graceMinutes: occurrence.commitmentGraceMinutes,
    recoveryWindowMinutes: occurrence.commitmentRecoveryWindowMinutes,
    timezone: occurrence.commitmentTimezone,
    effectiveFrom: occurrence.commitmentEffectiveFrom,
  };
}

export async function evaluateMissedCommitment(tx: Tx, userId: string, occurrenceId: string, now = new Date(), idempotencyKey?: string) {
  if (!commitmentFeatureEnabled()) return { enabled: false, breached: false, penalty: null };
  const occurrence = await tx.habitOccurrence.findFirst({ where: { id: occurrenceId, habit: { userId } }, include: { habit: true, commitmentPenalty: true } });
  if (!occurrence) throw new EntityNotFoundException('Habit occurrence', occurrenceId);
  if (occurrence.commitmentPenalty?.state === CommitmentPenaltyState.ACTIVE) {
    return { enabled: true, breached: true, penalty: occurrence.commitmentPenalty };
  }
  if (
    occurrence.commitmentState !== HabitCommitmentState.COMMITTED ||
    occurrence.status !== HabitOccurrenceStatus.PENDING ||
    !occurrence.commitmentExpectedAccountXp ||
    occurrence.commitmentGraceMinutes === null ||
    occurrence.commitmentGraceMinutes === undefined
  ) {
    return {
      enabled: true,
      breached: occurrence.commitmentState === HabitCommitmentState.BREACHED || Boolean(occurrence.commitmentPenalty),
      penalty: occurrence.commitmentPenalty ?? null,
    };
  }
  const dueAt = new Date(localOccurrenceStartUtc(occurrence.occurrenceDate, occurrence.commitmentTimezone ?? 'UTC').getTime() + occurrence.commitmentGraceMinutes * 60_000);
  if (now.getTime() <= dueAt.getTime()) return { enabled: true, breached: false, penalty: null, dueAt };

  const profile = await tx.growthProfile.findUnique({ where: { userId } });
  if (!profile) return { enabled: true, breached: false, penalty: null };
  const recent = await tx.growthLedgerEntry.findMany({
    where: { userId, currency: GrowthCurrency.ACCOUNT_XP, amount: { gt: 0 }, createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } },
    select: { amount: true },
  });
  const requested = Math.max(1, Math.round(occurrence.commitmentExpectedAccountXp * (occurrence.commitmentPenaltyRate ?? 1)));
  const cap = penaltyCap(profile, recent.map((row: any) => row.amount));
  const available = Math.max(0, cap.cap - profile.outstandingPenaltyDebt);
  const amount = -Math.min(requested, available);
  if (amount === 0) {
    await tx.habitOccurrence.update({ where: { id: occurrence.id }, data: { commitmentState: HabitCommitmentState.BREACHED, commitmentBreachAt: now } });
    return { enabled: true, breached: true, penalty: null, dueAt, capped: true };
  }
  const key = idempotencyKey ?? `commitment:${occurrence.id}:breach`;
  const existing = await tx.growthCommitmentPenalty.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } } });
  if (existing) return { enabled: true, breached: true, penalty: existing, dueAt };
  const entryId = createUlid();
  const entry = await tx.growthLedgerEntry.create({
    data: {
      id: entryId,
      userId,
      currency: GrowthCurrency.ACCOUNT_XP,
      amount,
      kind: GrowthLedgerKind.COMMITMENT_PENALTY,
      sourceType: 'HABIT',
      sourceId: occurrence.id,
      entryKey: `commitment:penalty:${occurrence.id}`,
      cycleId: profile.activeCycleId,
      titleSnapshot: occurrence.habit.name,
      metadata: { reason: 'MISSED_COMMITTED_OCCURRENCE', dueAt, ...policyMetadata(occurrence), debtCap: cap.cap, protectedLevelFloor: cap.level },
    },
  });
  const penalty = await tx.growthCommitmentPenalty.create({
    data: {
      id: createUlid(), userId, occurrenceId: occurrence.id, ledgerEntryId: entry.id, amount, state: CommitmentPenaltyState.ACTIVE,
      reason: 'MISSED_COMMITTED_OCCURRENCE', policySnapshot: policyMetadata(occurrence), idempotencyKey: key, breachedAt: now,
    },
  });
  await tx.growthProfile.update({
    where: { userId },
    data: { outstandingPenaltyDebt: { increment: Math.abs(amount) }, protectedLevelFloor: Math.max(profile.protectedLevelFloor, cap.level) },
  });
  await tx.habitOccurrence.update({ where: { id: occurrence.id }, data: { commitmentState: HabitCommitmentState.BREACHED, commitmentBreachAt: now } });
  return { enabled: true, breached: true, penalty, dueAt };
}

export async function reverseCommitmentPenalty(tx: Tx, userId: string, occurrenceId: string, reason: 'RECOVERY' | 'EXCUSE', now = new Date()) {
  if (!commitmentFeatureEnabled()) return null;
  const penalty = await tx.growthCommitmentPenalty.findFirst({ where: { userId, occurrenceId, state: CommitmentPenaltyState.ACTIVE } });
  if (!penalty) return null;
  const original = await tx.growthLedgerEntry.findUnique({ where: { id: penalty.ledgerEntryId } });
  if (!original) throw new DomainException('Commitment penalty ledger entry is missing', 'COMMITMENT_LEDGER_INVALID', 500);
  const reversal = await tx.growthLedgerEntry.create({
    data: {
      id: createUlid(), userId, currency: GrowthCurrency.ACCOUNT_XP, amount: Math.abs(penalty.amount), kind: GrowthLedgerKind.REVERSAL,
      sourceType: 'HABIT', sourceId: occurrenceId, entryKey: `commitment:penalty:${occurrenceId}:reversal`, reversalOfId: original.id,
      cycleId: original.cycleId, titleSnapshot: original.titleSnapshot, metadata: { reason, commitmentPenaltyId: penalty.id },
    },
  });
  const updated = await tx.growthCommitmentPenalty.update({ where: { id: penalty.id }, data: { state: CommitmentPenaltyState.REVERSED, reversedAt: now, reversalEntryId: reversal.id } });
  await tx.growthProfile.update({ where: { userId }, data: { outstandingPenaltyDebt: { decrement: Math.abs(penalty.amount) } } });
  await tx.habitOccurrence.update({ where: { id: occurrenceId }, data: { commitmentState: reason === 'RECOVERY' ? HabitCommitmentState.RECOVERED : HabitCommitmentState.EXCUSED } });
  return { penalty: updated, reversal };
}

export function recoveryWindowOpen(occurrence: { commitmentBreachAt: Date | null; commitmentRecoveryWindowMinutes: number | null }, now = new Date()) {
  return Boolean(occurrence.commitmentBreachAt && occurrence.commitmentRecoveryWindowMinutes !== null && now.getTime() <= occurrence.commitmentBreachAt.getTime() + occurrence.commitmentRecoveryWindowMinutes * 60_000);
}
