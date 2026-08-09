export type JournalEntryKind = 'NOTE' | 'WEEKLY_REVIEW';

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
  query?: string;
  includeDeleted?: boolean;
}
