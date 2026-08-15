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
