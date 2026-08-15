-- Habits V2 keeps reminder rules separate from concrete deliveries and stores
-- journal origin context without a cascading relationship to Habit.
ALTER TYPE "ScheduledJobType" ADD VALUE 'HABIT_REMINDER';

CREATE TYPE "HabitReminderDeliveryStatus" AS ENUM ('SCHEDULED', 'SNOOZED', 'DELIVERED', 'DISMISSED', 'CANCELED');

CREATE TABLE "HabitReminderDelivery" (
    "id" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "occurrenceId" TEXT,
    "localDate" DATE NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "status" "HabitReminderDeliveryStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledJobId" TEXT,
    "snoozedFrom" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitReminderDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HabitReminderDelivery_scheduledJobId_key" ON "HabitReminderDelivery"("scheduledJobId");
CREATE UNIQUE INDEX "HabitReminderDelivery_reminderId_localDate_key" ON "HabitReminderDelivery"("reminderId", "localDate");
CREATE INDEX "HabitReminderDelivery_status_scheduledFor_idx" ON "HabitReminderDelivery"("status", "scheduledFor");
CREATE INDEX "HabitReminderDelivery_occurrenceId_idx" ON "HabitReminderDelivery"("occurrenceId");

ALTER TABLE "HabitReminderDelivery" ADD CONSTRAINT "HabitReminderDelivery_reminderId_fkey"
  FOREIGN KEY ("reminderId") REFERENCES "HabitReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HabitReminderDelivery" ADD CONSTRAINT "HabitReminderDelivery_occurrenceId_fkey"
  FOREIGN KEY ("occurrenceId") REFERENCES "HabitOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "JournalEntry" ADD COLUMN "contextType" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN "contextId" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN "contextData" JSONB;
CREATE INDEX "JournalEntry_userId_contextType_contextId_idx" ON "JournalEntry"("userId", "contextType", "contextId");
