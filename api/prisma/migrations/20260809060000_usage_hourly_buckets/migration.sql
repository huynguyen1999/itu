ALTER TABLE "UsageSummary" ADD COLUMN "hour" INTEGER NOT NULL DEFAULT -1;

ALTER TABLE "UsageSummary" DROP CONSTRAINT "UsageSummary_pkey";
ALTER TABLE "UsageSummary"
ADD CONSTRAINT "UsageSummary_pkey" PRIMARY KEY ("syncDeviceId", "localDate", "hour", "bundleId");
