-- CreateTable UserPreferences if not exists
CREATE TABLE IF NOT EXISTS "UserPreferences" (
    "userId" TEXT NOT NULL,
    "taskPreferences" JSONB NOT NULL DEFAULT '{}',
    "focusPreferences" JSONB NOT NULL DEFAULT '{}',
    "habitPreferences" JSONB NOT NULL DEFAULT '{}',
    "matrixPreferences" JSONB NOT NULL DEFAULT '{}',
    "growthPreferences" JSONB NOT NULL DEFAULT '{}',
    "learnPreferences" JSONB NOT NULL DEFAULT '{}',
    "journalPreferences" JSONB NOT NULL DEFAULT '{}',
    "moneyPreferences" JSONB NOT NULL DEFAULT '{}',
    "budgetPreferences" JSONB NOT NULL DEFAULT '{}',
    "gymPreferences" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'UserPreferences_userId_fkey'
    ) THEN
        ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
