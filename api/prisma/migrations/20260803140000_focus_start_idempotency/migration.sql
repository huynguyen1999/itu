ALTER TABLE "FocusSession" ADD COLUMN "startIdempotencyKey" TEXT;

CREATE UNIQUE INDEX "FocusSession_userId_startIdempotencyKey_key"
ON "FocusSession"("userId", "startIdempotencyKey");
