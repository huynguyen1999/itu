export type CardSide = 'PROMPT' | 'ANSWER';
export type CardType = 'BASIC' | 'REVERSE';
export type ReviewDirection = 'FRONT_TO_BACK' | 'BACK_TO_FRONT';
export type ReviewGrade = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
export type StartSessionMode = 'DUE' | 'CRAM';
export type AiJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED';
export type DeckIcon = 'INBOX' | 'BOOK' | 'BRAIN' | 'LANGUAGE' | 'FLASK' | 'CODE' | 'LEAF' | 'CALCULATOR' | 'GLOBE';
export type DeckColor = 'SLATE' | 'EMERALD' | 'TEAL' | 'BLUE' | 'INDIGO' | 'VIOLET' | 'ROSE' | 'AMBER';

export interface CursorPage<T> {
  data: T[];
  meta: {
    nextCursor?: string | null;
    hasNextPage: boolean;
  };
}

export interface CursorPageParams {
  cursor?: string | null;
  limit?: number;
  q?: string;
}

export interface AuthSession {
  user: {
    id: string;
    email?: string | null;
    username?: string | null;
    displayName?: string | null;
    roles: string[];
    permissions: string[];
  };
  accessToken: string;
}

export interface Deck {
  id: string;
  title: string;
  description?: string | null;
  icon: DeckIcon;
  color: DeckColor;
  isDefault: boolean;
  archived: boolean;
  version?: number;
}

export interface DeckListItem extends Deck {
  studyStats: {
    totalCards: number;
    toReviewCount: number;
    newCount: number;
    dueCount: number;
    reviewedCount: number;
    lastStudiedAt?: string | null;
  };
}

export interface CardImage {
  id: string;
  cardId?: string;
  side: CardSide;
  url: string;
  width: number;
  height: number;
  deletedAt?: string | null;
}

export interface Card {
  id: string;
  deckId: string;
  type: CardType;
  promptRichText: string;
  answerRichText: string;
  tags: string[];
  version?: number;
  images: CardImage[];
  reviewSummary?: {
    nextDueAt?: string | null;
    reviewCount: number;
  };
}

export interface TrashSnapshot {
  decks: Deck[];
  cards: Card[];
  cardImages: CardImage[];
  tasks: ProductivityTask[];
}

export interface CreateCardRequest {
  type: CardType;
  promptRichText: string;
  answerRichText: string;
  tags?: string[];
}

export interface UpdateCardRequest {
  type?: CardType;
  promptRichText?: string;
  answerRichText?: string;
  tags?: string[];
  resetReviewDate?: boolean;
  version?: number;
}

export interface DueItem {
  card: Card;
  state: {
    cardId: string;
    direction: ReviewDirection;
    dueAt: string;
  };
}

export interface AiJob {
  id: string;
  status: AiJobStatus;
  output?: unknown;
  error?: string | null;
}

export interface AiSuggestedCard {
  promptRichText: string;
  answerRichText: string;
  tags: string[];
}

export interface CardGrading {
  cardId: string;
  correctness: 'CORRECT' | 'PARTIALLY_CORRECT' | 'INCORRECT';
  explanation: string;
}

export interface AiCardSuggestionOutput {
  cards: AiSuggestedCard[];
}

export interface AiSessionFeedback {
  id: string;
  userId: string;
  sessionId: string;
  summary: string;
  weakAreas: string[];
  nextSteps: string[];
  confidence?: number | null;
  createdAt: string;
}

export interface StudyCalendarDay {
  date: string;
  sessions: number;
  focusSessions: number;
  reviews: number;
  correct: number;
  completedTasks: number;
  focusedMinutes: number;
  cardsCreated: number;
}

export interface DeckStats {
  deckId: string;
  totalCards: number;
  retentionRate: number;
  gradeDistribution: Record<ReviewGrade, number>;
  upcomingReviewForecast: Array<{
    date: string;
    dueCount: number;
  }>;
}

export interface DashboardDeckSummary {
  id: string;
  title: string;
  dueCount: number;
  totalCards: number;
}

