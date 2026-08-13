ALTER TABLE "RefreshSession"
ADD COLUMN "rotationGraceUntil" TIMESTAMP(3),
ADD COLUMN "rotationRecoveryUsedAt" TIMESTAMP(3);
