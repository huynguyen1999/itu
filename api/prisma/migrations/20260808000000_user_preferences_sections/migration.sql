-- AlterTable
ALTER TABLE "UserPreferences" ADD COLUMN "taskPreferences" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "focusPreferences" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "habitPreferences" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "matrixPreferences" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "growthPreferences" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "learnPreferences" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "journalPreferences" JSONB NOT NULL DEFAULT '{}';