export interface RecentStudySession {
  id: string;
  mode: StartSessionMode;
  reviewed: number;
  correct: number;
  rating?: number | null;
  completedAt?: string | null;
}

export interface StudySessionHistoryItem {
  id: string;
  deckId?: string | null;
  deckTitle?: string | null;
  mode: StartSessionMode;
  rating?: number | null;
  reviewed: number;
  correct: number;
  correctRate: number;
  startedAt: string;
  completedAt?: string | null;
}

/** Response returned when a study session is finalized. Growth is awarded from
 * the completed session's review count; correctness is intentionally not part
 * of the earning contract. */
export interface StudySessionCompletion {
  id: string;
  rating?: number | null;
  reviewed?: number;
  correct?: number;
  completedAt?: string | null;
  growthReceipt?: GrowthAwardReceipt | null;
}

export interface SessionReviewItem {
  cardId: string;
  direction: 'FRONT_TO_BACK' | 'BACK_TO_FRONT';
  grade: 'AGAIN' | 'HARD' | 'GOOD' | 'EASY';
  userAnswer?: string | null;
  promptRichText: string;
  answerRichText: string;
}

export interface StudySessionDetails extends StudySessionHistoryItem {
  reviews: SessionReviewItem[];
  feedback?: AiSessionFeedback | null;
}

export interface ActiveRecallTrendPoint {
  id: string;
  completedAt: string;
  correctRate: number;
  reviewed: number;
  correct: number;
  rating?: number | null;
}

export interface DashboardSummary {
  dueCount: number;
  streakDays: number;
  retentionRate: number;
  decks: DashboardDeckSummary[];
  recentSessions: RecentStudySession[];
  activeRecallTrend: ActiveRecallTrendPoint[];
}

export interface SubmitReviewRequest {
  cardId: string;
  direction: ReviewDirection;
  grade: ReviewGrade;
  userAnswer?: string;
  responseMs?: number;
  /** Stable client key used to make review submission exactly-once across retries. */
  idempotencyKey?: string;
}

export type TaskPriority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
export type TaskStatus = 'INBOX' | 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELED' | 'ARCHIVED';

export interface TaskList {
  id: string;
  title: string;
  description?: string | null;
  color: string;
  isDefault?: boolean;
  archivedAt?: string | null;
  version: number;
  taskCount?: number;
}
export type Project = TaskList;

export interface TaskTag {
  id: string;
  name: string;
  color: string;
}

export interface TaskSection {
  id: string;
  taskListId?: string | null;
  projectId?: string | null;
  title: string;
  sortOrder: number;
  version: number;
}

export interface TaskReminder {
  id: string;
  remindAt: string;
  status: 'SCHEDULED' | 'SNOOZED' | 'DISMISSED' | 'DELIVERED' | 'CANCELED';
  persistent: boolean;
}

export interface AppNotification {
  id: string;
  reminderId: string;
  title: string;
  body: string;
  actionUrl: string;
  readAt?: string | null;
  createdAt: string;
}

export interface ProductivityTask {
  id: string;
  taskListId?: string | null;
  projectId?: string | null;
  sectionId?: string | null;
  parentId?: string | null;
  title: string;
  descriptionMarkdown: string;
  priority: TaskPriority;
  important: boolean;
  urgentOverride?: boolean | null;
  urgent: boolean;
  urgencyReason: string;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  dueAt?: string | null;
  estimatedMinutes?: number | null;
  recurrenceRule?: string | null;
  status: TaskStatus;
  sortOrder: number;
  completedAt?: string | null;
  deletedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  version: number;
  taskList?: TaskList | null;
  project?: TaskList | null;
  section?: TaskSection | null;
  tags: Array<{ tag: TaskTag }>;
  reminders: TaskReminder[];
  children: Array<{ id: string; status: TaskStatus }>;
}

