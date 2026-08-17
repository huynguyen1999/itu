CREATE TYPE "UsageSource" AS ENUM ('MACOS_FOREGROUND', 'DEVICE_ACTIVITY', 'BROWSER');

ALTER TABLE "UsageSummary"
  ADD COLUMN "source" "UsageSource" NOT NULL DEFAULT 'MACOS_FOREGROUND',
  ADD COLUMN "pickups" INTEGER,
  ADD COLUMN "notifications" INTEGER;

ALTER TABLE "UsageSummary" DROP CONSTRAINT "UsageSummary_pkey";
ALTER TABLE "UsageSummary"
  ADD CONSTRAINT "UsageSummary_pkey"
  PRIMARY KEY ("syncDeviceId", "source", "localDate", "hour", "bundleId");

ALTER TABLE "WebsiteUsageSummary"
  ADD COLUMN "id" TEXT,
  ADD COLUMN "source" "UsageSource" NOT NULL DEFAULT 'BROWSER',
  ADD COLUMN "hour" INTEGER NOT NULL DEFAULT -1;

UPDATE "WebsiteUsageSummary"
SET "id" = md5(concat_ws(E'\x1f', "syncDeviceId", "localDate"::text, "browserBundleId", "urlKey"));

ALTER TABLE "WebsiteUsageSummary" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "WebsiteUsageSummary" DROP CONSTRAINT "WebsiteUsageSummary_pkey";
ALTER TABLE "WebsiteUsageSummary" ALTER COLUMN "browserBundleId" DROP NOT NULL;
ALTER TABLE "WebsiteUsageSummary"
  ADD CONSTRAINT "WebsiteUsageSummary_pkey" PRIMARY KEY ("id");

CREATE INDEX "WebsiteUsageSummary_syncDeviceId_source_localDate_hour_idx"
  ON "WebsiteUsageSummary"("syncDeviceId", "source", "localDate", "hour");

CREATE UNIQUE INDEX "WebsiteUsageSummary_device_activity_key"
  ON "WebsiteUsageSummary"("syncDeviceId", "source", "localDate", "hour", "urlKey")
  WHERE "source" = 'DEVICE_ACTIVITY';

CREATE UNIQUE INDEX "WebsiteUsageSummary_browser_key"
  ON "WebsiteUsageSummary"("syncDeviceId", "source", "localDate", "hour", "browserBundleId", "urlKey")
  WHERE "source" = 'BROWSER';
