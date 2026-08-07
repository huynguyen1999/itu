import { ExpenseCategory, JournalEntryKind, PaymentMethod, WeightUnit } from '@core/domain/enums';
import {
  ExerciseDefinitionModel,
  JournalAttachmentModel,
  JournalEntryModel,
  JournalEntryRevisionModel,
  JournalExpenseModel,
  JournalTagModel,
  JournalTemplateModel,
  JournalWeeklyReviewModel,
  JournalWorkoutExerciseModel,
  JournalWorkoutModel,
  JournalWorkoutSetModel,
} from '@core/domain/journal/journal.types';

export interface CreateJournalEntryData {
  id: string;
  kind: JournalEntryKind;
  title: string;
  contentMarkdown?: string;
  entryDate: Date;
  timezone?: string;
  templateId?: string | null;
  tagIds?: string[];
  weeklyReview?: {
    periodStart: Date;
    periodEnd: Date;
    summarySnapshot: Record<string, unknown>;
  };
  expense?: {
    amount: number | string;
    currency?: string;
    category?: ExpenseCategory;
    merchant?: string | null;
    paymentMethod?: PaymentMethod;
    transactionAt?: Date;
  };
  workout?: {
    startedAt?: Date | null;
    durationMinutes?: number | null;
    exercises: {
      id?: string;
      exerciseId: string;
      sortOrder?: number;
      note?: string | null;
      sets: {
        id?: string;
        sortOrder?: number;
        reps: number;
        weight: number;
      }[];
    }[];
  };
}

export interface UpdateJournalEntryData {
  title?: string;
  contentMarkdown?: string;
  entryDate?: Date;
  timezone?: string;
  templateId?: string | null;
  tagIds?: string[];
  weeklyReview?: {
    periodStart?: Date;
    periodEnd?: Date;
    summarySnapshot?: Record<string, unknown>;
  };
  expense?: {
    amount?: number | string;
    currency?: string;
    category?: ExpenseCategory;
    merchant?: string | null;
    paymentMethod?: PaymentMethod;
    transactionAt?: Date;
  };
  workout?: {
    startedAt?: Date | null;
    durationMinutes?: number | null;
    exercises?: {
      id?: string;
      exerciseId: string;
      sortOrder?: number;
      note?: string | null;
      sets: {
        id?: string;
        sortOrder?: number;
        reps: number;
        weight: number;
      }[];
    }[];
  };
}

export interface JournalSearchFilter {
  kind?: JournalEntryKind;
  tagId?: string;
  startDate?: Date;
  endDate?: Date;
  currency?: string;
  category?: ExpenseCategory;
  query?: string;
}

export interface IJournalRepository {
  findById(userId: string, id: string): Promise<JournalEntryModel | null>;
  list(userId: string, filter?: JournalSearchFilter): Promise<JournalEntryModel[]>;
  create(userId: string, data: CreateJournalEntryData, mutationMeta?: { deviceId?: string; mutationId?: string }): Promise<JournalEntryModel>;
  update(userId: string, id: string, data: UpdateJournalEntryData, mutationMeta?: { deviceId?: string; mutationId?: string }): Promise<JournalEntryModel | null>;
  delete(userId: string, id: string): Promise<boolean>;
  restore(userId: string, id: string): Promise<JournalEntryModel | null>;
  listRevisions(userId: string, entryId: string): Promise<JournalEntryRevisionModel[]>;
  restoreRevision(userId: string, entryId: string, revisionId: string): Promise<JournalEntryModel | null>;
}

export interface CreateJournalTemplateData {
  id?: string;
  name: string;
  entryKind: JournalEntryKind;
  titleTemplate?: string;
  bodyMarkdown?: string;
  defaults?: Record<string, unknown>;
  builtIn?: boolean;
}

export interface UpdateJournalTemplateData {
  name?: string;
  entryKind?: JournalEntryKind;
  titleTemplate?: string;
  bodyMarkdown?: string;
  defaults?: Record<string, unknown>;
  archivedAt?: Date | null;
}

export interface IJournalTemplateRepository {
  list(userId: string, includeArchived?: boolean): Promise<JournalTemplateModel[]>;
  findById(userId: string, id: string): Promise<JournalTemplateModel | null>;
  create(userId: string, data: CreateJournalTemplateData): Promise<JournalTemplateModel>;
  update(userId: string, id: string, data: UpdateJournalTemplateData): Promise<JournalTemplateModel | null>;
  delete(userId: string, id: string): Promise<boolean>;
}

export interface IJournalTagRepository {
  list(userId: string): Promise<JournalTagModel[]>;
  create(userId: string, name: string, color?: string): Promise<JournalTagModel>;
  findOrCreateByName(userId: string, name: string, color?: string): Promise<JournalTagModel>;
}

export interface IExerciseDefinitionRepository {
  list(userId: string): Promise<ExerciseDefinitionModel[]>;
  findOrCreateByName(userId: string, name: string, defaultWeightUnit?: WeightUnit): Promise<ExerciseDefinitionModel>;
}

export interface IJournalAttachmentRepository {
  findById(userId: string, id: string): Promise<JournalAttachmentModel | null>;
  create(userId: string, data: { id: string; entryId: string; fileName: string; mimeType: string; sizeBytes: number; storageKey: string }): Promise<JournalAttachmentModel>;
  listByEntry(userId: string, entryId: string): Promise<JournalAttachmentModel[]>;
  delete(userId: string, id: string): Promise<boolean>;
}