export interface TaskInput {
  title: string;
  descriptionMarkdown?: string;
  taskListId?: string | null;
  projectId?: string | null;
  sectionId?: string | null;
  parentId?: string;
  priority?: TaskPriority;
  important?: boolean;
  urgentOverride?: boolean | null;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  dueAt?: string | null;
  estimatedMinutes?: number;
  recurrenceRule?: string;
  status?: TaskStatus;
  tagIds?: string[];
  version?: number;
}

export interface FocusPreset {
  id: string;
  name: string;
  workMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLong: number;
  autoStartBreaks: boolean;
  autoStartWork: boolean;
  isDefault: boolean;
}

export interface FocusSession {
  id: string;
  taskId?: string | null;
  mode: 'COUNTDOWN' | 'STOPWATCH';
  phase: 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK';
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ABANDONED';
  plannedSeconds?: number | null;
  accumulatedPauseSecs: number;
  cycle: number;
  taskTitleSnapshot?: string | null;
  customTitle?: string | null;
  taskListTitleSnapshot?: string | null;
  projectTitleSnapshot?: string | null;
  tagNamesSnapshot: string[];
  startedAt: string;
  pausedAt?: string | null;
  completedAt?: string | null;
  adjustedStartedAt?: string | null;
  adjustedCompletedAt?: string | null;
  reflection?: string | null;
  ownerDeviceId?: string | null;
  version: number;
  preset?: FocusPreset | null;
}

export type FocusMutationResponse = FocusSession & { growthReceipt?: GrowthAwardReceipt | null };

export interface FocusSound {
  id: string;
  name: string;
  originalName: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number | null;
  version: number;
  category: string;
  source: 'BUILTIN' | 'UPLOAD';
  defaultVolume: number;
}

export interface FocusSoundPreference {
  id: string;
  soundKey: string;
  enabled: boolean;
  sortOrder: number;
  volume: number;
  updatedAt: string;
}

export type HabitTargetType = 'BOOLEAN' | 'COUNT' | 'DURATION' | 'QUANTITY';
export type HabitScheduleType = 'WEEKDAYS' | 'INTERVAL' | 'TIMES_PER_PERIOD';
export type HabitDirection = 'BUILD' | 'LIMIT';
export type HabitTaskSyncPolicy = 'NONE' | 'TASK_TO_HABIT' | 'HABIT_TO_TASK' | 'BIDIRECTIONAL';

export interface HabitTimeBlock {
  id: string;
  name: string;
  icon: string;
  color: string;
  startLocal: string;
  endLocal: string;
  sortOrder: number;
}

export interface HabitChecklistItem {
  id: string;
  title: string;
  required: boolean;
  sortOrder: number;
}

export interface HabitTaskTemplate {
  id: string;
  title: string;
  descriptionMarkdown: string;
  taskListId?: string | null;
  projectId?: string | null;
  sectionId?: string | null;
  priority: TaskPriority;
  estimatedMinutes?: number | null;
  tagIds: string[];
  syncPolicy: HabitTaskSyncPolicy;
  enabled: boolean;
}

export interface Habit {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  targetType: HabitTargetType;
  targetValue: number;
  unit?: string | null;
  direction: HabitDirection;
  timezone: string;
  timeBlockId?: string | null;
  timeBlock?: HabitTimeBlock | null;
  scheduleType: HabitScheduleType;
  weekdays: number[];
  intervalDays?: number | null;
  timesPerPeriod?: number | null;
  period?: string | null;
  startDate: string;
  endDate?: string | null;
  difficulty: number;
  allowedSkips: number;
  restDays: number[];
  taskTemplateId?: string | null;
  focusPresetId?: string | null;
  archivedAt?: string | null;
  version: number;
  tags: Array<{ tag: TaskTag }>;
  reminders: Array<{ id: string; timeLocal: string; enabled: boolean }>;
  checklistItems: HabitChecklistItem[];
  taskTemplateConfig?: HabitTaskTemplate | null;
  stats?: HabitStats | null;
}

