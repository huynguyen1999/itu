ALTER TYPE "JournalEntryKind" ADD VALUE IF NOT EXISTS 'DAILY_REVIEW';
ALTER TYPE "AiJobType" ADD VALUE IF NOT EXISTS 'REVIEW_INSIGHTS';

ALTER TABLE "JournalWeeklyReview"
  ADD COLUMN IF NOT EXISTS "learnedMarkdown" TEXT,
  ADD COLUMN IF NOT EXISTS "differentFromLastWeekMarkdown" TEXT,
  ADD COLUMN IF NOT EXISTS "comparisonSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "aiInsightsSnapshot" JSONB,
  ADD COLUMN IF NOT EXISTS "aiGenerationJobId" TEXT,
  ADD COLUMN IF NOT EXISTS "aiGeneratedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "aiPromptVersion" TEXT,
  ADD COLUMN IF NOT EXISTS "aiSourceEntryVersion" INTEGER;

CREATE TABLE IF NOT EXISTS "JournalDailyReview" (
  "entryId" TEXT NOT NULL,
  "periodDate" DATE NOT NULL,
  "summarySnapshot" JSONB NOT NULL DEFAULT '{}',
  "wentWellMarkdown" TEXT,
  "frictionMarkdown" TEXT,
  "learnedMarkdown" TEXT,
  "contextMarkdown" TEXT,
  "aiInsightsSnapshot" JSONB,
  "aiGenerationJobId" TEXT,
  "aiGeneratedAt" TIMESTAMP(3),
  "aiPromptVersion" TEXT,
  "aiSourceEntryVersion" INTEGER,
  CONSTRAINT "JournalDailyReview_pkey" PRIMARY KEY ("entryId")
);

CREATE INDEX IF NOT EXISTS "JournalDailyReview_periodDate_idx"
  ON "JournalDailyReview"("periodDate");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'JournalDailyReview_entryId_fkey'
  ) THEN
    ALTER TABLE "JournalDailyReview"
      ADD CONSTRAINT "JournalDailyReview_entryId_fkey"
      FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
