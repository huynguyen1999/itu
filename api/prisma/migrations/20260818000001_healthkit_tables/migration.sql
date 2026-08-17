-- CreateTable
CREATE TABLE "HealthSummary" (
    "userId" TEXT NOT NULL,
    "syncDeviceId" TEXT NOT NULL,
    "source" "UsageSource" NOT NULL DEFAULT 'HEALTH_KIT',
    "localDate" DATE NOT NULL,
    "steps" INTEGER NOT NULL,
    "walkingRunningDistanceMeters" DOUBLE PRECISION NOT NULL,
    "activeEnergyKcal" DOUBLE PRECISION NOT NULL,
    "exerciseMinutes" INTEGER NOT NULL,
    "standHours" INTEGER,
    "sleepMinutes" INTEGER,
    "sleepStart" TIMESTAMP(3),
    "sleepEnd" TIMESTAMP(3),
    "restingHeartRateBpm" DOUBLE PRECISION,
    "hrvMilliseconds" DOUBLE PRECISION,
    "workoutCount" INTEGER NOT NULL,
    "workoutMinutes" INTEGER NOT NULL,
    "workoutEnergyKcal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthSummary_pkey" PRIMARY KEY ("userId", "source", "syncDeviceId", "localDate")
);

-- CreateTable
CREATE TABLE "HealthWorkout" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "syncDeviceId" TEXT NOT NULL,
    "source" "UsageSource" NOT NULL DEFAULT 'HEALTH_KIT',
    "healthKitUUID" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "energyKcal" DOUBLE PRECISION,
    "sourceBundleId" TEXT,
    "deviceName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthWorkout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HealthSummary_userId_localDate_idx" ON "HealthSummary"("userId", "localDate");
CREATE INDEX "HealthSummary_syncDeviceId_localDate_idx" ON "HealthSummary"("syncDeviceId", "localDate");
CREATE UNIQUE INDEX "HealthWorkout_userId_source_syncDeviceId_healthKitUUID_key"
    ON "HealthWorkout"("userId", "source", "syncDeviceId", "healthKitUUID");
CREATE INDEX "HealthWorkout_userId_startedAt_idx" ON "HealthWorkout"("userId", "startedAt");
CREATE INDEX "HealthWorkout_syncDeviceId_startedAt_idx" ON "HealthWorkout"("syncDeviceId", "startedAt");

-- AddForeignKey
ALTER TABLE "HealthSummary" ADD CONSTRAINT "HealthSummary_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthSummary" ADD CONSTRAINT "HealthSummary_syncDeviceId_fkey"
    FOREIGN KEY ("syncDeviceId") REFERENCES "SyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWorkout" ADD CONSTRAINT "HealthWorkout_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HealthWorkout" ADD CONSTRAINT "HealthWorkout_syncDeviceId_fkey"
    FOREIGN KEY ("syncDeviceId") REFERENCES "SyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
