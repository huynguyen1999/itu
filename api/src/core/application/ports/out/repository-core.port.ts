import { AiJobType, CardType, ReviewDirection, ScheduledJobStatus } from '@core/domain/enums';
import { CursorPage, CursorPageOptions } from '@core/application/ports/pagination.port';
import {
  AiJobModel,
  AiSessionFeedbackModel,
  CardImageModel,
  CardModel,
  DeckModel,
  ReviewStateModel,
  ScheduledJobModel,
  SyncDeviceModel,
  StudySessionModel,
  UserModel,
} from '@core/domain/models';
import {
  AddCardImageData,
  AddReviewLogData,
  AccountDataExport,
  ActiveRecallTrendData,
  CompleteStudySessionData,
  ConsumeOAuthHandoffResult,
  CreateAiFeedbackData,
  CreateOAuthHandoffData,
  CreateRefreshSessionData,
  RefreshSessionRecord,
  CreateScheduledJobData,
  CreateCardData,
  CreateDeckData,
  CreateStudySessionData,
  CreateUserData,
  DeckStudyStatsData,
  DeckStatsData,
  DueCountByDeckData,
  StudyCalendarDayData,
  DueReviewStateData,
  RateLimitConsumeResult,
  StudySessionReviewData,
  StudySessionHistoryData,
  StudySessionStatsData,
  UpdateCardData,
  UpdateDeckData,
  UpdateUserProfileData,
  ScheduleAccountDeletionResult,
  UpdateSyncDeviceData,
  TrashSnapshotData,
  UpsertSyncDeviceData,
  UpsertGoogleUserData,
} from './repository-types.port';

export interface IUserRepository {
  findById(id: string): Promise<UserModel | null>;
  findByEmail(email: string): Promise<UserModel | null>;
  findByUsername(username: string): Promise<UserModel | null>;
  findByIdentifier(identifier: string): Promise<UserModel | null>;
  create(data: CreateUserData): Promise<UserModel>;
  updateProfile(userId: string, data: UpdateUserProfileData): Promise<UserModel | null>;
  updatePassword(userId: string, passwordHash: string): Promise<UserModel | null>;
  exportData(userId: string): Promise<AccountDataExport | null>;
  scheduleDeletion(userId: string, runAt: Date): Promise<ScheduleAccountDeletionResult | null>;
  delete(userId: string): Promise<boolean>;
  hardDelete(userId: string): Promise<boolean>;
  upsertGoogleUser(data: UpsertGoogleUserData): Promise<UserModel>;
}

export interface IRefreshSessionRepository {
  create(data: CreateRefreshSessionData): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshSessionRecord | null>;
  rotate(sessionId: string, next: CreateRefreshSessionData): Promise<boolean>;
  recoverRotation(sessionId: string, next: CreateRefreshSessionData): Promise<boolean>;
  revokeById(sessionId: string): Promise<void>;
  revokeUserSessions(userId: string): Promise<void>;
}

export interface IOAuthHandoffRepository {
  create(data: CreateOAuthHandoffData): Promise<void>;
  consume(codeHash: string, now?: Date): Promise<ConsumeOAuthHandoffResult | null>;
}

export interface IRateLimitRepository {
  consume(key: string, windowMs: number, maxRequests: number, now?: Date): Promise<RateLimitConsumeResult>;
}

export interface IDeckRepository {
  list(userId: string): Promise<DeckModel[]>;
  page(userId: string, options?: CursorPageOptions): Promise<CursorPage<DeckModel>>;
  findById(userId: string, deckId: string): Promise<DeckModel | null>;
  create(userId: string, data: CreateDeckData): Promise<DeckModel>;
  update(userId: string, deckId: string, data: UpdateDeckData): Promise<DeckModel | null>;
  delete(userId: string, deckId: string): Promise<boolean>;
  restore(userId: string, deckId: string): Promise<DeckModel | null>;
}

export interface ICardRepository {
  listByDeck(userId: string, deckId: string): Promise<CardModel[]>;
  pageByDeck(userId: string, deckId: string, options?: CursorPageOptions): Promise<CursorPage<CardModel>>;
  findById(userId: string, cardId: string): Promise<CardModel | null>;
  create(userId: string, deckId: string, data: CreateCardData): Promise<CardModel>;
  update(userId: string, cardId: string, data: UpdateCardData): Promise<CardModel | null>;
  delete(userId: string, cardId: string): Promise<CardModel | null>;
  countImages(userId: string, cardId: string): Promise<number>;
  addImage(userId: string, cardId: string, data: AddCardImageData): Promise<CardImageModel>;
  findImage(userId: string, cardId: string, imageId: string): Promise<CardImageModel | null>;
  findImageByStorageKey(userId: string, storageKey: string): Promise<CardImageModel | null>;
  deleteImage(userId: string, cardId: string, imageId: string): Promise<CardImageModel | null>;
  restore(userId: string, cardId: string): Promise<CardModel | null>;
  restoreImage(userId: string, imageId: string): Promise<CardImageModel | null>;
  studyStatsByDeck(userId: string, deckIds: string[], now?: Date): Promise<DeckStudyStatsData[]>;
  importCards(
    userId: string,
    deckName: string,
    items: Array<{ promptRichText: string; answerRichText: string; type: CardType; dueAt: Date }>,
  ): Promise<CardModel[]>;
  move(userId: string, cardIds: string[], targetDeckId: string): Promise<string[]>;
}

