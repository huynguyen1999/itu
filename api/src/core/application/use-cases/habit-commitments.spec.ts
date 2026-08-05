import { CommitmentPolicyLevel, HabitOccurrenceStatus } from '@prisma/client';
import { DomainException } from '@core/domain/exceptions';
import {
  commitmentDefaults,
  commitmentFeatureEnabled,
  commitmentSnapshot,
  evaluateMissedCommitment,
  localOccurrenceStartUtc,
  reverseCommitmentPenalty,
} from './habit-commitments';

describe('habit commitments', () => {
  const previousFlag = process.env.COMMITMENT_FEATURE_ENABLED;

  afterEach(() => {
    if (previousFlag === undefined) delete process.env.COMMITMENT_FEATURE_ENABLED;
    else process.env.COMMITMENT_FEATURE_ENABLED = previousFlag;
  });

  it('converts an IANA midnight deadline across a DST transition', () => {
    const start = localOccurrenceStartUtc(new Date('2026-04-24T00:00:00.000Z'), 'Africa/Cairo');
    expect(start.toISOString()).toBe('2026-04-23T22:00:00.000Z');
    expect(localOccurrenceStartUtc(new Date('2024-10-06T00:00:00.000Z'), 'Australia/Lord_Howe').toISOString()).toBe('2024-10-05T13:30:00.000Z');
  });

  it('rejects unknown IANA timezones', () => {
    expect(() => localOccurrenceStartUtc(new Date('2026-01-01T00:00:00.000Z'), 'Not/ATimezone')).toThrow(DomainException);
  });

  it('keeps Gentle and Standard rates explicit', () => {
    expect(commitmentDefaults(CommitmentPolicyLevel.GENTLE, { expectedAccountXp: 10, graceMinutes: 5, recoveryWindowMinutes: 10, timezone: 'UTC' }).penaltyRate).toBe(0.5);
    expect(commitmentDefaults(CommitmentPolicyLevel.STANDARD, { expectedAccountXp: 10, graceMinutes: 5, recoveryWindowMinutes: 10, timezone: 'UTC' }).penaltyRate).toBe(1);
  });

  it('is inert by default and does not inspect persistence', async () => {
    delete process.env.COMMITMENT_FEATURE_ENABLED;
    expect(commitmentFeatureEnabled()).toBe(false);
    const findFirst = jest.fn();
    const result = await evaluateMissedCommitment({ habitOccurrence: { findFirst } } as never, 'user-1', 'occurrence-1');
    expect(result).toEqual({ enabled: false, breached: false, penalty: null });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('preserves policy intensity and weights on an occurrence snapshot', () => {
    const effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
    expect(commitmentSnapshot({
      id: 'policy-1',
      version: 3,
      level: CommitmentPolicyLevel.STANDARD,
      expectedAccountXp: 20,
      penaltyRate: 1,
      graceMinutes: 15,
      recoveryWindowMinutes: 60,
      timezone: 'Asia/Ho_Chi_Minh',
      effectiveFrom,
    })).toEqual(expect.objectContaining({
      commitmentPolicyId: 'policy-1',
      commitmentPolicyVersion: 3,
      commitmentPolicyLevel: CommitmentPolicyLevel.STANDARD,
      commitmentExpectedAccountXp: 20,
      commitmentPenaltyRate: 1,
      commitmentGraceMinutes: 15,
      commitmentRecoveryWindowMinutes: 60,
      commitmentTimezone: 'Asia/Ho_Chi_Minh',
      commitmentEffectiveFrom: effectiveFrom,
      commitmentState: 'COMMITTED',
    }));
  });

  it('does not breach an on-time offline event evaluated after server arrival', async () => {
    process.env.COMMITMENT_FEATURE_ENABLED = 'true';
    const occurrence = {
      id: 'occurrence-1', occurrenceDate: new Date('2026-01-01T00:00:00.000Z'), status: 'PENDING', commitmentState: 'COMMITTED',
      commitmentExpectedAccountXp: 10, commitmentPenaltyRate: 1, commitmentGraceMinutes: 0, commitmentTimezone: 'UTC', commitmentPenalty: null,
    };
    const tx = { habitOccurrence: { findFirst: jest.fn().mockResolvedValue(occurrence), update: jest.fn() } } as never;
    const result = await evaluateMissedCommitment(tx, 'user-1', occurrence.id, new Date('2026-01-01T00:00:00.000Z'));
    expect(result.breached).toBe(false);
    expect((tx as any).habitOccurrence.update).not.toHaveBeenCalled();
  });

  it('does not evaluate skipped/rest occurrences as missed commitments', async () => {
    process.env.COMMITMENT_FEATURE_ENABLED = 'true';
    const findFirst = jest.fn().mockResolvedValue({
      id: 'occurrence-1',
      occurrenceDate: new Date('2026-01-01T00:00:00.000Z'),
      status: HabitOccurrenceStatus.SKIPPED,
      commitmentState: 'COMMITTED',
      commitmentExpectedAccountXp: 10,
      commitmentPenaltyRate: 1,
      commitmentGraceMinutes: 0,
      commitmentTimezone: 'UTC',
      commitmentPenalty: null,
    });
    const result = await evaluateMissedCommitment({ habitOccurrence: { findFirst } } as never, 'user-1', 'occurrence-1', new Date('2026-01-02T00:00:00.000Z'));
    expect(result).toEqual({ enabled: true, breached: false, penalty: null });
  });

  it('creates at most one Account XP penalty and respects the debt cap', async () => {
    process.env.COMMITMENT_FEATURE_ENABLED = 'true';
    const occurrence: any = {
      id: 'occurrence-1',
      occurrenceDate: new Date('2026-01-01T00:00:00.000Z'),
      status: HabitOccurrenceStatus.PENDING,
      commitmentState: 'COMMITTED',
      commitmentExpectedAccountXp: 100,
      commitmentPenaltyRate: 1,
      commitmentGraceMinutes: 0,
      commitmentTimezone: 'UTC',
      commitmentPenalty: null,
      habit: { name: 'Read' },
    };
    const create = jest.fn().mockImplementation(({ data }) => ({ id: data.id, amount: data.amount, state: 'ACTIVE' }));
    const findUnique = jest.fn().mockResolvedValue(null);
    const tx: any = {
      habitOccurrence: { findFirst: jest.fn().mockResolvedValue(occurrence), update: jest.fn() },
      growthProfile: { findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', lifetimeEarnedXp: 0, outstandingPenaltyDebt: 0, protectedLevelFloor: 1, highestLevelReached: 1, accountBaseXp: 100, activeCycleId: 'cycle-1' }), update: jest.fn() },
      growthLedgerEntry: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation(({ data }) => ({ id: data.id, amount: data.amount, cycleId: 'cycle-1', titleSnapshot: 'Read' })) },
      growthCommitmentPenalty: { findUnique, create },
    };
    const first = await evaluateMissedCommitment(tx, 'user-1', occurrence.id, new Date('2026-01-01T00:01:00.000Z'));
    expect(first.penalty?.amount).toBe(-25);
    expect(tx.growthLedgerEntry.create.mock.calls[0][0].data.currency).toBe('ACCOUNT_XP');
    expect(tx.growthLedgerEntry.create.mock.calls[0][0].data.skillId).toBeUndefined();
    expect(create).toHaveBeenCalledTimes(1);

    findUnique.mockResolvedValue(first.penalty);
    const replay = await evaluateMissedCommitment(tx, 'user-1', occurrence.id, new Date('2026-01-01T00:02:00.000Z'));
    expect(replay.penalty).toBe(first.penalty);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('reverses a genuinely late breach during recovery', async () => {
    process.env.COMMITMENT_FEATURE_ENABLED = 'true';
    const occurrence: any = {
      id: 'occurrence-1', occurrenceDate: new Date('2026-01-01T00:00:00.000Z'), status: 'PENDING', commitmentState: 'COMMITTED',
      commitmentExpectedAccountXp: 10, commitmentPenaltyRate: 1, commitmentGraceMinutes: 0, commitmentRecoveryWindowMinutes: 60,
      commitmentTimezone: 'UTC', commitmentPenalty: null, commitmentBreachAt: null, habit: { name: 'Read' },
    };
    const penalty: any = { id: 'penalty-1', occurrenceId: occurrence.id, userId: 'user-1', amount: -10, state: 'ACTIVE', ledgerEntryId: 'entry-1' };
    const tx: any = {
      habitOccurrence: { findFirst: jest.fn().mockResolvedValue(occurrence), update: jest.fn().mockImplementation(({ data }) => Object.assign(occurrence, data)) },
      growthProfile: { findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', lifetimeEarnedXp: 100, outstandingPenaltyDebt: 0, protectedLevelFloor: 1, highestLevelReached: 2, accountBaseXp: 75, activeCycleId: 'cycle-1' }), update: jest.fn() },
      growthLedgerEntry: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation(({ data }) => ({ id: data.id, amount: data.amount, cycleId: 'cycle-1', titleSnapshot: 'Read' })), findUnique: jest.fn().mockResolvedValue({ id: 'entry-1', cycleId: 'cycle-1', titleSnapshot: 'Read' }) },
      growthCommitmentPenalty: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(() => penalty), findFirst: jest.fn().mockResolvedValue(penalty), update: jest.fn().mockImplementation(({ data }) => Object.assign(penalty, data)) },
    };
    const breach = await evaluateMissedCommitment(tx, 'user-1', occurrence.id, new Date('2026-01-01T00:05:00.000Z'));
    expect(breach.breached).toBe(true);
    occurrence.commitmentPenalty = penalty;
    const reversed = await reverseCommitmentPenalty(tx, 'user-1', occurrence.id, 'RECOVERY', new Date('2026-01-01T00:05:30.000Z'));
    expect(reversed?.reversal.amount).toBe(10);
  });

  it('reports a debt-capped breach on replay even without a penalty row', async () => {
    process.env.COMMITMENT_FEATURE_ENABLED = 'true';
    const occurrence: any = {
      id: 'occurrence-capped', occurrenceDate: new Date('2026-01-01T00:00:00.000Z'), status: 'PENDING', commitmentState: 'COMMITTED',
      commitmentExpectedAccountXp: 10, commitmentPenaltyRate: 1, commitmentGraceMinutes: 0, commitmentTimezone: 'UTC', commitmentPenalty: null,
      habit: { name: 'Read' },
    };
    const tx: any = {
      habitOccurrence: { findFirst: jest.fn().mockResolvedValue(occurrence), update: jest.fn().mockImplementation(({ data }) => Object.assign(occurrence, data)) },
      growthProfile: { findUnique: jest.fn().mockResolvedValue({ userId: 'user-1', lifetimeEarnedXp: 100, outstandingPenaltyDebt: 50, protectedLevelFloor: 1, highestLevelReached: 2, accountBaseXp: 75 }) },
      growthLedgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const first = await evaluateMissedCommitment(tx, 'user-1', occurrence.id, new Date('2026-01-01T00:05:00.000Z'));
    const replay = await evaluateMissedCommitment(tx, 'user-1', occurrence.id, new Date('2026-01-01T00:06:00.000Z'));
    expect(first).toMatchObject({ breached: true, capped: true, penalty: null });
    expect(replay).toMatchObject({ breached: true, penalty: null });
  });
});
