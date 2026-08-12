DO $$
BEGIN
  CREATE TYPE "ReminderType" AS ENUM ('ABSOLUTE', 'RELATIVE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ReminderRelativeTo" AS ENUM ('DUE_AT', 'SCHEDULE_START_AT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "TaskReminder"
  ADD COLUMN IF NOT EXISTS "type" "ReminderType" NOT NULL DEFAULT 'ABSOLUTE',
  ADD COLUMN IF NOT EXISTS "relativeTo" "ReminderRelativeTo",
  ADD COLUMN IF NOT EXISTS "offsetMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "calendarDayOffset" INTEGER,
  ADD COLUMN IF NOT EXISTS "timeOfDayMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "timeZone" TEXT;

CREATE INDEX IF NOT EXISTS "TaskReminder_remindAt_status_idx"
  ON "TaskReminder"("remindAt", "status");

DO $$ BEGIN
  CREATE TYPE "CalendarProvider" AS ENUM ('GOOGLE', 'ICS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CalendarConnectionStatus" AS ENUM ('CONNECTED', 'ERROR', 'DISCONNECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "CalendarConnection" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" "CalendarProvider" NOT NULL,
  "accountEmail" TEXT,
  "encryptedRefreshToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP(3),
  "status" "CalendarConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExternalCalendar" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "connectionId" TEXT,
  "provider" "CalendarProvider" NOT NULL,
  "providerCalendarId" TEXT,
  "name" TEXT NOT NULL,
  "url" TEXT,
  "color" TEXT NOT NULL DEFAULT 'BLUE',
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "syncToken" TEXT,
  "etag" TEXT,
  "lastModified" TEXT,
  "lastFetchedAt" TIMESTAMP(3),
  "lastSuccessfulSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "channelId" TEXT,
  "resourceId" TEXT,
  "channelExpiration" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalCalendar_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExternalCalendarEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "calendarId" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "recurrenceId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "location" TEXT,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3),
  "allDay" BOOLEAN NOT NULL DEFAULT false,
  "timeZone" TEXT,
  "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
  "etag" TEXT,
  "readOnly" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExternalCalendarEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ExternalCalendar"
  ADD COLUMN IF NOT EXISTS "channelId" TEXT,
  ADD COLUMN IF NOT EXISTS "resourceId" TEXT,
  ADD COLUMN IF NOT EXISTS "channelExpiration" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "CalendarConnection_userId_idx" ON "CalendarConnection"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "CalendarConnection_userId_provider_accountEmail_key" ON "CalendarConnection"("userId", "provider", "accountEmail");
CREATE INDEX IF NOT EXISTS "ExternalCalendar_userId_idx" ON "ExternalCalendar"("userId");
CREATE INDEX IF NOT EXISTS "ExternalCalendar_connectionId_idx" ON "ExternalCalendar"("connectionId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalCalendar_connectionId_providerCalendarId_key" ON "ExternalCalendar"("connectionId", "providerCalendarId");
CREATE UNIQUE INDEX IF NOT EXISTS "ExternalCalendarEvent_calendarId_externalId_recurrenceId_key" ON "ExternalCalendarEvent"("calendarId", "externalId", "recurrenceId");
CREATE INDEX IF NOT EXISTS "ExternalCalendarEvent_startAt_idx" ON "ExternalCalendarEvent"("startAt");
CREATE INDEX IF NOT EXISTS "ExternalCalendarEvent_endAt_idx" ON "ExternalCalendarEvent"("endAt");
CREATE INDEX IF NOT EXISTS "ExternalCalendarEvent_calendarId_idx" ON "ExternalCalendarEvent"("calendarId");

DO $$ BEGIN
  ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ExternalCalendar" ADD CONSTRAINT "ExternalCalendar_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ExternalCalendar" ADD CONSTRAINT "ExternalCalendar_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ExternalCalendarEvent" ADD CONSTRAINT "ExternalCalendarEvent_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "ExternalCalendarEvent" ADD CONSTRAINT "ExternalCalendarEvent_calendarId_fkey"
    FOREIGN KEY ("calendarId") REFERENCES "ExternalCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
