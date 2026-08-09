ALTER TYPE "SyncDevicePlatform" ADD VALUE IF NOT EXISTS 'MACOS';

ALTER TABLE "UserPreferences"
ADD COLUMN IF NOT EXISTS "usagePreferences" JSONB NOT NULL DEFAULT '{}';

CREATE TABLE "UsageSummary" (
    "userId" TEXT NOT NULL,
    "syncDeviceId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "bundleId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "activeSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UsageSummary_pkey" PRIMARY KEY ("syncDeviceId", "localDate", "bundleId")
);

CREATE INDEX "UsageSummary_userId_localDate_idx" ON "UsageSummary"("userId", "localDate");
CREATE INDEX "UsageSummary_syncDeviceId_localDate_idx" ON "UsageSummary"("syncDeviceId", "localDate");

ALTER TABLE "UsageSummary" ADD CONSTRAINT "UsageSummary_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageSummary" ADD CONSTRAINT "UsageSummary_syncDeviceId_fkey"
  FOREIGN KEY ("syncDeviceId") REFERENCES "SyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
