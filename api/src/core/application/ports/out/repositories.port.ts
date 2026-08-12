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
  findActiveByHash(tokenHash: string, now?: Date): Promise<{ id: string; userId: string } | null>;
  rotate(sessionId: string, next: CreateRefreshSessionData): Promise<void>;
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
  restoreBudgetTransaction(userId: string, transactionId: string): Promise<any | null>;
  restoreGymWorkout(userId: string, workoutId: string): Promise<any | null>;
  restoreGymExercise(userId: string, exerciseId: string): Promise<any | null>;
  deleteJournalEntry(userId: string, entryId: string): Promise<any[] | null>;
  deleteBudgetTransaction(userId: string, transactionId: string): Promise<boolean>;
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
}

export interface ISyncDeviceRepository {
  upsert(userId: string, data: UpsertSyncDeviceData): Promise<SyncDeviceModel | null>;
  update(userId: string, deviceId: string, data: UpdateSyncDeviceData): Promise<SyncDeviceModel | null>;
  delete(userId: string, deviceId: string): Promise<boolean>;
  listNotificationTargets(userId: string, excludeDeviceId: string): Promise<SyncDeviceModel[]>;
}

export interface UsageSummaryRecord {
  localDate: Date;
  hour: number;
  bundleId: string;
  displayName: string;
  activeSeconds: number;
  engagedSeconds?: number | null;
  iconHash?: string | null;
  iconStorageKey?: string | null;
}

export interface UsageAppIdentityRecord {
  bundleId: string;
  displayName: string;
  iconHash?: string | null;
  iconStorageKey?: string | null;
}

export interface UsageAppIdentityWrite {
  bundleId: string;
  displayName: string;
  iconHash: string;
  iconStorageKey: string;
}

export interface UsageSummaryWrite {
  localDate: Date;
  hour: number;
  bundleId: string;
  displayName: string;
  timezone: string;
  activeSeconds: number;
  engagedSeconds?: number | null;
}

export interface WebsiteUsageSummaryRecord {
  localDate: Date;
  browserBundleId: string;
  browserDisplayName: string;
  hostname: string;
  url: string | null;
  activeSeconds: number;
}

export interface WebsiteUsageSummaryWrite {
  localDate: Date;
  browserBundleId: string;
  browserDisplayName: string;
  hostname: string;
  url: string | null;
  urlKey: string;
  timezone: string;
  activeSeconds: number;
}

export interface WebsiteActivitySessionRecord {
  id: string;
  userId: string;
  installationId: string;
  browserBundleId: string;
  browserDisplayName: string;
  startedAt: Date;
  endedAt: Date;
  activeSeconds: number;
  hostname: string;
  url: string;
  iconUrl: string | null;
  pageTitle: string | null;
  isPrivate: boolean;
  timezone: string;
  createdAt: Date;
}

export interface WebsiteActivitySessionWrite {
  id: string;
  installationId: string;
  browserBundleId: string;
  browserDisplayName: string;
  startedAt: Date;
  endedAt: Date;
  activeSeconds: number;
  hostname: string;
  url: string;
  iconUrl?: string | null;
  pageTitle: string | null;
  isPrivate: boolean;
  timezone: string;
}

export interface IUsageRepository {
  findDevice(userId: string, deviceId: string): Promise<{ platform: string } | null>;
  findSummaries(userId: string, from: Date, toExclusive: Date): Promise<UsageSummaryRecord[]>;
  listAppIdentities(userId: string): Promise<UsageAppIdentityRecord[]>;
  findAppIdentity(userId: string, bundleId: string): Promise<UsageAppIdentityRecord | null>;
  upsertAppIdentity(userId: string, data: UsageAppIdentityWrite): Promise<UsageAppIdentityRecord>;
  getTrackingPreferences(userId: string): Promise<{
    trackingEnabled: boolean;
    websiteTrackingEnabled: boolean;
    retentionDays: number;
    idleThresholdSeconds: number;
    excludedBundleIds: string[];
  }>;
  replaceBatch(userId: string, deviceId: string, summaries: UsageSummaryWrite[]): Promise<number>;
  delete(userId: string, from?: Date, toExclusive?: Date): Promise<number>;
  deleteExpired(now?: Date): Promise<number>;
  findWebsiteSummaries(userId: string, from: Date, toExclusive: Date): Promise<WebsiteUsageSummaryRecord[]>;
  findWebsiteUrls(
    userId: string,
    from: Date,
    toExclusive: Date,
    hostname: string,
    limit: number,
    offset: number,
  ): Promise<{ items: Array<{ url: string; activeSeconds: number }>; total: number }>;
  replaceWebsiteBatch(userId: string, deviceId: string, summaries: WebsiteUsageSummaryWrite[]): Promise<number>;
  ingestWebsiteActivitySessions(userId: string, sessions: WebsiteActivitySessionWrite[]): Promise<string[]>;
  findWebsiteActivitySessions(userId: string, from: Date, toExclusive: Date): Promise<WebsiteActivitySessionRecord[]>;
  replaceBrowserExtensionCredential(userId: string, id: string, keyHash: string): Promise<void>;
  findBrowserExtensionCredential(keyHash: string): Promise<{ userId: string } | null>;
  ensureBrowserExtensionDevice(userId: string, installationId: string): Promise<string>;
  deleteWebsite(userId: string, from?: Date, toExclusive?: Date): Promise<number>;
}

