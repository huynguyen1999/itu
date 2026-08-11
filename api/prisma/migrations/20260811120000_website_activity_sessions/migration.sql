CREATE TABLE "WebsiteActivitySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "browserBundleId" TEXT NOT NULL,
    "browserDisplayName" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "activeSeconds" INTEGER NOT NULL,
    "hostname" TEXT NOT NULL,
    "url" TEXT,
    "pageTitle" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "timezone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WebsiteActivitySession_pkey" PRIMARY KEY ("installationId", "id")
);

CREATE UNIQUE INDEX "WebsiteActivitySession_userId_installationId_id_key"
  ON "WebsiteActivitySession"("userId", "installationId", "id");
CREATE INDEX "WebsiteActivitySession_userId_startedAt_idx"
  ON "WebsiteActivitySession"("userId", "startedAt");
CREATE INDEX "WebsiteActivitySession_userId_hostname_startedAt_idx"
  ON "WebsiteActivitySession"("userId", "hostname", "startedAt");
CREATE INDEX "WebsiteActivitySession_userId_installationId_startedAt_idx"
  ON "WebsiteActivitySession"("userId", "installationId", "startedAt");

ALTER TABLE "WebsiteActivitySession" ADD CONSTRAINT "WebsiteActivitySession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
