CREATE TABLE "WebsiteUsageSummary" (
    "userId" TEXT NOT NULL,
    "syncDeviceId" TEXT NOT NULL,
    "localDate" DATE NOT NULL,
    "browserBundleId" TEXT NOT NULL,
    "browserDisplayName" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "activeSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WebsiteUsageSummary_pkey" PRIMARY KEY ("syncDeviceId", "localDate", "browserBundleId", "hostname")
);

CREATE INDEX "WebsiteUsageSummary_userId_localDate_idx" ON "WebsiteUsageSummary"("userId", "localDate");
CREATE INDEX "WebsiteUsageSummary_syncDeviceId_localDate_idx" ON "WebsiteUsageSummary"("syncDeviceId", "localDate");

ALTER TABLE "WebsiteUsageSummary" ADD CONSTRAINT "WebsiteUsageSummary_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WebsiteUsageSummary" ADD CONSTRAINT "WebsiteUsageSummary_syncDeviceId_fkey"
  FOREIGN KEY ("syncDeviceId") REFERENCES "SyncDevice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