export interface IProductivityRepository {
  recordSyncChange(
    userId: string,
    entityType: string,
    entityId: string,
    operation: 'UPSERT' | 'DELETE',
    data: object,
  ): Promise<{ cursor: bigint | number | string }>;

  // Task Lists & Sections
  listTaskLists(userId: string, filter?: any): Promise<any[]>;
  findTaskListById(userId: string, id: string): Promise<any | null>;
  createTaskList(userId: string, data: any): Promise<any>;
  updateTaskList(userId: string, id: string, data: any): Promise<any | null>;
  deleteTaskList(userId: string, id: string): Promise<boolean>;

  listSections(userId: string, taskListId?: string, filter?: any): Promise<any[]>;
  createSection(userId: string, data: any): Promise<any>;
  updateSection(userId: string, id: string, data: any): Promise<any | null>;
  deleteSection(userId: string, id: string): Promise<boolean>;

  // Tasks
  listTasks(userId: string, filter?: any): Promise<{ data: any[]; hasNextPage: boolean; nextCursor: string | null }>;
  findTaskById(userId: string, id: string): Promise<any | null>;
  createTask(userId: string, data: any): Promise<any>;
  updateTask(userId: string, id: string, data: any): Promise<any | null>;
  deleteTask(userId: string, id: string): Promise<boolean>;
  restoreTask(userId: string, id: string): Promise<any | null>;
  reorderTasks(userId: string, taskIds: string[]): Promise<any>;
  createReminder(userId: string, taskId: string, data: any): Promise<any>;
  updateReminder(userId: string, id: string, data: any): Promise<any>;
  reminderAction(userId: string, id: string, action: 'snooze' | 'dismiss', remindAt?: string): Promise<any>;

  // Focus Presets, Sessions & Time Blocks
  listFocusPresets(userId: string): Promise<any[]>;
  findFocusPresetById(userId: string, id: string): Promise<any | null>;
  createFocusPreset(userId: string, data: any): Promise<any>;
  updateFocusPreset(userId: string, id: string, data: any): Promise<any | null>;
  deleteFocusPreset(userId: string, id: string): Promise<boolean>;

  listFocusSessions(userId: string, filter?: any): Promise<any[]>;
  findFocusSessionById(userId: string, id: string): Promise<any | null>;
  findActiveFocusSession(userId: string): Promise<any | null>;
  createFocusSession(userId: string, data: any): Promise<any>;
  updateFocusSession(userId: string, id: string, data: any): Promise<any | null>;
  focusAction(userId: string, id: string, action: string, data?: any): Promise<any>;
  adjustFocus(
    userId: string,
    id: string,
    startedAt?: string,
    completedAt?: string,
    taskId?: string,
    expectedVersion?: number,
    idempotencyKey?: string,
  ): Promise<any>;
  listFocusSounds(userId: string): Promise<any[]>;
  findFocusSoundById(userId: string, id: string): Promise<any | null>;
  findFocusSoundByStorageKey(userId: string, storageKey: string): Promise<any | null>;
  createFocusSound(userId: string, data: any): Promise<any>;
  updateFocusSound(userId: string, id: string, data: any): Promise<any | null>;
  deleteFocusSound(userId: string, id: string): Promise<any | null>;
  listFocusSoundPreferences(userId: string): Promise<any[]>;
  upsertFocusSoundPreference(userId: string, soundKey: string, data: any): Promise<any>;

  listTimeBlocks(userId: string): Promise<any[]>;
  createTimeBlock(userId: string, data: any): Promise<any>;
  updateTimeBlock(userId: string, id: string, data: any): Promise<any | null>;
  deleteTimeBlock(userId: string, id: string): Promise<boolean>;

  // Habits & Occurrences
  listHabits(userId: string, includeArchived?: boolean): Promise<any[]>;
  findHabitById(userId: string, id: string): Promise<any | null>;
  createHabit(userId: string, data: any): Promise<any>;
  updateHabit(userId: string, id: string, data: any): Promise<any | null>;
  deleteHabit(userId: string, id: string): Promise<boolean>;