export interface ITrashRepository {
  list(userId: string): Promise<TrashSnapshotData>;
  restoreDeck(userId: string, deckId: string): Promise<DeckModel | null>;
  restoreCard(userId: string, cardId: string): Promise<CardModel | null>;
  restoreCardImage(userId: string, imageId: string): Promise<CardImageModel | null>;
  restoreTask(userId: string, taskId: string): Promise<boolean>;
  deleteDeck(userId: string, deckId: string): Promise<CardImageModel[] | null>;
  deleteCard(userId: string, cardId: string): Promise<CardImageModel[] | null>;
  deleteCardImage(userId: string, imageId: string): Promise<CardImageModel | null>;
  deleteTask(userId: string, taskId: string): Promise<boolean>;
  restoreJournalEntry(userId: string, entryId: string): Promise<any | null>;
  restoreExpense(userId: string, expenseId: string): Promise<any | null>;
  restoreGymWorkout(userId: string, workoutId: string): Promise<any | null>;
  restoreGymExercise(userId: string, exerciseId: string): Promise<any | null>;
  deleteJournalEntry(userId: string, entryId: string): Promise<any[] | null>;
  deleteExpense(userId: string, expenseId: string): Promise<boolean>;
  deleteGymWorkout(userId: string, workoutId: string): Promise<boolean>;
  deleteGymExercise(userId: string, exerciseId: string): Promise<any | null>;
  purgeExpired(cutoff: Date): Promise<CardImageModel[]>;
}

export interface IReviewStateRepository {
  createInitialStates(userId: string, cardId: string, type: CardType): Promise<void>;
  listDue(userId: string, deckId?: string, now?: Date): Promise<DueReviewStateData[]>;
  find(userId: string, cardId: string, direction: ReviewDirection): Promise<ReviewStateModel | null>;
  update(state: ReviewStateModel): Promise<ReviewStateModel>;
  resetCardDueAt(userId: string, cardId: string, dueAt: Date): Promise<void>;
  dueCountByDeck(userId: string): Promise<DueCountByDeckData[]>;
}

export interface IStudySessionRepository {
  create(userId: string, data: CreateStudySessionData): Promise<StudySessionModel>;
  findById(userId: string, sessionId: string): Promise<StudySessionModel | null>;
  complete(userId: string, sessionId: string, data: CompleteStudySessionData): Promise<StudySessionModel | null>;
  /** Returns false when an idempotency-key insert was an identical replay. */
  addReviewLog(userId: string, data: AddReviewLogData): Promise<boolean | void>;
  findReviewLogByIdempotencyKey?(userId: string, idempotencyKey: string): Promise<any | null>;
  recent(userId: string, limit: number): Promise<StudySessionModel[]>;
  countCompletedOnOrAfter(userId: string, since: Date): Promise<number>;
  countCompletedBetween(userId: string, from: Date, to: Date): Promise<number>;
  retentionRate(userId: string, since: Date): Promise<number>;
  studyCalendar(userId: string, from: Date, to: Date): Promise<StudyCalendarDayData[]>;
  deckStats(userId: string, deckId: string, now?: Date): Promise<DeckStatsData | null>;
  sessionStats(userId: string, sessionId: string): Promise<StudySessionStatsData>;
  sessionReviews(userId: string, sessionId: string): Promise<StudySessionReviewData[]>;
  sessionHistory(userId: string, options?: CursorPageOptions): Promise<CursorPage<StudySessionHistoryData>>;
  activeRecallTrend(userId: string, limit: number): Promise<ActiveRecallTrendData[]>;
}

export interface IAiJobRepository {
  create(userId: string, type: AiJobType, input: unknown): Promise<AiJobModel>;
  findById(userId: string, jobId: string): Promise<AiJobModel | null>;
  findByIdAnyUser(jobId: string): Promise<AiJobModel | null>;
  markRunning(jobId: string): Promise<void>;
  markCompleted(jobId: string, output: unknown): Promise<void>;
  markFailed(jobId: string, error: string): Promise<void>;
}

export interface IAiFeedbackRepository {
  findBySession(userId: string, sessionId: string): Promise<AiSessionFeedbackModel | null>;
  create(userId: string, sessionId: string, data: CreateAiFeedbackData): Promise<AiSessionFeedbackModel>;
}

export interface IScheduledJobRepository {
  create(data: CreateScheduledJobData): Promise<ScheduledJobModel>;
  findById(jobId: string): Promise<ScheduledJobModel | null>;
  claimPublishable(now: Date, staleBefore: Date, publishedBefore: Date, limit: number): Promise<ScheduledJobModel[]>;
  markPublished(jobId: string): Promise<void>;
  markRunning(jobId: string): Promise<ScheduledJobModel | null>;
  markCompleted(jobId: string): Promise<void>;
  markFailed(jobId: string, error: string): Promise<void>;
  cancelUserJobs(userId: string, statuses: ScheduledJobStatus[]): Promise<void>;
}

export interface IReminderRepository {
  deliver(reminderId: string): Promise<boolean>;
  deliverHabitReminder?(deliveryId: string): Promise<boolean>;
}

export interface ISyncDeviceRepository {
  upsert(userId: string, data: UpsertSyncDeviceData): Promise<SyncDeviceModel | null>;
  update(userId: string, deviceId: string, data: UpdateSyncDeviceData): Promise<SyncDeviceModel | null>;
  delete(userId: string, deviceId: string): Promise<boolean>;
  listNotificationTargets(userId: string, excludeDeviceId: string): Promise<SyncDeviceModel[]>;
}
