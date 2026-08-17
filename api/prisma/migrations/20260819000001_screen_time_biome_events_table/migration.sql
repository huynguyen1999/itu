-- CreateTable
CREATE TABLE "UsageImportEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collectorDeviceId" TEXT NOT NULL,
    "sourceDeviceId" TEXT NOT NULL,
    "sourceDeviceName" TEXT,
    "source" "UsageSource" NOT NULL DEFAULT 'SCREEN_TIME_BIOME',
    "eventId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageImportEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageImportEvent_userId_source_eventId_key" ON "UsageImportEvent"("userId", "source", "eventId");

-- CreateIndex
CREATE INDEX "UsageImportEvent_userId_startedAt_idx" ON "UsageImportEvent"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "UsageImportEvent_userId_sourceDeviceId_idx" ON "UsageImportEvent"("userId", "sourceDeviceId");

-- AddForeignKey
ALTER TABLE "UsageImportEvent" ADD CONSTRAINT "UsageImportEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
