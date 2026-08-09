ALTER TABLE "WebsiteUsageSummary" ADD COLUMN "url" TEXT;
ALTER TABLE "WebsiteUsageSummary" ADD COLUMN "urlKey" TEXT;

UPDATE "WebsiteUsageSummary"
SET "urlKey" = 'legacy:' || "hostname";

ALTER TABLE "WebsiteUsageSummary" ALTER COLUMN "urlKey" SET NOT NULL;
ALTER TABLE "WebsiteUsageSummary" DROP CONSTRAINT "WebsiteUsageSummary_pkey";
ALTER TABLE "WebsiteUsageSummary"
ADD CONSTRAINT "WebsiteUsageSummary_pkey"
PRIMARY KEY ("syncDeviceId", "localDate", "browserBundleId", "urlKey");

CREATE INDEX "WebsiteUsageSummary_userId_localDate_hostname_idx"
ON "WebsiteUsageSummary"("userId", "localDate", "hostname");
