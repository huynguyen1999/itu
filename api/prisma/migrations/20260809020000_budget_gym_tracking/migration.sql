-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "WorkoutStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "WorkoutSetType" AS ENUM ('WARMUP', 'NORMAL', 'DROP', 'FAILURE');

-- CreateEnum
CREATE TYPE "ExerciseMetricType" AS ENUM ('WEIGHT_REPS', 'REPS', 'DURATION', 'DISTANCE_DURATION');

-- AlterTable UserPreferences
ALTER TABLE "UserPreferences"
ADD COLUMN IF NOT EXISTS "moneyPreferences" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "budgetPreferences" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "gymPreferences" JSONB NOT NULL DEFAULT '{}';

-- CreateTable MoneyCategory
CREATE TABLE "MoneyCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL DEFAULT 'EXPENSE',
    "icon" TEXT,
    "color" TEXT DEFAULT 'TEAL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MoneyCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable MoneyBudgetPeriod
CREATE TABLE "MoneyBudgetPeriod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "overallLimit" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "MoneyBudgetPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable MoneyCategoryBudget
CREATE TABLE "MoneyCategoryBudget" (
    "id" TEXT NOT NULL,
    "budgetPeriodId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "limit" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoneyCategoryBudget_pkey" PRIMARY KEY ("id")
);

-- AlterTable JournalExpense
ALTER TABLE "JournalExpense"
ADD COLUMN "type" "TransactionType" NOT NULL DEFAULT 'EXPENSE',
ADD COLUMN "categoryId" TEXT,
ADD COLUMN "accountId" TEXT;

-- AlterTable ExerciseDefinition
ALTER TABLE "ExerciseDefinition"
ADD COLUMN "description" TEXT,
ADD COLUMN "imageStorageKey" TEXT,
ADD COLUMN "imageUrl" TEXT,
ADD COLUMN "metricType" "ExerciseMetricType" NOT NULL DEFAULT 'WEIGHT_REPS',
ADD COLUMN "equipment" TEXT,
ADD COLUMN "primaryMuscleGroup" TEXT,
ADD COLUMN "secondaryMuscleGroups" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "defaultRestSeconds" INTEGER,
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable JournalWorkout
ALTER TABLE "JournalWorkout"
ADD COLUMN "title" TEXT,
ADD COLUMN "source" TEXT,
ADD COLUMN "status" "WorkoutStatus" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN "endedAt" TIMESTAMP(3);

-- AlterTable JournalWorkoutExercise
ALTER TABLE "JournalWorkoutExercise"
ADD COLUMN "restSeconds" INTEGER;

-- AlterTable JournalWorkoutSet
ALTER TABLE "JournalWorkoutSet"
ALTER COLUMN "reps" DROP NOT NULL,
ALTER COLUMN "weight" DROP NOT NULL,
ADD COLUMN "type" "WorkoutSetType" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "durationSeconds" INTEGER,
ADD COLUMN "distanceMeters" DOUBLE PRECISION,
ADD COLUMN "rpe" DECIMAL(3,1),
ADD COLUMN "completedAt" TIMESTAMP(3);

-- CreateIndexes
CREATE INDEX "MoneyCategory_userId_archivedAt_idx" ON "MoneyCategory"("userId", "archivedAt");
CREATE UNIQUE INDEX "MoneyCategory_userId_name_key" ON "MoneyCategory"("userId", "name");

CREATE INDEX "MoneyBudgetPeriod_userId_period_idx" ON "MoneyBudgetPeriod"("userId", "period");
CREATE UNIQUE INDEX "MoneyBudgetPeriod_userId_period_key" ON "MoneyBudgetPeriod"("userId", "period");

CREATE UNIQUE INDEX "MoneyCategoryBudget_budgetPeriodId_categoryId_key" ON "MoneyCategoryBudget"("budgetPeriodId", "categoryId");

CREATE INDEX "JournalExpense_categoryId_idx" ON "JournalExpense"("categoryId");
CREATE INDEX "ExerciseDefinition_userId_archivedAt_idx" ON "ExerciseDefinition"("userId", "archivedAt");

-- AddForeignKeys
ALTER TABLE "MoneyCategory" ADD CONSTRAINT "MoneyCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoneyBudgetPeriod" ADD CONSTRAINT "MoneyBudgetPeriod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoneyCategoryBudget" ADD CONSTRAINT "MoneyCategoryBudget_budgetPeriodId_fkey" FOREIGN KEY ("budgetPeriodId") REFERENCES "MoneyBudgetPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MoneyCategoryBudget" ADD CONSTRAINT "MoneyCategoryBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MoneyCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "JournalExpense" ADD CONSTRAINT "JournalExpense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "MoneyCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
