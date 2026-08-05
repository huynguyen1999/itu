ALTER TABLE "ReviewLog" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "ReviewLog_userId_idempotencyKey_key"
ON "ReviewLog"("userId", "idempotencyKey");
