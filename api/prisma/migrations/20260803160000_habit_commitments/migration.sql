-- Phase 5 commitments are additive and remain inert until the product flag and
-- a user's policy are both enabled.
DO $$ BEGIN
  CREATE TYPE "CommitmentPolicyLevel" AS ENUM ('GENTLE', 'STANDARD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "HabitCommitmentState" AS ENUM ('NONE', 'COMMITTED', 'BREACHED', 'RECOVERED', 'EXCUSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "CommitmentPenaltyState" AS ENUM ('ACTIVE', 'REVERSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "GrowthLedgerKind" ADD VALUE IF NOT EXISTS 'COMMITMENT_PENALTY';

ALTER TABLE "GrowthProfile"
  ADD COLUMN IF NOT EXISTS "lifetimeEarnedXp" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "outstandingPenaltyDebt" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "highestLevelReached" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "protectedLevelFloor" INTEGER NOT NULL DEFAULT 1;

-- Preserve all previously earned Account XP and establish a non-lowering floor.
UPDATE "GrowthProfile" AS p
SET "lifetimeEarnedXp" = GREATEST(p."lifetimeEarnedXp", COALESCE((
      SELECT SUM(e."amount") FROM "GrowthLedgerEntry" AS e
      WHERE e."userId" = p."userId" AND e."currency" = 'ACCOUNT_XP' AND e."amount" > 0
    ), 0)),
    "highestLevelReached" = GREATEST(p."highestLevelReached", (FLOOR(SQRT(GREATEST(p."lifetimeEarnedXp", COALESCE((
      SELECT SUM(e2."amount") FROM "GrowthLedgerEntry" AS e2
      WHERE e2."userId" = p."userId" AND e2."currency" = 'ACCOUNT_XP' AND e2."amount" > 0
    ), 0))::numeric / GREATEST(p."accountBaseXp", 10)) + 1))::integer),
    "protectedLevelFloor" = GREATEST(p."protectedLevelFloor", (FLOOR(SQRT(GREATEST(p."lifetimeEarnedXp", COALESCE((
      SELECT SUM(e3."amount") FROM "GrowthLedgerEntry" AS e3
      WHERE e3."userId" = p."userId" AND e3."currency" = 'ACCOUNT_XP' AND e3."amount" > 0
    ), 0))::numeric / GREATEST(p."accountBaseXp", 10)) + 1))::integer);

ALTER TABLE "HabitOccurrence"
  ADD COLUMN IF NOT EXISTS "commitmentState" "HabitCommitmentState" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "commitmentPolicyId" TEXT,
  ADD COLUMN IF NOT EXISTS "commitmentPolicyVersion" INTEGER,
  ADD COLUMN IF NOT EXISTS "commitmentPolicyLevel" "CommitmentPolicyLevel",
  ADD COLUMN IF NOT EXISTS "commitmentExpectedAccountXp" INTEGER,
  ADD COLUMN IF NOT EXISTS "commitmentPenaltyRate" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "commitmentGraceMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "commitmentRecoveryWindowMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "commitmentTimezone" TEXT,
  ADD COLUMN IF NOT EXISTS "commitmentEffectiveFrom" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "commitmentBreachAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "HabitCommitmentPolicy" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "habitId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "level" "CommitmentPolicyLevel" NOT NULL DEFAULT 'GENTLE',
  "expectedAccountXp" INTEGER NOT NULL,
  "penaltyRate" DOUBLE PRECISION NOT NULL,
  "graceMinutes" INTEGER NOT NULL,
  "recoveryWindowMinutes" INTEGER NOT NULL,
  "timezone" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HabitCommitmentPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HabitCommitmentPolicy_habitId_key" ON "HabitCommitmentPolicy"("habitId");
CREATE INDEX IF NOT EXISTS "HabitCommitmentPolicy_userId_enabled_idx" ON "HabitCommitmentPolicy"("userId", "enabled");
ALTER TABLE "HabitCommitmentPolicy" ADD CONSTRAINT "HabitCommitmentPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitCommitmentPolicy" ADD CONSTRAINT "HabitCommitmentPolicy_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitOccurrence" ADD CONSTRAINT "HabitOccurrence_commitmentPolicyId_fkey" FOREIGN KEY ("commitmentPolicyId") REFERENCES "HabitCommitmentPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "GrowthCommitmentPenalty" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "occurrenceId" TEXT NOT NULL,
  "ledgerEntryId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "state" "CommitmentPenaltyState" NOT NULL DEFAULT 'ACTIVE',
  "reason" TEXT NOT NULL,
  "policySnapshot" JSONB NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "breachedAt" TIMESTAMP(3) NOT NULL,
  "reversedAt" TIMESTAMP(3),
  "reversalEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GrowthCommitmentPenalty_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "GrowthCommitmentPenalty_occurrenceId_key" ON "GrowthCommitmentPenalty"("occurrenceId");
CREATE UNIQUE INDEX IF NOT EXISTS "GrowthCommitmentPenalty_ledgerEntryId_key" ON "GrowthCommitmentPenalty"("ledgerEntryId");
CREATE UNIQUE INDEX IF NOT EXISTS "GrowthCommitmentPenalty_userId_idempotencyKey_key" ON "GrowthCommitmentPenalty"("userId", "idempotencyKey");
CREATE INDEX IF NOT EXISTS "GrowthCommitmentPenalty_userId_state_createdAt_idx" ON "GrowthCommitmentPenalty"("userId", "state", "createdAt");
ALTER TABLE "GrowthCommitmentPenalty" ADD CONSTRAINT "GrowthCommitmentPenalty_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GrowthCommitmentPenalty" ADD CONSTRAINT "GrowthCommitmentPenalty_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "HabitOccurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GrowthCommitmentPenalty" ADD CONSTRAINT "GrowthCommitmentPenalty_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "GrowthLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