export interface HabitOccurrence {
  id: string;
  occurrenceDate: string;
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  habit: Habit;
  checkIn?: { id: string; value: number; note?: string | null; adjusted: boolean } | null;
  progressLogs: Array<{
    id: string;
    source: 'MANUAL' | 'FOCUS_SESSION' | 'TASK_COMPLETION' | 'HEALTH' | 'SCREEN_TIME' | 'CALENDAR' | 'EXTERNAL';
    value: number;
    note?: string | null;
    adjusted: boolean;
    recordedAt: string;
  }>;
  checklistItems: Array<HabitChecklistItem & { completedAt?: string | null }>;
  generatedTask?: ProductivityTask | null;
}

export type HabitMutationResponse = HabitOccurrence & { growthReceipt?: GrowthAwardReceipt | null };

export interface HabitStats {
  currentStreak: number;
  bestStreak: number;
  successRate: number;
  focusedMinutes: number;
  completed: number;
  failed: number;
  skipped: number;
  total: number;
  heatmap: Array<{ date: string; status: HabitOccurrence['status']; value: number }>;
}

export type GrowthSourceType = 'TASK' | 'HABIT' | 'FOCUS_PRESET' | 'REVIEW_DECK';
export type GrowthProgressKind = 'ATTRIBUTE' | 'SKILL';
export type GrowthRewardPreset = 'LIGHT' | 'STANDARD' | 'STRONG';
export type GrowthResetScope = 'SKILL' | 'ALL_XP' | 'FULL';
export type GrowthOnboardingState = 'NOT_STARTED' | 'SKILLS_OFFERED' | 'COMPLETED';
export type GrowthScalingMode = 'FIXED' | 'LINEAR';
export type GrowthAttributeMappingSlot = 'PRIMARY' | 'SECONDARY';

export interface GrowthProfile {
  id: string;
  userId: string;
  accountBaseXp: number;
  activeCycleId: string;
  onboardingState: GrowthOnboardingState;
  rewardPreset: GrowthRewardPreset;
  createdAt: string;
  updatedAt: string;
}

export interface GrowthCurvePreview {
  level: number;
  totalXpRequired: number;
  xpForLevel: number;
}

export interface GrowthResetPreview {
  scope: GrowthResetScope;
  affectedSkills: Array<{ id: string; name: string; xpToReset: number; currentLevel: number; newLevel: number }>;
  coinBalanceToReset?: number;
}

export interface GrowthLevelProgress {
  level: number;
  currentXp: number;
  levelStartXp: number;
  nextLevelXp: number;
  progressXp: number;
  requiredXp: number;
  baseXp: number;
}

export interface GrowthSkill extends GrowthLevelProgress {
  id: string;
  name: string;
  kind: GrowthProgressKind;
  description: string;
  icon: string;
  color: string;
  sortOrder: number;
  baseXp: number;
  starterKey?: string | null;
  cycleId?: string | null;
  archivedAt?: string | null;
  version: number;
}

export interface GrowthAttributeMappingDraft {
  attributeId: string;
  slot: GrowthAttributeMappingSlot;
  weight: number | string;
}

export interface GrowthAttributeMapping {
  id: string;
  userId?: string;
  skillId: string;
  attributeId: string;
  slot: GrowthAttributeMappingSlot;
  weight: number;
  skill?: Pick<GrowthSkill, 'id' | 'name' | 'kind' | 'archivedAt'> | null;
  attribute?: Pick<GrowthSkill, 'id' | 'name' | 'kind' | 'icon' | 'color' | 'archivedAt'> | null;
}

export type GrowthProgressEntry = GrowthSkill;

export interface GrowthItemAward {
  itemId: string;
  quantity: number;
  item: GrowthShopReward;
}

export interface GrowthEarningRule {
  id: string;
  sourceType: GrowthSourceType;
  sourceId: string;
  coinReward: number;
  accountXp: number;
  enabled: boolean;
  scalingMode: GrowthScalingMode;
  maxRewardCap?: number | null;
  version: number;
  skillAwards: Array<{ skillId: string; xpReward: number; skill: GrowthSkill }>;
  itemAwards: GrowthItemAward[];
}

