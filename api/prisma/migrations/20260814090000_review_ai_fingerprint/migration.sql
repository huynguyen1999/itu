ALTER TABLE "JournalWeeklyReview"
  ADD COLUMN IF NOT EXISTS "aiInputFingerprint" TEXT;

ALTER TABLE "JournalDailyReview"
  ADD COLUMN IF NOT EXISTS "aiInputFingerprint" TEXT;