  listHabitOccurrences(userId: string, filter?: any): Promise<any[]>;
  findHabitOccurrenceById(userId: string, id: string): Promise<any | null>;
  upsertHabitOccurrence(userId: string, data: any): Promise<any>;
  getHabitCommitmentPolicy(userId: string, habitId: string): Promise<any | null>;
  upsertHabitCommitmentPolicy(userId: string, habitId: string, data: any): Promise<any>;
  evaluateHabitCommitment(userId: string, occurrenceId: string, now?: Date, idempotencyKey?: string): Promise<any>;
  excuseHabitCommitment(userId: string, occurrenceId: string, idempotencyKey?: string): Promise<any>;
  checkIn(userId: string, occurrenceId: string, data: any): Promise<any>;
  habitOccurrenceAction(
    userId: string,
    id: string,
    action: 'skip' | 'fail' | 'undo',
    idempotencyKey?: string,
  ): Promise<any>;
  updateChecklistItem(userId: string, id: string, data: any): Promise<any>;
  setOccurrenceChecklistItem(userId: string, occurrenceId: string, itemId: string, completed: boolean): Promise<any>;
  habitStats(userId: string, habitId: string): Promise<any>;
  listHabitStats(userId: string, habitIds: string[]): Promise<Record<string, any>>;

  // Task Tags & Notifications
  listTaskTags(userId: string): Promise<any[]>;
  createTaskTag(userId: string, data: any): Promise<any>;

  listNotifications(userId: string, filter?: any): Promise<any[]>;
  markAllNotificationsRead(userId: string): Promise<boolean>;
  markNotificationRead(userId: string, id: string): Promise<boolean>;
}

export interface IGrowthRepository {
  overview(userId: string): Promise<any>;
  getOrCreateProfile(userId: string): Promise<any>;
  updateProfile(userId: string, data: any): Promise<any>;
  completeOnboarding(userId: string, selectedSkills: any[]): Promise<any>;
  applyPreset(userId: string, preset: any): Promise<any>;
  getRewardPresets(userId: string): Promise<any>;
  updateRewardPreset(userId: string, preset: any, rules: any): Promise<any>;
  listTaskRewardDefaults(userId: string): Promise<any[]>;
  upsertTaskRewardDefault(userId: string, data: any): Promise<any>;

  listSkills(userId: string, includeArchived?: boolean, kind?: any): Promise<any[]>;
  findSkillById(userId: string, id: string): Promise<any | null>;
  createSkill(userId: string, data: any): Promise<any>;
  updateSkill(userId: string, id: string, data: any): Promise<any | null>;
  deleteSkill(userId: string, id: string): Promise<boolean>;
  reorderSkills(userId: string, skillIds: string[]): Promise<any[]>;
  listAttributeMappings(userId: string, skillId?: string): Promise<unknown[]>;
  upsertAttributeMappings(userId: string, data: GrowthAttributeMappingsInput): Promise<unknown[]>;

  listEarningRules(userId: string, sourceType?: string, sourceId?: string): Promise<any[]>;
  findEarningRule(userId: string, sourceType: string, sourceId: string): Promise<any | null>;
  upsertEarningRule(userId: string, data: any): Promise<any>;
  listLedger(userId: string, options?: any): Promise<any>;
  growthStatistics(userId: string, from: Date, to: Date): Promise<any>;

  listShopRewards(userId: string, includeArchived?: boolean): Promise<any[]>;
  createShopReward(userId: string, data: any): Promise<any>;
  updateShopReward(userId: string, id: string, data: any): Promise<any | null>;
  deleteShopReward(userId: string, id: string): Promise<boolean>;

  listRedemptions(userId: string, options?: any): Promise<any>;
  redeemShopReward(userId: string, rewardId: string): Promise<any>;
  listItemCategories(userId: string, includeArchived?: boolean): Promise<any[]>;
  createItemCategory(userId: string, data: any): Promise<any>;
  updateItemCategory(userId: string, id: string, data: any): Promise<any | null>;
  reorderItemCategories(userId: string, categoryIds: string[]): Promise<any[]>;
  reorderShopRewards(userId: string, rewardIds: string[]): Promise<any[]>;
  listInventory(userId: string): Promise<any[]>;
  listInventoryHistory(userId: string, options?: any): Promise<any[]>;
  consumeInventoryItem(userId: string, rewardId: string, idempotencyKey: string): Promise<any>;

  previewReset(userId: string, scope: any, skillId?: string): Promise<any>;
  executeReset(userId: string, data: any): Promise<any>;

  awardActivity(
    userId: string,
    sourceType: any,
    ruleSourceId: string,
    title: string,
    metadata?: any,
    activitySourceId?: string,
  ): Promise<boolean>;
  reverseActivity(userId: string, sourceType: any, sourceId: string, title: string): Promise<boolean>;
}

export interface GrowthAttributeMappingsInput {
  skillId: string;
  mappings: Array<{
    attributeId: string;
    slot: 'PRIMARY' | 'SECONDARY';
    weight: number;
  }>;
}