export interface GrowthTaskRewardDefault {
  id: string;
  taskListId?: string | null;
  coinReward: number;
  accountXp: number;
  enabled: boolean;
  skillAwards: Array<{ skillId: string; xpReward: number; skill: GrowthSkill }>;
  itemAwards: GrowthItemAward[];
  taskList?: TaskList | null;
}

export interface GrowthLedgerEntry {
  id: string;
  currency: 'ACCOUNT_XP' | 'SKILL_XP' | 'COIN';
  skillId?: string | null;
  amount: number;
  kind: 'ACTIVITY_AWARD' | 'REVERSAL' | 'REWARD_PURCHASE' | 'ADMINISTRATIVE_ADJUSTMENT' | 'RESET_ADJUSTMENT';
  sourceType: string;
  sourceId: string;
  cycleId?: string | null;
  titleSnapshot: string;
  createdAt: string;
  metadata?: {
    awardType?: 'SKILL' | 'ATTRIBUTE';
    derivedFromSkillId?: string;
    derivedFromSkillEntryKey?: string;
    mappingSnapshot?: Array<{
      mappingId: string;
      skillId: string;
      attributeId: string;
      slot: GrowthAttributeMappingSlot;
      weight: number;
    }>;
    [key: string]: unknown;
  } | null;
  skill?: Pick<GrowthSkill, 'name' | 'kind' | 'icon' | 'color'> | null;
}

export interface GrowthShopReward {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  price: number | null;
  listedInShop: boolean;
  repeatable: boolean;
  sortOrder: number;
  categoryId?: string | null;
  category?: GrowthItemCategory | null;
  archivedAt?: string | null;
  version: number;
  _count: { redemptions: number };
}

export interface GrowthItemCategory {
  id: string;
  name: string;
  sortOrder: number;
  archivedAt?: string | null;
  version: number;
  _count?: { items: number };
}

export interface GrowthInventoryBalance {
  item: GrowthShopReward;
  quantity: number;
}

export interface GrowthInventoryTransaction {
  id: string;
  itemId: string;
  quantity: number;
  kind: 'PURCHASE' | 'TASK_AWARD' | 'CONSUMPTION' | 'REVERSAL' | 'ADJUSTMENT';
  sourceType: string;
  sourceId: string;
  createdAt: string;
  item: GrowthShopReward;
}

export interface GrowthAwardReceipt {
  sourceType: GrowthSourceType;
  sourceId: string;
  title: string;
  reverted?: boolean;
  /** Client-only lifecycle key used to suppress duplicate overlays across retries/tabs. */
  receiptKey?: string;
  accountAward?: {
    amount: number;
    beforeXp: number;
    afterXp: number;
    beforeLevel: number;
    afterLevel: number;
    nextLevelXp: number;
  } | null;
  progressAwards: Array<{
    progressId: string;
    name: string;
    kind: GrowthProgressKind;
    awardType?: 'SKILL' | 'ATTRIBUTE';
    derivedFromSkillId?: string;
    mappingSnapshot?: Array<{
      mappingId: string;
      skillId: string;
      attributeId: string;
      slot: GrowthAttributeMappingSlot;
      weight: number;
    }>;
    icon: string;
    color: string;
    xpGained: number;
    beforeXp: number;
    afterXp: number;
    beforeLevel: number;
    afterLevel: number;
    nextLevelXp: number;
  }>;
  coinAward: { amount: number; balanceAfter: number } | null;
  itemAwards: Array<{
    itemId: string;
    name: string;
    icon: string;
    color: string;
    quantity: number;
    inventoryQuantityAfter: number;
  }>;
}

export interface GrowthOverview {
  account: GrowthLevelProgress & { coinBalance: number };
  profile: GrowthProfile;
  skills: GrowthSkill[];
  recentLedger: GrowthLedgerEntry[];
}

export interface GrowthStatistics {
  totalXp: number;
  trend: Array<{ date: string; xp: number }>;
  attributes: Array<{
    skillId: string;
    name: string;
    icon: string;
    color: string;
    gained: number;
    lost: number;
    net: number;
    changes: number;
  }>;
}
