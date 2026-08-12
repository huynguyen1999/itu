-- CreateTable
CREATE TABLE "SyncFieldClock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fieldName" TEXT NOT NULL,
    "editedAt" TIMESTAMP(3) NOT NULL,
    "deviceId" TEXT NOT NULL,
    "mutationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncFieldClock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SyncFieldClock_userId_entityType_entityId_fieldName_key" ON "SyncFieldClock"("userId", "entityType", "entityId", "fieldName");

-- CreateIndex
CREATE INDEX "SyncFieldClock_userId_entityType_entityId_idx" ON "SyncFieldClock"("userId", "entityType", "entityId");

-- AddForeignKey
ALTER TABLE "SyncFieldClock" ADD CONSTRAINT "SyncFieldClock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
