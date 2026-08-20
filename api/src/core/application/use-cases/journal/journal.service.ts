import { JournalEntryKind } from '@core/domain/enums';
import {
  type JournalAttachmentModel,
  type JournalEntryModel,
  type JournalEntryRevisionModel,
  type JournalTagModel,
  type JournalTemplateModel,
} from '@core/domain/journal/journal.types';
import {
  type CreateJournalEntryData,
  type CreateJournalTemplateData,
  type IJournalAttachmentRepository,
  type IJournalRepository,
  type IJournalTagRepository,
  type IJournalTemplateRepository,
  type IJournalWeeklyReviewQuery,
  type JournalSearchFilter,
  type UpdateJournalEntryData,
  type UpdateJournalTemplateData,
} from '@core/application/ports/out/journal-repository.port';
import { ReviewContextBuilder } from '../review-context.builder';
import type { ReviewRangeInput } from '@core/application/ports/out/review-data-source.port';
import type { ReviewContextV1 } from '@core/domain/review/review.types';
import { ResourceNotFoundException } from '@core/domain/exceptions';
import { ReviewAutomationService } from './review-automation.service';

export class JournalService {
  constructor(
    private readonly journalRepository: IJournalRepository,
    private readonly templateRepository: IJournalTemplateRepository,
    private readonly tagRepository: IJournalTagRepository,
    private readonly attachmentRepository: IJournalAttachmentRepository,
    private readonly weeklyReviewQuery: IJournalWeeklyReviewQuery,
    private readonly reviewContextBuilder: ReviewContextBuilder,
    private readonly reviewAutomation: ReviewAutomationService,
  ) {}

  async listEntries(userId: string, filter?: JournalSearchFilter): Promise<JournalEntryModel[]> {
    if (filter?.kind === JournalEntryKind.DAILY_REVIEW) await this.reviewAutomation.ensureDailyReview(userId);
    if (filter?.kind === JournalEntryKind.WEEKLY_REVIEW) await this.reviewAutomation.ensureWeeklyReview(userId);
    return this.journalRepository.list(userId, filter);
  }

  async getEntry(userId: string, id: string): Promise<JournalEntryModel> {
    const entry = await this.journalRepository.findById(userId, id);
    if (!entry) throw new ResourceNotFoundException('Journal entry not found');
    return entry;
  }

  async createEntry(
    userId: string,
    data: CreateJournalEntryData,
    mutationMeta?: { deviceId?: string; mutationId?: string },
  ): Promise<JournalEntryModel> {
    return this.journalRepository.create(userId, data, mutationMeta);
  }

  async updateEntry(
    userId: string,
    id: string,
    data: UpdateJournalEntryData,
    mutationMeta?: { deviceId?: string; mutationId?: string },
  ): Promise<JournalEntryModel> {
    const updated = await this.journalRepository.update(userId, id, data, mutationMeta);
    if (!updated) throw new ResourceNotFoundException('Journal entry not found');
    return updated;
  }

  async softDeleteEntry(userId: string, id: string): Promise<void> {
    const deleted = await (this.journalRepository.softDelete ?? this.journalRepository.delete)(userId, id);
    if (!deleted) throw new ResourceNotFoundException('Journal entry not found');
  }

  async restoreEntry(userId: string, id: string): Promise<JournalEntryModel> {
    const restored = await this.journalRepository.restore(userId, id);
    if (!restored) throw new ResourceNotFoundException('Journal entry not found');
    return restored;
  }

  async hardDeleteEntry(userId: string, id: string): Promise<void> {
    const deleted = await this.journalRepository.hardDelete(userId, id);
    if (!deleted) throw new ResourceNotFoundException('Journal entry not found');
  }

  async listRevisions(userId: string, entryId: string): Promise<JournalEntryRevisionModel[]> {
    return this.journalRepository.listRevisions(userId, entryId);
  }

  async restoreRevision(userId: string, entryId: string, revisionId: string): Promise<JournalEntryModel> {
    const restored = await this.journalRepository.restoreRevision(userId, entryId, revisionId);
    if (!restored) throw new ResourceNotFoundException('Journal entry revision not found');
    return restored;
  }

  async listTemplates(userId: string): Promise<JournalTemplateModel[]> {
    return this.templateRepository.list(userId);
  }

  async createTemplate(userId: string, data: CreateJournalTemplateData): Promise<JournalTemplateModel> {
    return this.templateRepository.create(userId, data);
  }

  async updateTemplate(userId: string, id: string, data: UpdateJournalTemplateData): Promise<JournalTemplateModel> {
    const updated = await this.templateRepository.update(userId, id, data);
    if (!updated) throw new ResourceNotFoundException('Journal template not found');
    return updated;
  }

  async deleteTemplate(userId: string, id: string): Promise<void> {
    const deleted = await this.templateRepository.delete(userId, id);
    if (!deleted) throw new ResourceNotFoundException('Journal template not found');
  }

  async listTags(userId: string): Promise<JournalTagModel[]> {
    return this.tagRepository.list(userId);
  }

  async findOrCreateTag(userId: string, name: string, color?: string): Promise<JournalTagModel> {
    return this.tagRepository.create(userId, name, color);
  }

  async buildWeeklyReviewSnapshot(userId: string, periodStart: Date, periodEnd: Date) {
    const data = await this.weeklyReviewQuery.getSnapshotData(userId, periodStart, periodEnd);
    return {
      tasks: { completed: data.tasksCompleted },
      focus: {
        minutes: Math.round((Number.isFinite(data.focusActualSeconds) ? data.focusActualSeconds : 0) / 60),
        sessions: data.focusSessions,
      },
      habits: {
        completed: data.habitsCompleted,
        scheduled: data.habitsScheduled,
      },
      learning: { reviews: data.reviews },
      expenses: data.expenses,
      workouts: { sessions: data.workouts },
      growth: { xpEarned: data.xpEarned },
    };
  }

  buildReviewContext(userId: string, input: ReviewRangeInput, entryId?: string): Promise<ReviewContextV1> {
    return this.reviewContextBuilder.build(userId, input, {}, entryId);
  }

  async addAttachment(
    userId: string,
    data: { id: string; entryId: string; fileName: string; mimeType: string; sizeBytes: number; storageKey: string },
  ): Promise<JournalAttachmentModel> {
    return this.attachmentRepository.create(userId, data);
  }

  async getAttachment(userId: string, id: string): Promise<JournalAttachmentModel | null> {
    return this.attachmentRepository.findById(userId, id);
  }

  async deleteAttachment(userId: string, id: string): Promise<boolean> {
    return this.attachmentRepository.delete(userId, id);
  }
}
