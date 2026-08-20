import { JournalEntryKind } from '@core/domain/enums';
import {
  JournalAttachmentModel,
  JournalDailyReviewModel,
  JournalEntryModel,
  JournalEntryRevisionModel,
  JournalTagModel,
  JournalTemplateModel,
  JournalWeeklyReviewModel,
} from '@core/domain/journal/journal.types';

export interface CreateJournalEntryData {
  id: string;
  kind: JournalEntryKind;
  title: string;
  contentMarkdown?: string;
  entryDate: Date;
  timezone?: string;
  templateId?: string | null;
  contextType?: string | null;
  contextId?: string | null;
  contextData?: Record<string, unknown> | null;
  tagIds?: string[];
  weeklyReview?: {
    periodStart: Date;
    periodEnd: Date;
    summarySnapshot: Record<string, unknown>;
    wentWellMarkdown?: string | null;
    frictionMarkdown?: string | null;
    nextWeekMarkdown?: string | null;
    experimentSnapshot?: Record<string, unknown> | null;
    learnedMarkdown?: string | null;
    differentFromLastWeekMarkdown?: string | null;
    comparisonSnapshot?: Record<string, unknown> | null;
    aiInsightsSnapshot?: Record<string, unknown> | null;
    aiGenerationJobId?: string | null;
    aiGeneratedAt?: Date | null;
    aiPromptVersion?: string | null;
    aiSourceEntryVersion?: number | null;
  };
  dailyReview?: {
    periodDate: Date;
    summarySnapshot: Record<string, unknown>;
    wentWellMarkdown?: string | null;
    frictionMarkdown?: string | null;
    learnedMarkdown?: string | null;
    contextMarkdown?: string | null;
    aiInsightsSnapshot?: Record<string, unknown> | null;
    aiGenerationJobId?: string | null;
    aiGeneratedAt?: Date | null;
    aiPromptVersion?: string | null;
    aiSourceEntryVersion?: number | null;
  };
}

export interface UpdateJournalEntryData {
  title?: string;
  contentMarkdown?: string;
  entryDate?: Date;
  timezone?: string;
  templateId?: string | null;
  contextType?: string | null;
  contextId?: string | null;
  contextData?: Record<string, unknown> | null;
  tagIds?: string[];
  weeklyReview?: {
    periodStart?: Date;
    periodEnd?: Date;
    summarySnapshot?: Record<string, unknown>;
    wentWellMarkdown?: string | null;
    frictionMarkdown?: string | null;
    nextWeekMarkdown?: string | null;
    experimentSnapshot?: Record<string, unknown> | null;
    learnedMarkdown?: string | null;
    differentFromLastWeekMarkdown?: string | null;
    comparisonSnapshot?: Record<string, unknown> | null;
    aiInsightsSnapshot?: Record<string, unknown> | null;
    aiGenerationJobId?: string | null;
    aiGeneratedAt?: Date | null;
    aiPromptVersion?: string | null;
    aiSourceEntryVersion?: number | null;
  };
  dailyReview?: Partial<CreateJournalEntryData['dailyReview']>;
}

export interface JournalSearchFilter {
  kind?: JournalEntryKind;
  tagId?: string;
  contextType?: string;
  contextId?: string;
  startDate?: Date;
  endDate?: Date;
  query?: string;
  includeDeleted?: boolean;
}

export interface IJournalRepository {
  findById(userId: string, id: string): Promise<JournalEntryModel | null>;
  list(userId: string, filter?: JournalSearchFilter): Promise<JournalEntryModel[]>;
  create(userId: string, data: CreateJournalEntryData, mutationMeta?: { deviceId?: string; mutationId?: string }): Promise<JournalEntryModel>;
  update(userId: string, id: string, data: UpdateJournalEntryData, mutationMeta?: { deviceId?: string; mutationId?: string }): Promise<JournalEntryModel | null>;
  delete(userId: string, id: string): Promise<boolean>;
  softDelete(userId: string, id: string): Promise<boolean>;
  hardDelete(userId: string, id: string): Promise<JournalAttachmentModel[] | null>;
  restore(userId: string, id: string): Promise<JournalEntryModel | null>;
  saveReviewAiInsights(
    userId: string,
    entryId: string,
    sourceEntryVersion: number,
    generationId: string | null,
    summarySnapshot: Record<string, unknown>,
    comparisonSnapshot: Record<string, unknown> | undefined,
    insightsSnapshot: Record<string, unknown>,
  ): Promise<JournalEntryModel | null>;
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


export interface IJournalAttachmentRepository {
  findById(userId: string, id: string): Promise<JournalAttachmentModel | null>;
  create(userId: string, data: { id: string; entryId: string; fileName: string; mimeType: string; sizeBytes: number; storageKey: string }): Promise<JournalAttachmentModel>;
  listByEntry(userId: string, entryId: string): Promise<JournalAttachmentModel[]>;
  delete(userId: string, id: string): Promise<boolean>;
}

export interface JournalWeeklyReviewSnapshotData {
  tasksCompleted: number;
  focusActualSeconds: number;
  focusSessions: number;
  habitsScheduled: number;
  habitsCompleted: number;
  reviews: number;
  expenses: Record<string, string>;
  workouts: number;
  xpEarned: number;
}

export interface IJournalWeeklyReviewQuery {
  getSnapshotData(userId: string, periodStart: Date, periodEnd: Date): Promise<JournalWeeklyReviewSnapshotData>;
}

export interface JournalAutomationUser {
  userId: string;
  timezone?: string | null;
}

export interface IJournalAutomationUserQuery {
  findTimezone(userId: string): Promise<string | null>;
  listUsers(): Promise<JournalAutomationUser[]>;
}

export const JOURNAL_REPOSITORY = 'JOURNAL_REPOSITORY';
export const JOURNAL_TEMPLATE_REPOSITORY = 'JOURNAL_TEMPLATE_REPOSITORY';
export const JOURNAL_TAG_REPOSITORY = 'JOURNAL_TAG_REPOSITORY';
export const JOURNAL_ATTACHMENT_REPOSITORY = 'JOURNAL_ATTACHMENT_REPOSITORY';
export const JOURNAL_WEEKLY_REVIEW_QUERY = 'JOURNAL_WEEKLY_REVIEW_QUERY';
export const JOURNAL_AUTOMATION_USER_QUERY = 'JOURNAL_AUTOMATION_USER_QUERY';
