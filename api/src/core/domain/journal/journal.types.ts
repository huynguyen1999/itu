import { JournalEntryKind } from '../enums';
import { EntityId } from '../models';

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
  periodStart: string;
  periodEnd: string;
  summarySnapshot: Record<string, unknown>;
  wentWellMarkdown?: string | null;
  frictionMarkdown?: string | null;
  nextWeekMarkdown?: string | null;
  experimentSnapshot?: Record<string, unknown> | null;
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
  deletedByDeviceId?: string | null;
  weeklyReview?: JournalWeeklyReviewModel | null;
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
