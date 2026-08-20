export enum CardType {
  BASIC = 'BASIC',
  REVERSE = 'REVERSE',
}

export enum DeckIcon {
  INBOX = 'INBOX',
  BOOK = 'BOOK',
  BRAIN = 'BRAIN',
  LANGUAGE = 'LANGUAGE',
  FLASK = 'FLASK',
  CODE = 'CODE',
  LEAF = 'LEAF',
  CALCULATOR = 'CALCULATOR',
  GLOBE = 'GLOBE',
}

export enum DeckColor {
  SLATE = 'SLATE',
  EMERALD = 'EMERALD',
  TEAL = 'TEAL',
  BLUE = 'BLUE',
  INDIGO = 'INDIGO',
  VIOLET = 'VIOLET',
  ROSE = 'ROSE',
  AMBER = 'AMBER',
}

export enum CardStatus {
  ACTIVE = 'ACTIVE',
  ARCHIVED = 'ARCHIVED',
}

export enum CardSide {
  PROMPT = 'PROMPT',
  ANSWER = 'ANSWER',
}

export enum ReviewDirection {
  FRONT_TO_BACK = 'FRONT_TO_BACK',
  BACK_TO_FRONT = 'BACK_TO_FRONT',
}

export enum ReviewGrade {
  AGAIN = 'AGAIN',
  HARD = 'HARD',
  GOOD = 'GOOD',
  EASY = 'EASY',
}

export enum StudyMode {
  DUE = 'DUE',
  CRAM = 'CRAM',
}

export enum AiJobType {
  CARD_GENERATION = 'CARD_GENERATION',
  SESSION_FEEDBACK = 'SESSION_FEEDBACK',
  REVIEW_INSIGHTS = 'REVIEW_INSIGHTS',
}

export enum AiJobStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum AiCredentialStatus {
  HEALTHY = 'HEALTHY',
  RATE_LIMITED = 'RATE_LIMITED',
  QUOTA_EXHAUSTED = 'QUOTA_EXHAUSTED',
  INVALID_KEY = 'INVALID_KEY',
  PROVIDER_ERROR = 'PROVIDER_ERROR',
}

export enum ScheduledJobType {
  ACCOUNT_DELETE = 'ACCOUNT_DELETE',
  TRASH_PURGE = 'TRASH_PURGE',
  TASK_REMINDER = 'TASK_REMINDER',
  HABIT_REMINDER = 'HABIT_REMINDER',
}

export enum ScheduledJobStatus {
  SCHEDULED = 'SCHEDULED',
  PUBLISHING = 'PUBLISHING',
  PUBLISHED = 'PUBLISHED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELED = 'CANCELED',
}

export enum SyncDevicePlatform {
  WEB = 'WEB',
  IOS = 'IOS',
  MACOS = 'MACOS',
}

export enum JournalEntryKind {
  NOTE = 'NOTE',
  WEEKLY_REVIEW = 'WEEKLY_REVIEW',
  DAILY_REVIEW = 'DAILY_REVIEW',
}

export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD = 'CARD',
  E_WALLET = 'E_WALLET',
  OTHER = 'OTHER',
}

export enum WeightUnit {
  KG = 'KG',
  LBS = 'LBS',
}

export const GrowthRewardPreset = { LIGHT: 'LIGHT', STANDARD: 'STANDARD', STRONG: 'STRONG' } as const;
export type GrowthRewardPreset = (typeof GrowthRewardPreset)[keyof typeof GrowthRewardPreset];

export const GrowthSourceType = {
  TASK: 'TASK',
  HABIT: 'HABIT',
  FOCUS_PRESET: 'FOCUS_PRESET',
  REVIEW_DECK: 'REVIEW_DECK',
} as const;
export type GrowthSourceType = (typeof GrowthSourceType)[keyof typeof GrowthSourceType];

export const GrowthScalingMode = { FIXED: 'FIXED', LINEAR: 'LINEAR' } as const;
export type GrowthScalingMode = (typeof GrowthScalingMode)[keyof typeof GrowthScalingMode];

export const GrowthProgressKind = { ATTRIBUTE: 'ATTRIBUTE', SKILL: 'SKILL' } as const;
export type GrowthProgressKind = (typeof GrowthProgressKind)[keyof typeof GrowthProgressKind];

export const GrowthOnboardingState = {
  NOT_STARTED: 'NOT_STARTED',
  SKILLS_OFFERED: 'SKILLS_OFFERED',
  COMPLETED: 'COMPLETED',
} as const;
export type GrowthOnboardingState = (typeof GrowthOnboardingState)[keyof typeof GrowthOnboardingState];

