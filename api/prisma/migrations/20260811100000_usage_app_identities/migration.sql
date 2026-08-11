CREATE TABLE "UsageAppIdentity" (
    "userId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "iconHash" TEXT,
    "iconStorageKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UsageAppIdentity_pkey" PRIMARY KEY ("userId", "bundleId")
);

ALTER TABLE "UsageAppIdentity" ADD CONSTRAINT "UsageAppIdentity_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
