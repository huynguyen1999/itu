export type JournalEntryKind = 'NOTE' | 'WEEKLY_REVIEW' | 'EXPENSE' | 'WORKOUT';

export type TransactionType = 'EXPENSE' | 'INCOME';

export type ExpenseCategory =
  | 'FOOD'
  | 'TRANSPORT'
  | 'SHOPPING'
  | 'BILLS'
  | 'HEALTH'
  | 'EDUCATION'
  | 'ENTERTAINMENT'
  | 'FITNESS'
  | 'TRAVEL'
  | 'OTHER';

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'E_WALLET' | 'OTHER';

export type WeightUnit = 'KG' | 'LBS';

export type WorkoutSetType = 'WARMUP' | 'NORMAL' | 'DROP' | 'FAILURE';

export type ExerciseMetricType = 'WEIGHT_REPS' | 'REPS' | 'DURATION' | 'DISTANCE_DURATION';

export interface MoneyCategory {
  id: string;
  userId: string;
  name: string;
  type: TransactionType;
  icon?: string | null;
  sortOrder: number;
  archivedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MoneyCategoryBudget {
  id: string;
  budgetPeriodId: string;
  categoryId: string;
  limit: number;
  createdAt: string;
  updatedAt: string;
}

export interface MoneyBudgetPeriod {
  id: string;
  userId: string;
  period: string; // "2026-08"
  currency: string;
  overallLimit: number;
  createdAt: string;
  updatedAt: string;
  categoryBudgets?: MoneyCategoryBudget[];
}

export interface JournalTag {
  id: string;
  userId: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalAttachment {
  id: string;
  userId: string;
  entryId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  url?: string;
  createdAt: string;
  deletedAt?: string | null;
}

export interface JournalWeeklyReview {
  entryId: string;
  periodStart: string;
  periodEnd: string;
  wentWellMarkdown?: string;
  frictionMarkdown?: string;
  nextWeekMarkdown?: string;
  experimentSnapshot?: any;
  summarySnapshot: {
    tasks?: { completed: number };
    focus?: { minutes: number; sessions: number };
    habits?: { completed: number; scheduled: number };
    learning?: { reviews: number };
    expenses?: Record<string, number>;
    workouts?: { sessions: number };
    growth?: { xpEarned: number };
    [key: string]: unknown;
  };
}

export interface JournalExpense {
  entryId: string;
  type?: TransactionType;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  categoryId?: string | null;
  merchant?: string | null;
  paymentMethod: PaymentMethod;
  accountId?: string | null;
  transactionAt: string;
}

export interface ExerciseDefinition {
  id: string;
  userId: string;
  name: string;
  normalizedName: string;
  metricType?: ExerciseMetricType;
  equipment?: string | null;
  primaryMuscleGroup?: string | null;
  secondaryMuscleGroups?: string[];
  defaultWeightUnit: WeightUnit;
  defaultRestSeconds?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface JournalWorkoutSet {
  id: string;
  workoutExerciseId: string;
  sortOrder: number;
  type?: WorkoutSetType;
  reps?: number | null;
  weight?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  rpe?: number | null;
  completedAt?: string | null;
}

export interface JournalWorkoutExercise {
  id: string;
  workoutEntryId: string;
  exerciseId: string;
  exerciseName?: string;
  sortOrder: number;
  note?: string | null;
  restSeconds?: number | null;
  sets: JournalWorkoutSet[];
}

export interface JournalWorkout {
  entryId: string;
  title?: string | null;
  source?: string | null;
  routineId?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  durationMinutes?: number | null;
  exercises: JournalWorkoutExercise[];
}

export interface GymRoutineExercise {
  id: string;
  routineId: string;
  exerciseId: string;
  exerciseName?: string;
  sortOrder: number;
  targetSets: number;
  targetRepsRange?: string;
  restSeconds?: number;
}

export interface GymRoutine {
  id: string;
  userId: string;
  name: string;
  description?: string;
  estimatedMinutes?: number;
  lastUsedAt?: string | null;
  exercises: GymRoutineExercise[];
}

export interface JournalEntryRevision {
  id: string;
  entryId: string;
  revisionNumber: number;
  snapshot: Record<string, unknown>;
  mutationId?: string | null;
  deviceId?: string | null;
  createdAt: string;
}

export interface JournalEntry {
  id: string;
  userId: string;
  kind: JournalEntryKind;
  title: string;
  contentMarkdown: string;
  entryDate: string;
  timezone: string;
  templateId?: string | null;
  tagIds?: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  weeklyReview?: JournalWeeklyReview | null;
  expense?: JournalExpense | null;
  workout?: JournalWorkout | null;
  tags?: JournalTag[];
  attachments?: JournalAttachment[];
}

export interface JournalTemplate {
  id: string;
  userId: string;
  name: string;
  entryKind: JournalEntryKind;
  titleTemplate: string;
  bodyMarkdown: string;
  defaults: Record<string, unknown>;
  builtIn: boolean;
  archivedAt?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SearchJournalFilter {
  kind?: JournalEntryKind;
  tagId?: string;
  startDate?: string;
  endDate?: string;
  currency?: string;
  category?: ExpenseCategory;
  type?: TransactionType;
  query?: string;
}