export const GrowthAttributeMappingSlot = { PRIMARY: 'PRIMARY', SECONDARY: 'SECONDARY' } as const;
export type GrowthAttributeMappingSlot =
  (typeof GrowthAttributeMappingSlot)[keyof typeof GrowthAttributeMappingSlot];

export const GrowthCurrency = { ACCOUNT_XP: 'ACCOUNT_XP', SKILL_XP: 'SKILL_XP', COIN: 'COIN' } as const;
export type GrowthCurrency = (typeof GrowthCurrency)[keyof typeof GrowthCurrency];

export const GrowthLedgerKind = {
  ACTIVITY_AWARD: 'ACTIVITY_AWARD',
  REVERSAL: 'REVERSAL',
  COMMITMENT_PENALTY: 'COMMITMENT_PENALTY',
  REWARD_PURCHASE: 'REWARD_PURCHASE',
  ADMINISTRATIVE_ADJUSTMENT: 'ADMINISTRATIVE_ADJUSTMENT',
  RESET_ADJUSTMENT: 'RESET_ADJUSTMENT',
} as const;
export type GrowthLedgerKind = (typeof GrowthLedgerKind)[keyof typeof GrowthLedgerKind];

export const HabitDirection = { BUILD: 'BUILD', LIMIT: 'LIMIT' } as const;
export type HabitDirection = (typeof HabitDirection)[keyof typeof HabitDirection];

export const HabitScheduleType = {
  WEEKDAYS: 'WEEKDAYS',
  INTERVAL: 'INTERVAL',
  TIMES_PER_PERIOD: 'TIMES_PER_PERIOD',
} as const;
export type HabitScheduleType = (typeof HabitScheduleType)[keyof typeof HabitScheduleType];

export const HabitTargetType = {
  BOOLEAN: 'BOOLEAN',
  COUNT: 'COUNT',
  DURATION: 'DURATION',
  QUANTITY: 'QUANTITY',
} as const;
export type HabitTargetType = (typeof HabitTargetType)[keyof typeof HabitTargetType];

export const HabitOccurrenceStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
} as const;
export type HabitOccurrenceStatus = (typeof HabitOccurrenceStatus)[keyof typeof HabitOccurrenceStatus];

export const CommitmentPolicyLevel = { GENTLE: 'GENTLE', STANDARD: 'STANDARD' } as const;
export type CommitmentPolicyLevel = (typeof CommitmentPolicyLevel)[keyof typeof CommitmentPolicyLevel];

export const HabitCommitmentState = {
  NONE: 'NONE',
  COMMITTED: 'COMMITTED',
  BREACHED: 'BREACHED',
  RECOVERED: 'RECOVERED',
  EXCUSED: 'EXCUSED',
} as const;
export type HabitCommitmentState = (typeof HabitCommitmentState)[keyof typeof HabitCommitmentState];

export const CommitmentPenaltyState = { ACTIVE: 'ACTIVE', REVERSED: 'REVERSED' } as const;
export type CommitmentPenaltyState = (typeof CommitmentPenaltyState)[keyof typeof CommitmentPenaltyState];

export const TaskPriority = { NONE: 'NONE', LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH' } as const;
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority];

export const FocusPhase = { WORK: 'WORK', SHORT_BREAK: 'SHORT_BREAK', LONG_BREAK: 'LONG_BREAK' } as const;
export type FocusPhase = (typeof FocusPhase)[keyof typeof FocusPhase];

export const FocusMode = { COUNTDOWN: 'COUNTDOWN', STOPWATCH: 'STOPWATCH' } as const;
export type FocusMode = (typeof FocusMode)[keyof typeof FocusMode];

export const HabitProgressSource = {
  MANUAL: 'MANUAL',
  FOCUS_SESSION: 'FOCUS_SESSION',
  TASK_COMPLETION: 'TASK_COMPLETION',
  HEALTH: 'HEALTH',
  SCREEN_TIME: 'SCREEN_TIME',
  CALENDAR: 'CALENDAR',
  EXTERNAL: 'EXTERNAL',
} as const;
export type HabitProgressSource = (typeof HabitProgressSource)[keyof typeof HabitProgressSource];

export const HabitTaskSyncPolicy = {
  NONE: 'NONE',
  TASK_TO_HABIT: 'TASK_TO_HABIT',
  HABIT_TO_TASK: 'HABIT_TO_TASK',
  BIDIRECTIONAL: 'BIDIRECTIONAL',
} as const;
export type HabitTaskSyncPolicy = (typeof HabitTaskSyncPolicy)[keyof typeof HabitTaskSyncPolicy];

export const TaskStatus = {
  INBOX: 'INBOX',
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const GrowthResetScope = { SKILL: 'SKILL', ALL_XP: 'ALL_XP', FULL: 'FULL' } as const;
export type GrowthResetScope = (typeof GrowthResetScope)[keyof typeof GrowthResetScope];
