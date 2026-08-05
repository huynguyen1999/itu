-- Add Account XP without rewriting the original init migration.
ALTER TYPE "GrowthCurrency" ADD VALUE IF NOT EXISTS 'ACCOUNT_XP';
ALTER TABLE "GrowthProfile" ALTER COLUMN "accountBaseXp" SET DEFAULT 75;
