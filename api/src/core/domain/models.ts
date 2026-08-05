import {
  AiJobStatus,
  AiJobType,
  CardSide,
  CardStatus,
  CardType,
  DeckColor,
  DeckIcon,
  ReviewDirection,
  ReviewGrade,
  ScheduledJobStatus,
  ScheduledJobType,
  StudyMode,
  SyncDevicePlatform,
} from './enums';

export type EntityId = string;

export type RichText = string;

export interface UserModel {
  id: EntityId;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  passwordHash?: string | null;
  createdAt: Date;
  deletionRequestedAt?: Date | null;
  deletionScheduledFor?: Date | null;
  deletedAt?: Date | null;
  bannedAt?: Date | null;
}

export interface DeckModel {
  id: EntityId;
  userId: EntityId;
  title: string;
  description?: string | null;
  icon: DeckIcon;
  color: DeckColor;
  isDefault: boolean;
  archived: boolean;
  version?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CardImageModel {
  id: EntityId;
  cardId: EntityId;
  userId: EntityId;
  side: CardSide;
  storageKey: string;
  url: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  sortOrder: number;
  createdAt: Date;
  deletedAt?: Date | null;
}

export interface CardModel {
  id: EntityId;
  userId: EntityId;
  deckId: EntityId;
  type: CardType;
  status: CardStatus;
  promptRichText: RichText;
  answerRichText: RichText;
  tags: string[];
  version?: number;
  images: CardImageModel[];
  reviewSummary?: {
    nextDueAt?: Date | null;
    reviewCount: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface ReviewStateModel {
  id: EntityId;
  userId: EntityId;
  cardId: EntityId;
  direction: ReviewDirection;
  dueAt: Date;
  stability: number;
  difficulty: number;
  intervalDays: number;
  lapseCount: number;
  reviewCount: number;
}

export interface StudySessionModel {
  id: EntityId;
  userId?: EntityId | null;
  deckId?: EntityId | null;
  mode: StudyMode;
  rating?: number | null;
  startedAt: Date;
  completedAt?: Date | null;
  reviewed: number;
  correct: number;
  growthReceipt?: unknown;
}

export interface ReviewLogModel {
  id: EntityId;
  userId: EntityId;
  sessionId: EntityId;
  cardId: EntityId;
  cardDeckId?: EntityId | null;
  cardPromptRichText: RichText;
  cardAnswerRichText: RichText;
  cardImages: ReviewCardImageSnapshot[];
  direction: ReviewDirection;
  grade: ReviewGrade;
  userAnswer?: string | null;
  responseMs?: number | null;
  previousDueAt?: Date | null;
  nextDueAt: Date;
  previousInterval: number;
  nextInterval: number;
  createdAt: Date;
}

export interface ReviewCardImageSnapshot {
  side: CardSide;
  storageKey: string;
  mimeType: string;
  sortOrder: number;
  sizeBytes: number;
}

export interface AiJobModel {
  id: EntityId;
  userId?: EntityId | null;
  type: AiJobType;
  status: AiJobStatus;
  input: unknown;
  output?: unknown;
  error?: string | null;
  attempts: number;
  createdAt: Date;
  completedAt?: Date | null;
}

export interface AiSessionFeedbackModel {
  id: EntityId;
  userId: EntityId;
  sessionId: EntityId;
  summary: string;
  weakAreas: string[];
  nextSteps: string[];
  confidence?: number | null;
  createdAt: Date;
}

export interface ScheduledJobModel {
  id: EntityId;
  userId?: EntityId | null;
  type: ScheduledJobType;
  status: ScheduledJobStatus;
  payload: unknown;
  runAt: Date;
  attempts: number;
  lastError?: string | null;
  lockedAt?: Date | null;
  publishedAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
}

export interface SyncDeviceModel {
  id: EntityId;
  userId: EntityId;
  platform: SyncDevicePlatform;
  pushToken?: string | null;
  lastSeenAt: Date;
  lastKnownSyncCursor?: string | null;
  notificationPreference?: unknown;
  createdAt: Date;
  updatedAt: Date;
}
