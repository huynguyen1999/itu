-- Additive GLOBAL-TRASH lifecycle metadata. Deployment is intentionally deferred.
ALTER TABLE "JournalEntry" ADD COLUMN "deletedByDeviceId" TEXT;
ALTER TABLE "BudgetTransaction" ADD COLUMN "deletedByDeviceId" TEXT;
ALTER TABLE "ExerciseDefinition" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "ExerciseDefinition" ADD COLUMN "deletedByDeviceId" TEXT;
ALTER TABLE "GymWorkout" ADD COLUMN "deletedByDeviceId" TEXT;

CREATE INDEX "ExerciseDefinition_userId_deletedAt_idx" ON "ExerciseDefinition"("userId", "deletedAt");
