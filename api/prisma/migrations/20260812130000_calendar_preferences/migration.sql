ALTER TABLE "UserPreferences"
  ADD COLUMN IF NOT EXISTS "calendarPreferences" JSONB NOT NULL DEFAULT '{}';
