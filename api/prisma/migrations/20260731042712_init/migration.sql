-- CreateEnum
CREATE TYPE "OAuthProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "CardType" AS ENUM ('BASIC', 'REVERSE');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CardSide" AS ENUM ('PROMPT', 'ANSWER');

-- CreateEnum
CREATE TYPE "ReviewDirection" AS ENUM ('FRONT_TO_BACK', 'BACK_TO_FRONT');

-- CreateEnum
CREATE TYPE "ReviewGrade" AS ENUM ('AGAIN', 'HARD', 'GOOD', 'EASY');

-- CreateEnum
CREATE TYPE "StudyMode" AS ENUM ('DUE', 'CRAM');

-- CreateEnum
CREATE TYPE "AiJobType" AS ENUM ('CARD_GENERATION', 'SESSION_FEEDBACK');

-- CreateEnum
CREATE TYPE "AiJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScheduledJobType" AS ENUM ('ACCOUNT_DELETE', 'TRASH_PURGE', 'TASK_REMINDER');

-- CreateEnum
CREATE TYPE "ScheduledJobStatus" AS ENUM ('SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "SyncDevicePlatform" AS ENUM ('IOS', 'WATCHOS', 'WEB');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('NONE', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('INBOX', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'SNOOZED', 'DISMISSED', 'DELIVERED', 'CANCELED');

-- CreateEnum
CREATE TYPE "FocusMode" AS ENUM ('COUNTDOWN', 'STOPWATCH');

-- CreateEnum
CREATE TYPE "FocusPhase" AS ENUM ('WORK', 'SHORT_BREAK', 'LONG_BREAK');

-- CreateEnum
CREATE TYPE "FocusSessionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "FocusSoundSource" AS ENUM ('UPLOAD');

-- CreateEnum
CREATE TYPE "HabitTargetType" AS ENUM ('BOOLEAN', 'COUNT', 'DURATION', 'QUANTITY');

-- CreateEnum
CREATE TYPE "HabitScheduleType" AS ENUM ('WEEKDAYS', 'INTERVAL', 'TIMES_PER_PERIOD');

-- CreateEnum
CREATE TYPE "HabitOccurrenceStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "HabitDirection" AS ENUM ('BUILD', 'LIMIT');

-- CreateEnum
CREATE TYPE "HabitProgressSource" AS ENUM ('MANUAL', 'FOCUS_SESSION', 'TASK_COMPLETION', 'HEALTH', 'SCREEN_TIME', 'CALENDAR', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "HabitTaskSyncPolicy" AS ENUM ('NONE', 'TASK_TO_HABIT', 'HABIT_TO_TASK', 'BIDIRECTIONAL');

-- CreateEnum
CREATE TYPE "GrowthSourceType" AS ENUM ('TASK', 'HABIT', 'FOCUS_PRESET', 'REVIEW_DECK');

-- CreateEnum
CREATE TYPE "GrowthProgressKind" AS ENUM ('ATTRIBUTE', 'SKILL');

-- CreateEnum
CREATE TYPE "GrowthCurrency" AS ENUM ('SKILL_XP', 'COIN');

-- CreateEnum
CREATE TYPE "GrowthLedgerKind" AS ENUM ('ACTIVITY_AWARD', 'REVERSAL', 'REWARD_PURCHASE', 'ADMINISTRATIVE_ADJUSTMENT', 'RESET_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "GrowthRewardPreset" AS ENUM ('LIGHT', 'STANDARD', 'STRONG');

-- CreateEnum
CREATE TYPE "GrowthResetScope" AS ENUM ('SKILL', 'ALL_XP', 'FULL');

-- CreateEnum
CREATE TYPE "GrowthOnboardingState" AS ENUM ('NOT_STARTED', 'SKILLS_OFFERED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "GrowthScalingMode" AS ENUM ('FIXED', 'LINEAR');

-- CreateEnum
CREATE TYPE "GrowthInventoryTransactionKind" AS ENUM ('PURCHASE', 'TASK_AWARD', 'CONSUMPTION', 'REVERSAL', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "DeckIcon" AS ENUM ('INBOX', 'BOOK', 'BRAIN', 'LANGUAGE', 'FLASK', 'CODE', 'LEAF', 'CALCULATOR', 'GLOBE');

-- CreateEnum
CREATE TYPE "DeckColor" AS ENUM ('SLATE', 'EMERALD', 'TEAL', 'BLUE', 'INDIGO', 'VIOLET', 'ROSE', 'AMBER');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "username" TEXT,
    "displayName" TEXT,
    "passwordHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletionRequestedAt" TIMESTAMP(3),
    "deletionScheduledFor" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "bannedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "RefreshSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RefreshSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthHandoff" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "codeHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SyncDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "SyncDevicePlatform" NOT NULL,
    "pushToken" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastKnownSyncCursor" TEXT,
    "notificationPreference" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "OAuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deck" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "icon" "DeckIcon" NOT NULL DEFAULT 'BOOK',
    "color" "DeckColor" NOT NULL DEFAULT 'TEAL',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Deck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "deckId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "CardType" NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "promptRichText" TEXT NOT NULL,
    "answerRichText" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardImage" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "side" "CardSide" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CardImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "direction" "ReviewDirection" NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "stability" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "difficulty" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "lapseCount" INTEGER NOT NULL DEFAULT 0,
    "reviewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudySession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "deckId" TEXT,
    "mode" "StudyMode" NOT NULL,
    "rating" INTEGER,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "reviewed" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StudySession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "cardDeckId" TEXT,
    "cardPromptRichText" TEXT NOT NULL DEFAULT '',
    "cardAnswerRichText" TEXT NOT NULL DEFAULT '',
    "cardImages" JSONB NOT NULL DEFAULT '[]',
    "direction" "ReviewDirection" NOT NULL,
    "grade" "ReviewGrade" NOT NULL,
    "userAnswer" TEXT,
    "responseMs" INTEGER,
    "previousDueAt" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3) NOT NULL,
    "previousInterval" INTEGER NOT NULL,
    "nextInterval" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "AiJobType" NOT NULL,
    "status" "AiJobStatus" NOT NULL DEFAULT 'QUEUED',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AiJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSessionFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "weakAreas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nextSteps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSessionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScheduledJob" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" "ScheduledJobType" NOT NULL,
    "status" "ScheduledJobStatus" NOT NULL DEFAULT 'SCHEDULED',
    "payload" JSONB NOT NULL,
    "runAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "lockedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScheduledJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncMutation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncMutation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncChange" (
    "cursor" SERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncChange_pkey" PRIMARY KEY ("cursor")
);

-- CreateTable
CREATE TABLE "TaskList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'TEAL',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TaskList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskListId" TEXT,
    "sectionId" TEXT,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "descriptionMarkdown" TEXT NOT NULL DEFAULT '',
    "priority" "TaskPriority" NOT NULL DEFAULT 'NONE',
    "important" BOOLEAN NOT NULL DEFAULT false,
    "urgentOverride" BOOLEAN,
    "scheduledStartAt" TIMESTAMP(3),
    "scheduledEndAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "sourceHabitDate" TIMESTAMP(3),
    "estimatedMinutes" INTEGER,
    "recurrenceRule" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'INBOX',
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sourceHabitId" TEXT,
    "sourceHabitOccurrenceId" TEXT,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskSection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskListId" TEXT,
    "title" TEXT NOT NULL,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "TaskSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT 'SLATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskTagAssignment" (
    "taskId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "TaskTagAssignment_pkey" PRIMARY KEY ("taskId","tagId")
);

-- CreateTable
CREATE TABLE "TaskReminder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "persistent" BOOLEAN NOT NULL DEFAULT false,
    "snoozedFrom" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "scheduledJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reminderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskOccurrence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "occurrenceDate" TIMESTAMP(3) NOT NULL,
    "status" "HabitOccurrenceStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusPreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workMinutes" INTEGER NOT NULL,
    "shortBreakMinutes" INTEGER NOT NULL,
    "longBreakMinutes" INTEGER NOT NULL,
    "cyclesBeforeLong" INTEGER NOT NULL,
    "autoStartBreaks" BOOLEAN NOT NULL DEFAULT false,
    "autoStartWork" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FocusPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusPolicy" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "blockedApps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockedSites" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "commitment" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FocusPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "presetId" TEXT,
    "policyId" TEXT,
    "mode" "FocusMode" NOT NULL,
    "phase" "FocusPhase" NOT NULL,
    "status" "FocusSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "plannedSeconds" INTEGER,
    "accumulatedPauseSecs" INTEGER NOT NULL DEFAULT 0,
    "cycle" INTEGER NOT NULL DEFAULT 1,
    "taskTitleSnapshot" TEXT,
    "taskListTitleSnapshot" TEXT,
    "tagNamesSnapshot" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pausedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "adjustedAt" TIMESTAMP(3),
    "adjustedStartedAt" TIMESTAMP(3),
    "adjustedCompletedAt" TIMESTAMP(3),
    "reflection" TEXT,
    "ownerDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FocusSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusSound" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "durationSeconds" INTEGER,
    "source" "FocusSoundSource" NOT NULL DEFAULT 'UPLOAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "FocusSound_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusSoundPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "soundKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "volume" INTEGER NOT NULL DEFAULT 55,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FocusSoundPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FocusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusInterruption" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FocusInterruption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Habit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'CHECK',
    "color" TEXT NOT NULL DEFAULT 'EMERALD',
    "targetType" "HabitTargetType" NOT NULL,
    "targetValue" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unit" TEXT,
    "scheduleType" "HabitScheduleType" NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "intervalDays" INTEGER,
    "timesPerPeriod" INTEGER,
    "period" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "allowedSkips" INTEGER NOT NULL DEFAULT 0,
    "restDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "taskTemplateId" TEXT,
    "showInTasks" BOOLEAN NOT NULL DEFAULT false,
    "taskListId" TEXT,
    "focusPresetId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "direction" "HabitDirection" NOT NULL DEFAULT 'BUILD',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "timeBlockId" TEXT,
    "taskTemplateConfigId" TEXT,

    CONSTRAINT "Habit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitTimeBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'CLOCK',
    "color" TEXT NOT NULL DEFAULT 'SLATE',
    "startLocal" TEXT NOT NULL,
    "endLocal" TEXT NOT NULL,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitTimeBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitTaskTemplate" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "descriptionMarkdown" TEXT NOT NULL DEFAULT '',
    "taskListId" TEXT,
    "sectionId" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'NONE',
    "estimatedMinutes" INTEGER,
    "tagIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "syncPolicy" "HabitTaskSyncPolicy" NOT NULL DEFAULT 'NONE',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitTaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitChecklistItem" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitTagAssignment" (
    "habitId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "HabitTagAssignment_pkey" PRIMARY KEY ("habitId","tagId")
);

-- CreateTable
CREATE TABLE "HabitReminder" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "timeLocal" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitReminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitOccurrence" (
    "id" TEXT NOT NULL,
    "habitId" TEXT NOT NULL,
    "occurrenceDate" TIMESTAMP(3) NOT NULL,
    "status" "HabitOccurrenceStatus" NOT NULL DEFAULT 'PENDING',
    "statusSource" "HabitProgressSource",
    "statusChangedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HabitOccurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitOccurrenceChecklistItem" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "title" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "HabitOccurrenceChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitProgressLog" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "source" "HabitProgressSource" NOT NULL DEFAULT 'MANUAL',
    "sourceEventId" TEXT,
    "focusSessionId" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "adjusted" BOOLEAN NOT NULL DEFAULT false,
    "rewardEligible" BOOLEAN NOT NULL DEFAULT false,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalAt" TIMESTAMP(3),

    CONSTRAINT "HabitProgressLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HabitCheckIn" (
    "id" TEXT NOT NULL,
    "occurrenceId" TEXT NOT NULL,
    "focusSessionId" TEXT,
    "value" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "adjusted" BOOLEAN NOT NULL DEFAULT false,
    "rewardEligible" BOOLEAN NOT NULL DEFAULT false,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originalCheckedAt" TIMESTAMP(3),

    CONSTRAINT "HabitCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountBaseXp" INTEGER NOT NULL DEFAULT 100,
    "activeCycleId" TEXT NOT NULL,
    "onboardingState" "GrowthOnboardingState" NOT NULL DEFAULT 'NOT_STARTED',
    "rewardPreset" "GrowthRewardPreset" NOT NULL DEFAULT 'STANDARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthCycle" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "GrowthCycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "scope" "GrowthResetScope" NOT NULL,
    "skillId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "keepEarningRules" BOOLEAN NOT NULL DEFAULT true,
    "keepShopRewards" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthSkill" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "GrowthProgressKind" NOT NULL DEFAULT 'SKILL',
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'SPARKLES',
    "color" TEXT NOT NULL DEFAULT 'AMBER',
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseXp" INTEGER NOT NULL DEFAULT 100,
    "starterKey" TEXT,
    "cycleId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GrowthSkill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthEarningRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" "GrowthSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "coinReward" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "scalingMode" "GrowthScalingMode" NOT NULL DEFAULT 'FIXED',
    "maxRewardCap" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GrowthEarningRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthEarningRuleItem" (
    "ruleId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "GrowthEarningRuleItem_pkey" PRIMARY KEY ("ruleId","itemId")
);

-- CreateTable
CREATE TABLE "GrowthEarningRuleSkill" (
    "ruleId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "xpReward" INTEGER NOT NULL,

    CONSTRAINT "GrowthEarningRuleSkill_pkey" PRIMARY KEY ("ruleId","skillId")
);

-- CreateTable
CREATE TABLE "GrowthRewardPresetSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preset" "GrowthRewardPreset" NOT NULL,
    "sourceType" "GrowthSourceType" NOT NULL,
    "coinReward" INTEGER NOT NULL DEFAULT 0,
    "xpRewardPerSkill" INTEGER NOT NULL DEFAULT 0,
    "scalingMode" "GrowthScalingMode" NOT NULL DEFAULT 'FIXED',
    "maxRewardCap" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthRewardPresetSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthTaskRewardDefault" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskListId" TEXT,
    "coinReward" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GrowthTaskRewardDefault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthTaskRewardDefaultItem" (
    "defaultId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "GrowthTaskRewardDefaultItem_pkey" PRIMARY KEY ("defaultId","itemId")
);

-- CreateTable
CREATE TABLE "GrowthTaskRewardDefaultSkill" (
    "defaultId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "xpReward" INTEGER NOT NULL,

    CONSTRAINT "GrowthTaskRewardDefaultSkill_pkey" PRIMARY KEY ("defaultId","skillId")
);

-- CreateTable
CREATE TABLE "GrowthLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "currency" "GrowthCurrency" NOT NULL,
    "skillId" TEXT,
    "amount" INTEGER NOT NULL,
    "kind" "GrowthLedgerKind" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "entryKey" TEXT NOT NULL,
    "reversalOfId" TEXT,
    "cycleId" TEXT,
    "titleSnapshot" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthShopReward" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'GIFT',
    "color" TEXT NOT NULL DEFAULT 'ROSE',
    "price" INTEGER,
    "listedInShop" BOOLEAN NOT NULL DEFAULT true,
    "repeatable" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "categoryId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GrowthShopReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthItemCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "GrowthItemCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthInventoryTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "kind" "GrowthInventoryTransactionKind" NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "entryKey" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthInventoryTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GrowthRewardRedemption" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "ledgerEntryId" TEXT NOT NULL,
    "rewardNameSnapshot" TEXT NOT NULL,
    "descriptionSnapshot" TEXT NOT NULL,
    "priceSnapshot" INTEGER NOT NULL,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GrowthRewardRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshSession_tokenHash_key" ON "RefreshSession"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshSession_userId_revokedAt_idx" ON "RefreshSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "RefreshSession_expiresAt_idx" ON "RefreshSession"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthHandoff_codeHash_key" ON "OAuthHandoff"("codeHash");

-- CreateIndex
CREATE INDEX "OAuthHandoff_expiresAt_idx" ON "OAuthHandoff"("expiresAt");

-- CreateIndex
CREATE INDEX "SyncDevice_userId_platform_idx" ON "SyncDevice"("userId", "platform");

-- CreateIndex
CREATE INDEX "SyncDevice_userId_lastSeenAt_idx" ON "SyncDevice"("userId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "OAuthIdentity_userId_idx" ON "OAuthIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthIdentity_provider_providerUserId_key" ON "OAuthIdentity"("provider", "providerUserId");

-- CreateIndex
CREATE INDEX "Deck_userId_archived_idx" ON "Deck"("userId", "archived");

-- CreateIndex
CREATE INDEX "Card_userId_deckId_status_idx" ON "Card"("userId", "deckId", "status");

-- CreateIndex
CREATE INDEX "CardImage_userId_cardId_side_idx" ON "CardImage"("userId", "cardId", "side");

-- CreateIndex
CREATE INDEX "CardImage_userId_deletedAt_idx" ON "CardImage"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "ReviewState_userId_dueAt_idx" ON "ReviewState"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReviewState_cardId_direction_key" ON "ReviewState"("cardId", "direction");

-- CreateIndex
CREATE INDEX "StudySession_userId_startedAt_idx" ON "StudySession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "ReviewLog_userId_sessionId_idx" ON "ReviewLog"("userId", "sessionId");

-- CreateIndex
CREATE INDEX "ReviewLog_cardId_createdAt_idx" ON "ReviewLog"("cardId", "createdAt");

-- CreateIndex
CREATE INDEX "ReviewLog_userId_cardDeckId_createdAt_idx" ON "ReviewLog"("userId", "cardDeckId", "createdAt");

-- CreateIndex
CREATE INDEX "AiJob_userId_status_createdAt_idx" ON "AiJob"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AiSessionFeedback_sessionId_key" ON "AiSessionFeedback"("sessionId");

-- CreateIndex
CREATE INDEX "AiSessionFeedback_userId_createdAt_idx" ON "AiSessionFeedback"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ScheduledJob_status_runAt_idx" ON "ScheduledJob"("status", "runAt");

-- CreateIndex
CREATE INDEX "ScheduledJob_status_lockedAt_idx" ON "ScheduledJob"("status", "lockedAt");

-- CreateIndex
CREATE INDEX "ScheduledJob_userId_status_runAt_idx" ON "ScheduledJob"("userId", "status", "runAt");

-- CreateIndex
CREATE INDEX "SyncMutation_userId_processedAt_idx" ON "SyncMutation"("userId", "processedAt");

-- CreateIndex
CREATE INDEX "SyncChange_userId_cursor_idx" ON "SyncChange"("userId", "cursor");

-- CreateIndex
CREATE INDEX "TaskList_userId_archivedAt_updatedAt_idx" ON "TaskList"("userId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "TaskList_userId_isDefault_idx" ON "TaskList"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "Task_sourceHabitOccurrenceId_key" ON "Task"("sourceHabitOccurrenceId");

-- CreateIndex
CREATE INDEX "Task_userId_status_dueAt_idx" ON "Task"("userId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_userId_sortOrder_idx" ON "Task"("userId", "sortOrder");

-- CreateIndex
CREATE INDEX "Task_userId_scheduledStartAt_idx" ON "Task"("userId", "scheduledStartAt");

-- CreateIndex
CREATE INDEX "Task_userId_deletedAt_idx" ON "Task"("userId", "deletedAt");

-- CreateIndex
CREATE INDEX "Task_taskListId_status_idx" ON "Task"("taskListId", "status");

-- CreateIndex
CREATE INDEX "Task_sectionId_sortOrder_idx" ON "Task"("sectionId", "sortOrder");

-- CreateIndex
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- CreateIndex
CREATE INDEX "Task_sourceHabitId_idx" ON "Task"("sourceHabitId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_userId_sourceHabitId_sourceHabitDate_key" ON "Task"("userId", "sourceHabitId", "sourceHabitDate");

-- CreateIndex
CREATE INDEX "TaskSection_userId_taskListId_sortOrder_idx" ON "TaskSection"("userId", "taskListId", "sortOrder");

-- CreateIndex
CREATE INDEX "TaskTag_userId_name_idx" ON "TaskTag"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "TaskTag_userId_name_key" ON "TaskTag"("userId", "name");

-- CreateIndex
CREATE INDEX "TaskTagAssignment_tagId_idx" ON "TaskTagAssignment"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "TaskReminder_scheduledJobId_key" ON "TaskReminder"("scheduledJobId");

-- CreateIndex
CREATE INDEX "TaskReminder_userId_status_remindAt_idx" ON "TaskReminder"("userId", "status", "remindAt");

-- CreateIndex
CREATE INDEX "TaskReminder_taskId_idx" ON "TaskReminder"("taskId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_reminderId_key" ON "Notification"("reminderId");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "TaskOccurrence_userId_occurrenceDate_idx" ON "TaskOccurrence"("userId", "occurrenceDate");

-- CreateIndex
CREATE UNIQUE INDEX "TaskOccurrence_taskId_occurrenceDate_key" ON "TaskOccurrence"("taskId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "FocusPreset_userId_isDefault_idx" ON "FocusPreset"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "FocusPreset_userId_name_key" ON "FocusPreset"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "FocusPolicy_userId_name_key" ON "FocusPolicy"("userId", "name");

-- CreateIndex
CREATE INDEX "FocusSession_userId_status_idx" ON "FocusSession"("userId", "status");

-- CreateIndex
CREATE INDEX "FocusSession_userId_startedAt_idx" ON "FocusSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "FocusSession_taskId_startedAt_idx" ON "FocusSession"("taskId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FocusSound_storageKey_key" ON "FocusSound"("storageKey");

-- CreateIndex
CREATE INDEX "FocusSound_userId_createdAt_idx" ON "FocusSound"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "FocusSoundPreference_userId_sortOrder_idx" ON "FocusSoundPreference"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "FocusSoundPreference_userId_soundKey_key" ON "FocusSoundPreference"("userId", "soundKey");

-- CreateIndex
CREATE INDEX "FocusEvent_sessionId_createdAt_idx" ON "FocusEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FocusEvent_sessionId_idempotencyKey_key" ON "FocusEvent"("sessionId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "FocusInterruption_sessionId_createdAt_idx" ON "FocusInterruption"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Habit_taskTemplateConfigId_key" ON "Habit"("taskTemplateConfigId");

-- CreateIndex
CREATE INDEX "Habit_userId_archivedAt_idx" ON "Habit"("userId", "archivedAt");

-- CreateIndex
CREATE INDEX "HabitTimeBlock_userId_sortOrder_idx" ON "HabitTimeBlock"("userId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "HabitTimeBlock_userId_name_key" ON "HabitTimeBlock"("userId", "name");

-- CreateIndex
CREATE INDEX "HabitTaskTemplate_userId_idx" ON "HabitTaskTemplate"("userId");

-- CreateIndex
CREATE INDEX "HabitChecklistItem_habitId_sortOrder_idx" ON "HabitChecklistItem"("habitId", "sortOrder");

-- CreateIndex
CREATE INDEX "HabitTagAssignment_tagId_idx" ON "HabitTagAssignment"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitReminder_habitId_timeLocal_key" ON "HabitReminder"("habitId", "timeLocal");

-- CreateIndex
CREATE INDEX "HabitOccurrence_occurrenceDate_status_idx" ON "HabitOccurrence"("occurrenceDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HabitOccurrence_habitId_occurrenceDate_key" ON "HabitOccurrence"("habitId", "occurrenceDate");

-- CreateIndex
CREATE INDEX "HabitOccurrenceChecklistItem_occurrenceId_sortOrder_idx" ON "HabitOccurrenceChecklistItem"("occurrenceId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "HabitOccurrenceChecklistItem_occurrenceId_sourceItemId_key" ON "HabitOccurrenceChecklistItem"("occurrenceId", "sourceItemId");

-- CreateIndex
CREATE INDEX "HabitProgressLog_occurrenceId_recordedAt_idx" ON "HabitProgressLog"("occurrenceId", "recordedAt");

-- CreateIndex
CREATE INDEX "HabitProgressLog_focusSessionId_idx" ON "HabitProgressLog"("focusSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitProgressLog_source_sourceEventId_key" ON "HabitProgressLog"("source", "sourceEventId");

-- CreateIndex
CREATE UNIQUE INDEX "HabitCheckIn_occurrenceId_key" ON "HabitCheckIn"("occurrenceId");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthProfile_userId_key" ON "GrowthProfile"("userId");

-- CreateIndex
CREATE INDEX "GrowthCycle_userId_startedAt_idx" ON "GrowthCycle"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "GrowthReset_userId_createdAt_idx" ON "GrowthReset"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthReset_userId_idempotencyKey_key" ON "GrowthReset"("userId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "GrowthSkill_userId_kind_archivedAt_sortOrder_idx" ON "GrowthSkill"("userId", "kind", "archivedAt", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthSkill_userId_kind_name_key" ON "GrowthSkill"("userId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthSkill_userId_starterKey_key" ON "GrowthSkill"("userId", "starterKey");

-- CreateIndex
CREATE INDEX "GrowthEarningRule_userId_sourceType_idx" ON "GrowthEarningRule"("userId", "sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthEarningRule_userId_sourceType_sourceId_key" ON "GrowthEarningRule"("userId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "GrowthEarningRuleItem_itemId_idx" ON "GrowthEarningRuleItem"("itemId");

-- CreateIndex
CREATE INDEX "GrowthEarningRuleSkill_skillId_idx" ON "GrowthEarningRuleSkill"("skillId");

-- CreateIndex
CREATE INDEX "GrowthRewardPresetSetting_userId_preset_idx" ON "GrowthRewardPresetSetting"("userId", "preset");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthRewardPresetSetting_userId_preset_sourceType_key" ON "GrowthRewardPresetSetting"("userId", "preset", "sourceType");

-- CreateIndex
CREATE INDEX "GrowthTaskRewardDefault_userId_idx" ON "GrowthTaskRewardDefault"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthTaskRewardDefault_userId_taskListId_key" ON "GrowthTaskRewardDefault"("userId", "taskListId");

-- CreateIndex
CREATE INDEX "GrowthTaskRewardDefaultItem_itemId_idx" ON "GrowthTaskRewardDefaultItem"("itemId");

-- CreateIndex
CREATE INDEX "GrowthTaskRewardDefaultSkill_skillId_idx" ON "GrowthTaskRewardDefaultSkill"("skillId");

-- CreateIndex
CREATE INDEX "GrowthLedgerEntry_userId_currency_createdAt_idx" ON "GrowthLedgerEntry"("userId", "currency", "createdAt");

-- CreateIndex
CREATE INDEX "GrowthLedgerEntry_skillId_createdAt_idx" ON "GrowthLedgerEntry"("skillId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthLedgerEntry_userId_entryKey_key" ON "GrowthLedgerEntry"("userId", "entryKey");

-- CreateIndex
CREATE INDEX "GrowthShopReward_userId_listedInShop_archivedAt_sortOrder_idx" ON "GrowthShopReward"("userId", "listedInShop", "archivedAt", "sortOrder");

-- CreateIndex
CREATE INDEX "GrowthShopReward_categoryId_sortOrder_idx" ON "GrowthShopReward"("categoryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthShopReward_userId_name_key" ON "GrowthShopReward"("userId", "name");

-- CreateIndex
CREATE INDEX "GrowthItemCategory_userId_archivedAt_sortOrder_idx" ON "GrowthItemCategory"("userId", "archivedAt", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthItemCategory_userId_name_key" ON "GrowthItemCategory"("userId", "name");

-- CreateIndex
CREATE INDEX "GrowthInventoryTransaction_userId_itemId_createdAt_idx" ON "GrowthInventoryTransaction"("userId", "itemId", "createdAt");

-- CreateIndex
CREATE INDEX "GrowthInventoryTransaction_userId_createdAt_idx" ON "GrowthInventoryTransaction"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthInventoryTransaction_userId_entryKey_key" ON "GrowthInventoryTransaction"("userId", "entryKey");

-- CreateIndex
CREATE UNIQUE INDEX "GrowthRewardRedemption_ledgerEntryId_key" ON "GrowthRewardRedemption"("ledgerEntryId");

-- CreateIndex
CREATE INDEX "GrowthRewardRedemption_userId_redeemedAt_idx" ON "GrowthRewardRedemption"("userId", "redeemedAt");

-- CreateIndex
CREATE INDEX "GrowthRewardRedemption_rewardId_redeemedAt_idx" ON "GrowthRewardRedemption"("rewardId", "redeemedAt");

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshSession" ADD CONSTRAINT "RefreshSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthHandoff" ADD CONSTRAINT "OAuthHandoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncDevice" ADD CONSTRAINT "SyncDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OAuthIdentity" ADD CONSTRAINT "OAuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deck" ADD CONSTRAINT "Deck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Card" ADD CONSTRAINT "Card_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardImage" ADD CONSTRAINT "CardImage_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewState" ADD CONSTRAINT "ReviewState_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudySession" ADD CONSTRAINT "StudySession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewLog" ADD CONSTRAINT "ReviewLog_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiJob" ADD CONSTRAINT "AiJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSessionFeedback" ADD CONSTRAINT "AiSessionFeedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "StudySession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScheduledJob" ADD CONSTRAINT "ScheduledJob_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskList" ADD CONSTRAINT "TaskList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_taskListId_fkey" FOREIGN KEY ("taskListId") REFERENCES "TaskList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "TaskSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sourceHabitId_fkey" FOREIGN KEY ("sourceHabitId") REFERENCES "Habit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sourceHabitOccurrenceId_fkey" FOREIGN KEY ("sourceHabitOccurrenceId") REFERENCES "HabitOccurrence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSection" ADD CONSTRAINT "TaskSection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSection" ADD CONSTRAINT "TaskSection_taskListId_fkey" FOREIGN KEY ("taskListId") REFERENCES "TaskList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTag" ADD CONSTRAINT "TaskTag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTagAssignment" ADD CONSTRAINT "TaskTagAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskTagAssignment" ADD CONSTRAINT "TaskTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TaskTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskReminder" ADD CONSTRAINT "TaskReminder_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_reminderId_fkey" FOREIGN KEY ("reminderId") REFERENCES "TaskReminder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskOccurrence" ADD CONSTRAINT "TaskOccurrence_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusPreset" ADD CONSTRAINT "FocusPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusPolicy" ADD CONSTRAINT "FocusPolicy_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "FocusPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "FocusPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSound" ADD CONSTRAINT "FocusSound_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSoundPreference" ADD CONSTRAINT "FocusSoundPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusEvent" ADD CONSTRAINT "FocusEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FocusSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusInterruption" ADD CONSTRAINT "FocusInterruption_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "FocusSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_taskListId_fkey" FOREIGN KEY ("taskListId") REFERENCES "TaskList"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_taskTemplateId_fkey" FOREIGN KEY ("taskTemplateId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_focusPresetId_fkey" FOREIGN KEY ("focusPresetId") REFERENCES "FocusPreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_timeBlockId_fkey" FOREIGN KEY ("timeBlockId") REFERENCES "HabitTimeBlock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Habit" ADD CONSTRAINT "Habit_taskTemplateConfigId_fkey" FOREIGN KEY ("taskTemplateConfigId") REFERENCES "HabitTaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitTimeBlock" ADD CONSTRAINT "HabitTimeBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitTaskTemplate" ADD CONSTRAINT "HabitTaskTemplate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitChecklistItem" ADD CONSTRAINT "HabitChecklistItem_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitTagAssignment" ADD CONSTRAINT "HabitTagAssignment_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitTagAssignment" ADD CONSTRAINT "HabitTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "TaskTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitReminder" ADD CONSTRAINT "HabitReminder_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitOccurrence" ADD CONSTRAINT "HabitOccurrence_habitId_fkey" FOREIGN KEY ("habitId") REFERENCES "Habit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitOccurrenceChecklistItem" ADD CONSTRAINT "HabitOccurrenceChecklistItem_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "HabitOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitProgressLog" ADD CONSTRAINT "HabitProgressLog_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "HabitOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitProgressLog" ADD CONSTRAINT "HabitProgressLog_focusSessionId_fkey" FOREIGN KEY ("focusSessionId") REFERENCES "FocusSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitCheckIn" ADD CONSTRAINT "HabitCheckIn_occurrenceId_fkey" FOREIGN KEY ("occurrenceId") REFERENCES "HabitOccurrence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HabitCheckIn" ADD CONSTRAINT "HabitCheckIn_focusSessionId_fkey" FOREIGN KEY ("focusSessionId") REFERENCES "FocusSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthProfile" ADD CONSTRAINT "GrowthProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthProfile" ADD CONSTRAINT "GrowthProfile_activeCycleId_fkey" FOREIGN KEY ("activeCycleId") REFERENCES "GrowthCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthCycle" ADD CONSTRAINT "GrowthCycle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthReset" ADD CONSTRAINT "GrowthReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthReset" ADD CONSTRAINT "GrowthReset_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "GrowthCycle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthSkill" ADD CONSTRAINT "GrowthSkill_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthEarningRule" ADD CONSTRAINT "GrowthEarningRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthEarningRuleItem" ADD CONSTRAINT "GrowthEarningRuleItem_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "GrowthEarningRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthEarningRuleItem" ADD CONSTRAINT "GrowthEarningRuleItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "GrowthShopReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthEarningRuleSkill" ADD CONSTRAINT "GrowthEarningRuleSkill_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "GrowthEarningRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthEarningRuleSkill" ADD CONSTRAINT "GrowthEarningRuleSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "GrowthSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthRewardPresetSetting" ADD CONSTRAINT "GrowthRewardPresetSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthTaskRewardDefault" ADD CONSTRAINT "GrowthTaskRewardDefault_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthTaskRewardDefault" ADD CONSTRAINT "GrowthTaskRewardDefault_taskListId_fkey" FOREIGN KEY ("taskListId") REFERENCES "TaskList"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthTaskRewardDefaultItem" ADD CONSTRAINT "GrowthTaskRewardDefaultItem_defaultId_fkey" FOREIGN KEY ("defaultId") REFERENCES "GrowthTaskRewardDefault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthTaskRewardDefaultItem" ADD CONSTRAINT "GrowthTaskRewardDefaultItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "GrowthShopReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthTaskRewardDefaultSkill" ADD CONSTRAINT "GrowthTaskRewardDefaultSkill_defaultId_fkey" FOREIGN KEY ("defaultId") REFERENCES "GrowthTaskRewardDefault"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthTaskRewardDefaultSkill" ADD CONSTRAINT "GrowthTaskRewardDefaultSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "GrowthSkill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthLedgerEntry" ADD CONSTRAINT "GrowthLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthLedgerEntry" ADD CONSTRAINT "GrowthLedgerEntry_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "GrowthSkill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthLedgerEntry" ADD CONSTRAINT "GrowthLedgerEntry_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "GrowthLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthShopReward" ADD CONSTRAINT "GrowthShopReward_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthShopReward" ADD CONSTRAINT "GrowthShopReward_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "GrowthItemCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthItemCategory" ADD CONSTRAINT "GrowthItemCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthInventoryTransaction" ADD CONSTRAINT "GrowthInventoryTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthInventoryTransaction" ADD CONSTRAINT "GrowthInventoryTransaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "GrowthShopReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthRewardRedemption" ADD CONSTRAINT "GrowthRewardRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthRewardRedemption" ADD CONSTRAINT "GrowthRewardRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "GrowthShopReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GrowthRewardRedemption" ADD CONSTRAINT "GrowthRewardRedemption_ledgerEntryId_fkey" FOREIGN KEY ("ledgerEntryId") REFERENCES "GrowthLedgerEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
