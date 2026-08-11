ALTER TABLE "WebsiteActivitySession"
  ALTER COLUMN "url" SET NOT NULL;

CREATE INDEX "WebsiteActivitySession_userId_url_startedAt_idx"
  ON "WebsiteActivitySession"("userId", "url", "startedAt");
