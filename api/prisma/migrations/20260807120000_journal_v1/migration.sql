-- CreateEnum
CREATE TYPE "JournalEntryKind" AS ENUM ('NOTE', 'WEEKLY_REVIEW', 'EXPENSE', 'WORKOUT');

-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('FOOD', 'TRANSPORT', 'SHOPPING', 'BILLS', 'HEALTH', 'EDUCATION', 'ENTERTAINMENT', 'FITNESS', 'TRAVEL', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'E_WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "WeightUnit" AS ENUM ('KG', 'LBS');

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "JournalEntryKind" NOT NULL,
    "title" TEXT NOT NULL,
    "contentMarkdown" TEXT NOT NULL DEFAULT '',
    "entryDate" DATE NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "templateId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalWeeklyReview" (
    "entryId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "summarySnapshot" JSONB NOT NULL,

    CONSTRAINT "JournalWeeklyReview_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "JournalExpense" (
    "entryId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "merchant" TEXT,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "transactionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalExpense_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "ExerciseDefinition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "defaultWeightUnit" "WeightUnit" NOT NULL DEFAULT 'KG',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExerciseDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalWorkout" (
    "entryId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "durationMinutes" INTEGER,

    CONSTRAINT "JournalWorkout_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "JournalWorkoutExercise" (
    "id" TEXT NOT NULL,
    "workoutEntryId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "JournalWorkoutExercise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalWorkoutSet" (
    "id" TEXT NOT NULL,
    "workoutExerciseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "reps" INTEGER NOT NULL,
    "weight" DECIMAL(8,2) NOT NULL,

    CONSTRAINT "JournalWorkoutSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entryKind" "JournalEntryKind" NOT NULL,
    "titleTemplate" TEXT NOT NULL DEFAULT '',
    "bodyMarkdown" TEXT NOT NULL DEFAULT '',
    "defaults" JSONB NOT NULL DEFAULT '{}',
    "builtIn" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "JournalTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalTag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'SLATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalTagAssignment" (
    "entryId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "JournalTagAssignment_pkey" PRIMARY KEY ("entryId","tagId")
);

-- CreateTable
CREATE TABLE "JournalAttachment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "JournalAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntryRevision" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "mutationId" TEXT,
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalEntryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalEntry_userId_entryDate_idx" ON "JournalEntry"("userId", "entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_userId_kind_entryDate_idx" ON "JournalEntry"("userId", "kind", "entryDate");

-- CreateIndex
CREATE INDEX "JournalEntry_userId_deletedAt_idx" ON "JournalEntry"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "JournalWeeklyReview_periodStart_periodEnd_idx" ON "JournalWeeklyReview"("periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "JournalExpense_category_idx" ON "JournalExpense"("category");

-- CreateIndex
CREATE INDEX "JournalExpense_transactionAt_idx" ON "JournalExpense"("transactionAt");

-- CreateIndex
CREATE INDEX "ExerciseDefinition_userId_name_idx" ON "ExerciseDefinition"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ExerciseDefinition_userId_normalizedName_key" ON "ExerciseDefinition"("userId", "normalizedName");

-- CreateIndex
CREATE INDEX "JournalWorkoutExercise_workoutEntryId_sortOrder_idx" ON "JournalWorkoutExercise"("workoutEntryId", "sortOrder");

-- CreateIndex
CREATE INDEX "JournalWorkoutExercise_exerciseId_idx" ON "JournalWorkoutExercise"("exerciseId");

-- CreateIndex
CREATE INDEX "JournalWorkoutSet_workoutExerciseId_sortOrder_idx" ON "JournalWorkoutSet"("workoutExerciseId", "sortOrder");

-- CreateIndex
CREATE INDEX "JournalTemplate_userId_entryKind_archivedAt_idx" ON "JournalTemplate"("userId", "entryKind", "archivedAt");

-- CreateIndex
CREATE INDEX "JournalTag_userId_name_idx" ON "JournalTag"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "JournalTag_userId_name_key" ON "JournalTag"("userId", "name");

-- CreateIndex
CREATE INDEX "JournalTagAssignment_tagId_idx" ON "JournalTagAssignment"("tagId");

-- CreateIndex
CREATE INDEX "JournalAttachment_userId_entryId_idx" ON "JournalAttachment"("userId", "entryId");

-- CreateIndex
CREATE INDEX "JournalAttachment_userId_deletedAt_idx" ON "JournalAttachment"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "JournalEntryRevision_entryId_createdAt_idx" ON "JournalEntryRevision"("entryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntryRevision_entryId_revisionNumber_key" ON "JournalEntryRevision"("entryId", "revisionNumber");

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "JournalTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalWeeklyReview" ADD CONSTRAINT "JournalWeeklyReview_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalExpense" ADD CONSTRAINT "JournalExpense_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExerciseDefinition" ADD CONSTRAINT "ExerciseDefinition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalWorkout" ADD CONSTRAINT "JournalWorkout_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalWorkoutExercise" ADD CONSTRAINT "JournalWorkoutExercise_workoutEntryId_fkey" FOREIGN KEY ("workoutEntryId") REFERENCES "JournalWorkout"("entryId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalWorkoutExercise" ADD CONSTRAINT "JournalWorkoutExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "ExerciseDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalWorkoutSet" ADD CONSTRAINT "JournalWorkoutSet_workoutExerciseId_fkey" FOREIGN KEY ("workoutExerciseId") REFERENCES "JournalWorkoutExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTemplate" ADD CONSTRAINT "JournalTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTag" ADD CONSTRAINT "JournalTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTagAssignment" ADD CONSTRAINT "JournalTagAssignment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalTagAssignment" ADD CONSTRAINT "JournalTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "JournalTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalAttachment" ADD CONSTRAINT "JournalAttachment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalAttachment" ADD CONSTRAINT "JournalAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntryRevision" ADD CONSTRAINT "JournalEntryRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
