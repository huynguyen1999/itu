import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { JournalEntryKind } from '@core/domain/enums';
import {
  JournalAttachmentModel,
  JournalEntryModel,
  JournalEntryRevisionModel,
  JournalTagModel,
  JournalTemplateModel,
} from '@core/domain/journal/journal.types';
import {
  CreateJournalEntryData,
  CreateJournalTemplateData,
  IJournalAttachmentRepository,
  IJournalRepository,
  IJournalTagRepository,
  IJournalTemplateRepository,
  JournalSearchFilter,
  UpdateJournalEntryData,
  UpdateJournalTemplateData,
} from '@core/application/ports/out/journal-repository.port';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';

export const JOURNAL_REPOSITORY = 'JOURNAL_REPOSITORY';
export const JOURNAL_TEMPLATE_REPOSITORY = 'JOURNAL_TEMPLATE_REPOSITORY';
export const JOURNAL_TAG_REPOSITORY = 'JOURNAL_TAG_REPOSITORY';
export const JOURNAL_ATTACHMENT_REPOSITORY = 'JOURNAL_ATTACHMENT_REPOSITORY';

@Injectable()
export class JournalService {
  constructor(
    @Inject(JOURNAL_REPOSITORY)
    private readonly journalRepository: any,
    @Inject(JOURNAL_TEMPLATE_REPOSITORY)
    private readonly templateRepository: any,
    @Inject(JOURNAL_TAG_REPOSITORY)
    private readonly tagRepository: any,
    @Inject(JOURNAL_ATTACHMENT_REPOSITORY)
    private readonly attachmentRepository: any,
    private readonly prisma: PrismaService,
  ) {}

  async listEntries(userId: string, filter?: JournalSearchFilter): Promise<JournalEntryModel[]> {
    return this.journalRepository.list(userId, filter);
  }

  async getEntry(userId: string, id: string): Promise<JournalEntryModel> {
    const entry = await this.journalRepository.findById(userId, id);
    if (!entry) throw new NotFoundException('Journal entry not found');
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
    if (!updated) throw new NotFoundException('Journal entry not found');
    return updated;
  }

  async softDeleteEntry(userId: string, id: string): Promise<void> {
    const deleted = await (this.journalRepository.softDelete ?? this.journalRepository.delete)(userId, id);
    if (!deleted) throw new NotFoundException('Journal entry not found');
  }

  async restoreEntry(userId: string, id: string): Promise<JournalEntryModel> {
    const restored = await this.journalRepository.restore(userId, id);
    if (!restored) throw new NotFoundException('Journal entry not found');
    return restored;
  }

  async hardDeleteEntry(userId: string, id: string): Promise<void> {
    const deleted = await this.journalRepository.hardDelete(userId, id);
    if (!deleted) throw new NotFoundException('Journal entry not found');
  }

  async listRevisions(userId: string, entryId: string): Promise<JournalEntryRevisionModel[]> {
    return this.journalRepository.listRevisions(userId, entryId);
  }

  async restoreRevision(userId: string, entryId: string, revisionId: string): Promise<JournalEntryModel> {
    const restored = await this.journalRepository.restoreRevision(userId, entryId, revisionId);
    if (!restored) throw new NotFoundException('Journal entry revision not found');
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
    if (!updated) throw new NotFoundException('Journal template not found');
    return updated;
  }

  async deleteTemplate(userId: string, id: string): Promise<void> {
    const deleted = await this.templateRepository.delete(userId, id);
    if (!deleted) throw new NotFoundException('Journal template not found');
  }

  async listTags(userId: string): Promise<JournalTagModel[]> {
    return this.tagRepository.list(userId);
  }

  async findOrCreateTag(userId: string, name: string, color?: string): Promise<JournalTagModel> {
    return this.tagRepository.create(userId, name, color);
  }

  async buildWeeklyReviewSnapshot(userId: string, periodStart: Date, periodEnd: Date) {
    const [tasksCompleted, focusStats, habitStats, reviewLogsCount, expensesRaw, workoutsCount, growthLedgerSum] =
      await Promise.all([
        this.prisma.task.count({
          where: { userId, completedAt: { gte: periodStart, lte: periodEnd } },
        }),
        this.prisma.focusSession.aggregate({
          where: { userId, completedAt: { gte: periodStart, lte: periodEnd } },
          _sum: { plannedSeconds: true },
          _count: true,
        }),
        this.prisma.habitOccurrence.aggregate({
          where: { habit: { userId }, occurrenceDate: { gte: periodStart, lte: periodEnd } },
          _count: true,
        }),
        this.prisma.reviewLog.count({
          where: { userId, createdAt: { gte: periodStart, lte: periodEnd } },
        }),
        this.prisma.budgetTransaction.findMany({
          where: { userId, transactionAt: { gte: periodStart, lte: periodEnd }, deletedAt: null },
          select: { amount: true, currency: true },
        }),
        this.prisma.gymWorkout.count({
          where: { userId, startedAt: { gte: periodStart, lte: periodEnd }, deletedAt: null },
        }),
        this.prisma.growthLedgerEntry.aggregate({
          where: { userId, createdAt: { gte: periodStart, lte: periodEnd }, kind: 'ACTIVITY_AWARD' },
          _sum: { amount: true },
        }),
      ]);

    const expenseTotals = new Map<string, (typeof expensesRaw)[number]['amount']>();
    for (const exp of expensesRaw) {
      const current = expenseTotals.get(exp.currency);
      expenseTotals.set(exp.currency, current ? current.add(exp.amount) : exp.amount);
    }

    const habitsCompleted = await this.prisma.habitOccurrence.count({
      where: { habit: { userId }, occurrenceDate: { gte: periodStart, lte: periodEnd }, status: 'COMPLETED' },
    });

    return {
      tasks: { completed: tasksCompleted },
      focus: {
        minutes: Math.round((focusStats._sum?.plannedSeconds ?? 0) / 60),
        sessions: focusStats._count ?? 0,
      },
      habits: {
        completed: habitsCompleted,
        scheduled: habitStats._count ?? 0,
      },
      learning: { reviews: reviewLogsCount },
      expenses: Object.fromEntries(
        [...expenseTotals].map(([currency, amount]) => [currency, amount.toFixed(2)]),
      ),
      workouts: { sessions: workoutsCount },
      growth: { xpEarned: growthLedgerSum._sum.amount ?? 0 },
    };
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
