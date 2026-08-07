import { ExpenseCategory, JournalEntryKind, PaymentMethod, WeightUnit } from '@core/domain/enums';
type EntityId = string;

export interface JournalTagModel {
  id: EntityId;
  userId: EntityId;
  name: string;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalAttachmentModel {
  id: EntityId;
  userId: EntityId;
  entryId: EntityId;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  url?: string;
  createdAt: Date;
  deletedAt?: Date | null;
}

export interface JournalWeeklyReviewModel {
  entryId: EntityId;
  periodStart: Date;
  periodEnd: Date;
  summarySnapshot: Record<string, unknown>;
}

export interface JournalExpenseModel {
  entryId: EntityId;
  amount: number | string;
  currency: string;
  category: ExpenseCategory;
  merchant?: string | null;
  paymentMethod: PaymentMethod;
  transactionAt: Date;
}

export interface ExerciseDefinitionModel {
  id: EntityId;
  userId: EntityId;
  name: string;
  normalizedName: string;
  defaultWeightUnit: WeightUnit;
  createdAt: Date;
  updatedAt: Date;
}

export interface JournalWorkoutSetModel {
  id: EntityId;
  workoutExerciseId: EntityId;
  sortOrder: number;
  reps: number;
  weight: number;
}

export interface JournalWorkoutExerciseModel {
  id: EntityId;
  workoutEntryId: EntityId;
  exerciseId: EntityId;
  exerciseName?: string;
  sortOrder: number;
  note?: string | null;
  sets: JournalWorkoutSetModel[];
}

export interface JournalWorkoutModel {
  entryId: EntityId;
  startedAt?: Date | null;
  durationMinutes?: number | null;
  exercises: JournalWorkoutExerciseModel[];
}

export interface JournalEntryRevisionModel {
  id: EntityId;
  entryId: EntityId;
  revisionNumber: number;
  snapshot: Record<string, unknown>;
  mutationId?: string | null;
  deviceId?: string | null;
  createdAt: Date;
}

export interface JournalEntryModel {
  id: EntityId;
  userId: EntityId;
  kind: JournalEntryKind;
  title: string;
  contentMarkdown: string;
  entryDate: Date | string;
  timezone: string;
  templateId?: EntityId | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date | null;
  weeklyReview?: JournalWeeklyReviewModel | null;
  expense?: JournalExpenseModel | null;
  workout?: JournalWorkoutModel | null;
  tags?: JournalTagModel[];
  attachments?: JournalAttachmentModel[];
}

export interface JournalTemplateModel {
  id: EntityId;
  userId: EntityId;
  name: string;
  entryKind: JournalEntryKind;
  titleTemplate: string;
  bodyMarkdown: string;
  defaults: Record<string, unknown>;
  builtIn: boolean;
  archivedAt?: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
