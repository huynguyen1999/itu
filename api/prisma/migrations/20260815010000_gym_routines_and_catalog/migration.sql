-- AlterTable ExerciseDefinition
ALTER TABLE "ExerciseDefinition" ADD COLUMN IF NOT EXISTS "origin" TEXT NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "ExerciseDefinition" ADD COLUMN IF NOT EXISTS "catalogKey" TEXT;
ALTER TABLE "ExerciseDefinition" ADD COLUMN IF NOT EXISTS "catalogVersion" INTEGER;
ALTER TABLE "ExerciseDefinition" ADD COLUMN IF NOT EXISTS "userNotes" TEXT;
ALTER TABLE "ExerciseDefinition" ADD COLUMN IF NOT EXISTS "isFavorite" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable GymWorkout
ALTER TABLE "GymWorkout" ADD COLUMN IF NOT EXISTS "routineId" TEXT;

-- CreateTable GymRoutine
CREATE TABLE IF NOT EXISTS "GymRoutine" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedByDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GymRoutine_pkey" PRIMARY KEY ("id")
);

-- CreateTable GymRoutineExercise
CREATE TABLE IF NOT EXISTS "GymRoutineExercise" (
    "id" TEXT NOT NULL,
    "routineId" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "setCount" INTEGER NOT NULL DEFAULT 3,
    "targetRepsMin" INTEGER,
    "targetRepsMax" INTEGER,
    "targetDurationSeconds" INTEGER,
    "targetDistanceMeters" DOUBLE PRECISION,
    "restSeconds" INTEGER,
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "deletedAt" TIMESTAMP(3),
    "deletedByDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GymRoutineExercise_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ExerciseDefinition_userId_catalogKey_idx" ON "ExerciseDefinition"("userId", "catalogKey");
CREATE INDEX IF NOT EXISTS "ExerciseDefinition_userId_isFavorite_idx" ON "ExerciseDefinition"("userId", "isFavorite");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GymRoutine_userId_sortOrder_idx" ON "GymRoutine"("userId", "sortOrder");
CREATE INDEX IF NOT EXISTS "GymRoutine_userId_archivedAt_idx" ON "GymRoutine"("userId", "archivedAt");
CREATE INDEX IF NOT EXISTS "GymRoutine_userId_deletedAt_idx" ON "GymRoutine"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GymRoutineExercise_routineId_sortOrder_idx" ON "GymRoutineExercise"("routineId", "sortOrder");
CREATE INDEX IF NOT EXISTS "GymRoutineExercise_routineId_deletedAt_idx" ON "GymRoutineExercise"("routineId", "deletedAt");
CREATE INDEX IF NOT EXISTS "GymRoutineExercise_exerciseId_idx" ON "GymRoutineExercise"("exerciseId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GymWorkout_userId_routineId_idx" ON "GymWorkout"("userId", "routineId");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GymRoutine_userId_fkey') THEN
        ALTER TABLE "GymRoutine" ADD CONSTRAINT "GymRoutine_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GymRoutineExercise_routineId_fkey') THEN
        ALTER TABLE "GymRoutineExercise" ADD CONSTRAINT "GymRoutineExercise_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "GymRoutine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GymRoutineExercise_exerciseId_fkey') THEN
        ALTER TABLE "GymRoutineExercise" ADD CONSTRAINT "GymRoutineExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "ExerciseDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GymWorkout_routineId_fkey') THEN
        ALTER TABLE "GymWorkout" ADD CONSTRAINT "GymWorkout_routineId_fkey" FOREIGN KEY ("routineId") REFERENCES "GymRoutine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;
