import {
  CardSide,
  CardStatus,
  CardType,
  DeckColor,
  DeckIcon,
  ReviewDirection,
  ReviewGrade,
  ScheduledJobType,
  StudyMode,
  SyncDevicePlatform,
} from '@core/domain/enums';
import { CardImageModel, CardModel, DeckModel, ReviewStateModel } from '@core/domain/models';

export interface CreateUserData {
  email?: string | null;
  username?: string | null;
  passwordHash?: string | null;
  displayName?: string | null;
}

export interface UpdateUserProfileData {
  displayName?: string | null;
  username?: string | null;
}

export interface ScheduleAccountDeletionResult {
  userId: string;
  jobId: string;
  runAt: Date;
}

export interface TrashSnapshotData {
  decks: DeckModel[];
  cards: CardModel[];
  cardImages: CardImageModel[];
  tasks: any[];
  journalEntries?: any[];
  expenses?: any[];
  gymWorkouts?: any[];
  gymExercises?: any[];
}

export interface CreateScheduledJobData {
  userId?: string | null;
  type: ScheduledJobType;
  payload: unknown;
  runAt: Date;
}

export interface UpsertSyncDeviceData {
  id: string;
  platform: SyncDevicePlatform;
  pushToken?: string | null;
  lastKnownSyncCursor?: string | null;
  notificationPreference?: unknown;
}

export interface UpdateSyncDeviceData {
  pushToken?: string | null;
  lastKnownSyncCursor?: string | null;
  notificationPreference?: unknown;
}

export interface AccountDataExport {
  exportedAt: Date;
  user: {
    id: string;
    email: string | null;
    username?: string | null;
    displayName?: string | null;
    createdAt: Date;
  };
  decks: unknown[];
  cards: unknown[];
  reviewStates: unknown[];
  studySessions: unknown[];
  reviewLogs: unknown[];
  aiFeedback: unknown[];
  taskLists: unknown[];
  tasks: unknown[];
  taskTags: unknown[];
  taskReminders: unknown[];
  focusPresets: unknown[];
  focusPolicies: unknown[];
  focusSessions: unknown[];
  habits: unknown[];
  habitOccurrences: unknown[];
  habitTimeBlocks: unknown[];
  habitTaskTemplates: unknown[];
  growthSkills: unknown[];
  growthEarningRules: unknown[];
  growthLedgerEntries: unknown[];
  growthShopRewards: unknown[];
  growthRewardRedemptions: unknown[];
  growthItemCategories: unknown[];
  growthInventoryTransactions: unknown[];
}

export interface UpsertGoogleUserData {
  email: string;
  displayName?: string | null;
  providerUserId: string;
}

export interface CreateRefreshSessionData {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface RefreshSessionRecord {
  id: string;
  userId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  rotationGraceUntil: Date | null;
  rotationRecoveryUsedAt: Date | null;
}

export interface OAuthHandoffPayload {
  type: 'success' | 'register';
  userId?: string;
  refreshSessionId?: string;
  registerToken?: string;
}

export interface CreateOAuthHandoffData {
  id: string;
  codeHash: string;
  userId?: string | null;
  payload: OAuthHandoffPayload;
  expiresAt: Date;
}

export interface ConsumeOAuthHandoffResult {
  payload: OAuthHandoffPayload;
}

export interface RateLimitConsumeResult {
  allowed: boolean;
  resetAt: Date;
}

export interface CreateDeckData {
  title: string;
  description?: string | null;
  icon?: DeckIcon;
  color?: DeckColor;
  isDefault?: boolean;
}

export interface UpdateDeckData {
  title?: string;
  description?: string | null;
  archived?: boolean;
  icon?: DeckIcon;
  color?: DeckColor;
}

export interface CreateCardData {
  type: CardType;
  promptRichText: string;
  answerRichText: string;
  tags: string[];
}

export interface UpdateCardData {
  type?: CardType;
  status?: CardStatus;
  promptRichText?: string;
  answerRichText?: string;
  tags?: string[];
}

export type AddCardImageData = Omit<CardImageModel, 'id' | 'userId' | 'cardId' | 'createdAt'>;

export interface DueReviewStateData {
  card: CardModel;
  state: ReviewStateModel;
}

export interface DueCountByDeckData {
  deckId: string;
  dueCount: number;
}

export interface DeckStudyStatsData {
  deckId: string;
  totalCards: number;
  toReviewCount: number;
  newCount: number;
  dueCount: number;
  reviewedCount: number;
  lastStudiedAt?: Date | null;
}

export interface CreateStudySessionData {
  deckId?: string | null;
  mode: StudyMode;
}

export interface CompleteStudySessionData {
  rating: number;
  reviewed?: number;
  correct?: number;
}

export interface AddReviewLogData {
  idempotencyKey?: string;
  sessionId: string;
  cardId: string;
  cardDeckId?: string | null;
  cardPromptRichText: string;
  cardAnswerRichText: string;
  cardImages: Array<{
    side: CardSide;
    storageKey: string;
    mimeType: string;
    sortOrder: number;
    sizeBytes: number;
  }>;
  direction: ReviewDirection;
  grade: ReviewGrade;
  userAnswer?: string | null;
  responseMs?: number | null;
  previousDueAt?: Date | null;
  nextDueAt: Date;
  previousInterval: number;
  nextInterval: number;
}

export interface StudySessionStatsData {
  reviewed: number;
  correct: number;
}

export interface StudySessionReviewData {
  cardId: string;
  direction: ReviewDirection;
  grade: ReviewGrade;
  userAnswer?: string | null;
  promptRichText: string;
  answerRichText: string;
  images: Array<{
    side: CardSide;
    storageKey: string;
    mimeType: string;
    sortOrder: number;
    sizeBytes: number;
  }>;
}

export interface StudySessionHistoryData {
  id: string;
  deckId?: string | null;
  deckTitle?: string | null;
  mode: StudyMode;
  rating?: number | null;
  reviewed: number;
  correct: number;
  correctRate: number;
  startedAt: Date;
  completedAt?: Date | null;
}

export interface ActiveRecallTrendData {
  id: string;
  completedAt: Date;
  correctRate: number;
  reviewed: number;
  correct: number;
  rating?: number | null;
}

export interface StudyCalendarDayData {
  date: string;
  sessions: number;
  focusSessions: number;
  reviews: number;
  correct: number;
  completedTasks: number;
  focusedMinutes: number;
  cardsCreated: number;
}

export interface ReviewForecastData {
  date: string;
  dueCount: number;
}

export interface GradeDistributionData {
  AGAIN: number;
  HARD: number;
  GOOD: number;
  EASY: number;
}

export interface DeckStatsData {
  deckId: string;
  totalCards: number;
  retentionRate: number;
  gradeDistribution: GradeDistributionData;
  upcomingReviewForecast: ReviewForecastData[];
}

export interface CreateAiFeedbackData {
  summary: string;
  weakAreas: string[];
  nextSteps: string[];
  confidence?: number | null;
}
