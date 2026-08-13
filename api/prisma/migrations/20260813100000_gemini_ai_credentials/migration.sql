CREATE TYPE "AiCredentialStatus" AS ENUM ('HEALTHY', 'RATE_LIMITED', 'QUOTA_EXHAUSTED', 'INVALID_KEY', 'PROVIDER_ERROR');

CREATE TABLE "AiCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "encryptedApiKey" TEXT NOT NULL,
    "keyHint" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" "AiCredentialStatus" NOT NULL DEFAULT 'HEALTHY',
    "lastError" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiCredential_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiCredential_userId_enabled_status_cooldownUntil_lastUsedAt_idx"
ON "AiCredential"("userId", "enabled", "status", "cooldownUntil", "lastUsedAt");

ALTER TABLE "AiCredential"
ADD CONSTRAINT "AiCredential_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
