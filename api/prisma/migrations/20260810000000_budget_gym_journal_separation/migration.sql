-- Additive Budget/Gym storage followed by the explicit legacy Journal cutover
-- below; production deployment must be coordinated with the data migration.
-- Run `journal:reset-dev --confirm-journal-reset` first so attachment storage
-- keys are captured and removed before these metadata rows are cleared.
DELETE FROM "JournalAttachment";
DELETE FROM "JournalTagAssignment";
DELETE FROM "JournalEntryRevision";
DELETE FROM "JournalWeeklyReview";
DELETE FROM "JournalEntry";
DELETE FROM "JournalTemplate";
DELETE FROM "JournalTag";
ALTER TYPE "JournalEntryKind" RENAME TO "JournalEntryKind_legacy";
CREATE TYPE "JournalEntryKind" AS ENUM ('NOTE', 'WEEKLY_REVIEW');
ALTER TABLE "JournalEntry" ALTER COLUMN "kind" TYPE "JournalEntryKind" USING "kind"::text::"JournalEntryKind";
ALTER TABLE "JournalTemplate" ALTER COLUMN "entryKind" TYPE "JournalEntryKind" USING "entryKind"::text::"JournalEntryKind";
DROP TYPE "JournalEntryKind_legacy";
CREATE TYPE "GymWorkoutStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');
CREATE TABLE "BudgetTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL DEFAULT 'EXPENSE',
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "categoryId" TEXT NOT NULL,
    "merchant" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "accountId" TEXT,
    "transactionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "BudgetTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BudgetTransaction_userId_transactionAt_idx" ON "BudgetTransaction"("userId", "transactionAt");
CREATE INDEX "BudgetTransaction_userId_deletedAt_idx" ON "BudgetTransaction"("userId", "deletedAt");
CREATE INDEX "BudgetTransaction_categoryId_transactionAt_idx" ON "BudgetTransaction"("categoryId", "transactionAt");
ALTER TABLE "BudgetTransaction" ADD CONSTRAINT "BudgetTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BudgetTransaction" ADD CONSTRAINT "BudgetTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MoneyCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GymWorkout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "source" TEXT,
    "status" "GymWorkoutStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "GymWorkout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GymWorkout_userId_startedAt_idx" ON "GymWorkout"("userId", "startedAt");
CREATE INDEX "GymWorkout_userId_deletedAt_idx" ON "GymWorkout"("userId", "deletedAt");
CREATE INDEX "GymWorkout_userId_status_idx" ON "GymWorkout"("userId", "status");
CREATE UNIQUE INDEX "GymWorkout_one_in_progress_per_user" ON "GymWorkout"("userId") WHERE "status" = 'IN_PROGRESS' AND "deletedAt" IS NULL;
ALTER TABLE "GymWorkout" ADD CONSTRAINT "GymWorkout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GymWorkoutExercise" (
    "id" TEXT NOT NULL,
    "workoutId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "exerciseName" TEXT NOT NULL,
    "metricType" "ExerciseMetricType" NOT NULL,
    "weightUnit" "WeightUnit" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "restSeconds" INTEGER,
    CONSTRAINT "GymWorkoutExercise_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GymWorkoutExercise_workoutId_sortOrder_idx" ON "GymWorkoutExercise"("workoutId", "sortOrder");
CREATE INDEX "GymWorkoutExercise_exerciseId_idx" ON "GymWorkoutExercise"("exerciseId");
ALTER TABLE "GymWorkoutExercise" ADD CONSTRAINT "GymWorkoutExercise_workoutId_fkey" FOREIGN KEY ("workoutId") REFERENCES "GymWorkout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GymWorkoutExercise" ADD CONSTRAINT "GymWorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "ExerciseDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "GymWorkoutSet" (
    "id" TEXT NOT NULL,
    "workoutExerciseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "type" "WorkoutSetType" NOT NULL DEFAULT 'NORMAL',
    "reps" INTEGER,
    "weight" DECIMAL(8,2),
    "durationSeconds" INTEGER,
    "distanceMeters" DOUBLE PRECISION,
    "rpe" DECIMAL(3,1),
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "GymWorkoutSet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GymWorkoutSet_workoutExerciseId_sortOrder_idx" ON "GymWorkoutSet"("workoutExerciseId", "sortOrder");
ALTER TABLE "GymWorkoutSet" ADD CONSTRAINT "GymWorkoutSet_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "GymWorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Journal is now NOTE/WEEKLY_REVIEW only. The guarded reset command is the
-- supported development cutover; production deployments must run it against
-- disposable/dev data before applying this migration.
DROP TABLE IF EXISTS "JournalWorkoutSet";
DROP TABLE IF EXISTS "JournalWorkoutExercise";
DROP TABLE IF EXISTS "JournalWorkout";
DROP TABLE IF EXISTS "JournalExpense";
DROP TYPE IF EXISTS "WorkoutStatus";
DROP TYPE IF EXISTS "ExpenseCategory";

ALTER TABLE "JournalWeeklyReview" ADD COLUMN IF NOT EXISTS "wentWellMarkdown" TEXT;
ALTER TABLE "JournalWeeklyReview" ADD COLUMN IF NOT EXISTS "frictionMarkdown" TEXT;
ALTER TABLE "JournalWeeklyReview" ADD COLUMN IF NOT EXISTS "nextWeekMarkdown" TEXT;
ALTER TABLE "JournalWeeklyReview" ADD COLUMN IF NOT EXISTS "experimentSnapshot" JSONB;
