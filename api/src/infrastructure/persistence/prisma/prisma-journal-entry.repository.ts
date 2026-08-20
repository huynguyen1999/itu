import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JournalAttachmentModel, JournalEntryModel, JournalEntryRevisionModel } from '@core/domain/journal/journal.types';
import { CreateJournalEntryData, IJournalAutomationUserQuery, IJournalRepository, JournalSearchFilter, UpdateJournalEntryData } from '@core/application/ports/out/journal-repository.port';
import { createUlid } from './ulid';
import { Prisma } from '@prisma/client';
import { recordSyncChange } from './prisma-sync-mutation.shared';
import { mapEntryToModel } from './prisma-journal.mapper';

@Injectable()
export class PrismaJournalRepository implements IJournalRepository, IJournalAutomationUserQuery {
  constructor(private readonly prisma: PrismaService) {}

  async findTimezone(userId: string): Promise<string | null> {
    const entry = await this.prisma.journalEntry.findFirst({
      where: {
        userId,
        deletedAt: null,
        OR: [{ contextType: null }, { contextType: { not: 'AUTO_GENERATED_REVIEW' } }],
      },
      orderBy: { updatedAt: 'desc' },
      select: { timezone: true },
    });
    return entry?.timezone ?? null;
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        journalEntries: {
          where: {
            deletedAt: null,
            OR: [{ contextType: null }, { contextType: { not: 'AUTO_GENERATED_REVIEW' } }],
          },
          orderBy: { updatedAt: 'desc' },
          take: 1,
          select: { timezone: true },
        },
      },
    });
    return users.map((user) => ({ userId: user.id, timezone: user.journalEntries[0]?.timezone ?? null }));
  }

  async findById(userId: string, id: string): Promise<JournalEntryModel | null> {
    const raw = await this.prisma.journalEntry.findFirst({
      where: { id, userId, deletedAt: null },
      include: {
        weeklyReview: true,
        dailyReview: true,
        tags: { include: { tag: true } },
        attachments: { where: { deletedAt: null } },
      },
    });
    return raw ? mapEntryToModel(raw) : null;
  }

  async list(userId: string, filter?: JournalSearchFilter): Promise<JournalEntryModel[]> {
    const where: any = { userId, ...(filter?.includeDeleted ? {} : { deletedAt: null }) };
    if (filter?.kind) where.kind = filter.kind;
    if (filter?.tagId) where.tags = { some: { tagId: filter.tagId } };
    if (filter?.contextType) where.contextType = filter.contextType;
    if (filter?.contextId) where.contextId = filter.contextId;
    if (filter?.startDate || filter?.endDate) {
      where.entryDate = {};
      if (filter.startDate) where.entryDate.gte = filter.startDate;
      if (filter.endDate) where.entryDate.lte = filter.endDate;
    }
    if (filter?.query) {
      where.OR = [
        { title: { contains: filter.query, mode: 'insensitive' } },
        { contentMarkdown: { contains: filter.query, mode: 'insensitive' } },
        { attachments: { some: { fileName: { contains: filter.query, mode: 'insensitive' } } } },
      ];
    }

    const entries = await this.prisma.journalEntry.findMany({
      where,
      orderBy: { entryDate: 'desc' },
      include: {
        weeklyReview: true,
        dailyReview: true,
        tags: { include: { tag: true } },
        attachments: { where: { deletedAt: null } },
      },
    });
    return entries.map((entry) => mapEntryToModel(entry));
  }

  async create(
    userId: string,
    data: CreateJournalEntryData,
    mutationMeta?: { deviceId?: string; mutationId?: string },
  ): Promise<JournalEntryModel> {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.create({
        data: {
          id: data.id,
          userId,
          kind: data.kind as any,
          title: data.title,
          contentMarkdown: data.contentMarkdown ?? '',
          entryDate: data.entryDate,
          timezone: data.timezone ?? 'UTC',
          templateId: data.templateId ?? null,
          contextType: data.contextType ?? null,
          contextId: data.contextId ?? null,
          contextData: data.contextData as Prisma.InputJsonValue | undefined,
          version: 1,
        },
      });

      if (data.weeklyReview) {
        await tx.journalWeeklyReview.create({
          data: {
            entryId: entry.id,
            periodStart: data.weeklyReview.periodStart,
            periodEnd: data.weeklyReview.periodEnd,
            summarySnapshot: (data.weeklyReview.summarySnapshot as unknown) as Prisma.InputJsonValue,
            wentWellMarkdown: data.weeklyReview.wentWellMarkdown,
            frictionMarkdown: data.weeklyReview.frictionMarkdown,
            learnedMarkdown: data.weeklyReview.learnedMarkdown,
            differentFromLastWeekMarkdown: data.weeklyReview.differentFromLastWeekMarkdown,
            nextWeekMarkdown: data.weeklyReview.nextWeekMarkdown,
            experimentSnapshot: data.weeklyReview.experimentSnapshot as Prisma.InputJsonValue,
            comparisonSnapshot: data.weeklyReview.comparisonSnapshot as Prisma.InputJsonValue,
            aiInsightsSnapshot: data.weeklyReview.aiInsightsSnapshot as Prisma.InputJsonValue,
            aiGenerationJobId: data.weeklyReview.aiGenerationJobId,
            aiGeneratedAt: data.weeklyReview.aiGeneratedAt,
            aiPromptVersion: data.weeklyReview.aiPromptVersion,
            aiSourceEntryVersion: data.weeklyReview.aiSourceEntryVersion,
          },
        });
      }

      if (data.dailyReview) {
        await tx.journalDailyReview.create({
          data: {
            entryId: entry.id,
            periodDate: data.dailyReview.periodDate,
            summarySnapshot: data.dailyReview.summarySnapshot as Prisma.InputJsonValue,
            wentWellMarkdown: data.dailyReview.wentWellMarkdown,
            frictionMarkdown: data.dailyReview.frictionMarkdown,
            learnedMarkdown: data.dailyReview.learnedMarkdown,
            contextMarkdown: data.dailyReview.contextMarkdown,
            aiInsightsSnapshot: data.dailyReview.aiInsightsSnapshot as Prisma.InputJsonValue,
            aiGenerationJobId: data.dailyReview.aiGenerationJobId,
            aiGeneratedAt: data.dailyReview.aiGeneratedAt,
            aiPromptVersion: data.dailyReview.aiPromptVersion,
            aiSourceEntryVersion: data.dailyReview.aiSourceEntryVersion,
          },
        });
      }

      if (data.tagIds && data.tagIds.length > 0) {
        await tx.journalTagAssignment.createMany({
          data: data.tagIds.map((tagId) => ({ entryId: entry.id, tagId })),
        });
      }

      const fullCreated = await tx.journalEntry.findUniqueOrThrow({
        where: { id: entry.id },
        include: {
          weeklyReview: true,
          dailyReview: true,
          tags: { include: { tag: true } },
          attachments: { where: { deletedAt: null } },
        },
      });
      const snapshot = mapEntryToModel(fullCreated);

      await tx.journalEntryRevision.create({
        data: {
          id: entry.id + '_rev_1',
          entryId: entry.id,
          revisionNumber: 1,
          snapshot: JSON.parse(JSON.stringify(snapshot)),
          deviceId: mutationMeta?.deviceId,
          mutationId: mutationMeta?.mutationId,
        },
      });

      return snapshot;
    });
  }

  async update(
    userId: string,
    id: string,
    data: UpdateJournalEntryData,
    mutationMeta?: { deviceId?: string; mutationId?: string },
  ): Promise<JournalEntryModel | null> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.journalEntry.findFirst({
        where: { id, userId, deletedAt: null },
        include: {
          weeklyReview: true,
          dailyReview: true,
          tags: { include: { tag: true } },
          attachments: { where: { deletedAt: null } },
        },
      });
      if (!existing) return null;

      const revCount = await tx.journalEntryRevision.count({ where: { entryId: id } });
      const currentModel = mapEntryToModel(existing);
      await tx.journalEntryRevision.create({
        data: {
          id: `${id}_rev_${revCount + 1}`,
          entryId: id,
          revisionNumber: revCount + 1,
          snapshot: JSON.parse(JSON.stringify(currentModel)),
          deviceId: mutationMeta?.deviceId,
          mutationId: mutationMeta?.mutationId,
        },
      });

      await tx.journalEntry.update({
        where: { id },
        data: {
          title: data.title ?? existing.title,
          contentMarkdown: data.contentMarkdown ?? existing.contentMarkdown,
          entryDate: data.entryDate ?? existing.entryDate,
          timezone: data.timezone ?? existing.timezone,
          templateId: data.templateId !== undefined ? data.templateId : existing.templateId,
          contextType: data.contextType !== undefined ? data.contextType : existing.contextType,
          contextId: data.contextId !== undefined ? data.contextId : existing.contextId,
          contextData: data.contextData !== undefined
            ? data.contextData === null ? Prisma.JsonNull : data.contextData as Prisma.InputJsonValue
            : existing.contextData === null ? Prisma.JsonNull : existing.contextData as Prisma.InputJsonValue,
          version: existing.version + 1,
        },
      });

      if (data.weeklyReview) {
        await tx.journalWeeklyReview.upsert({
          where: { entryId: id },
          create: {
            entryId: id,
            periodStart: data.weeklyReview.periodStart!,
            periodEnd: data.weeklyReview.periodEnd!,
            summarySnapshot: data.weeklyReview.summarySnapshot as Prisma.InputJsonValue,
            wentWellMarkdown: data.weeklyReview.wentWellMarkdown,
            frictionMarkdown: data.weeklyReview.frictionMarkdown,
            learnedMarkdown: data.weeklyReview.learnedMarkdown,
            differentFromLastWeekMarkdown: data.weeklyReview.differentFromLastWeekMarkdown,
            nextWeekMarkdown: data.weeklyReview.nextWeekMarkdown,
            experimentSnapshot: data.weeklyReview.experimentSnapshot as Prisma.InputJsonValue,
            comparisonSnapshot: data.weeklyReview.comparisonSnapshot as Prisma.InputJsonValue,
            aiInsightsSnapshot: data.weeklyReview.aiInsightsSnapshot as Prisma.InputJsonValue,
            aiGenerationJobId: data.weeklyReview.aiGenerationJobId,
            aiGeneratedAt: data.weeklyReview.aiGeneratedAt,
            aiPromptVersion: data.weeklyReview.aiPromptVersion,
            aiSourceEntryVersion: data.weeklyReview.aiSourceEntryVersion,
          },
          update: {
            periodStart: data.weeklyReview.periodStart ?? existing.weeklyReview?.periodStart,
            periodEnd: data.weeklyReview.periodEnd ?? existing.weeklyReview?.periodEnd,
            summarySnapshot: data.weeklyReview.summarySnapshot
              ? ((data.weeklyReview.summarySnapshot as unknown) as Prisma.InputJsonValue)
              : (existing.weeklyReview?.summarySnapshot as any),
            wentWellMarkdown: data.weeklyReview.wentWellMarkdown === undefined ? existing.weeklyReview?.wentWellMarkdown : data.weeklyReview.wentWellMarkdown,
            frictionMarkdown: data.weeklyReview.frictionMarkdown === undefined ? existing.weeklyReview?.frictionMarkdown : data.weeklyReview.frictionMarkdown,
            learnedMarkdown: data.weeklyReview.learnedMarkdown === undefined ? existing.weeklyReview?.learnedMarkdown : data.weeklyReview.learnedMarkdown,
            differentFromLastWeekMarkdown: data.weeklyReview.differentFromLastWeekMarkdown === undefined ? existing.weeklyReview?.differentFromLastWeekMarkdown : data.weeklyReview.differentFromLastWeekMarkdown,
            nextWeekMarkdown: data.weeklyReview.nextWeekMarkdown === undefined ? existing.weeklyReview?.nextWeekMarkdown : data.weeklyReview.nextWeekMarkdown,
            experimentSnapshot: data.weeklyReview.experimentSnapshot === undefined ? (existing.weeklyReview?.experimentSnapshot as any) : (data.weeklyReview.experimentSnapshot as Prisma.InputJsonValue),
            comparisonSnapshot: data.weeklyReview.comparisonSnapshot === undefined ? (existing.weeklyReview?.comparisonSnapshot as any) : (data.weeklyReview.comparisonSnapshot as Prisma.InputJsonValue),
            aiInsightsSnapshot: data.weeklyReview.aiInsightsSnapshot === undefined ? (existing.weeklyReview?.aiInsightsSnapshot as any) : (data.weeklyReview.aiInsightsSnapshot as Prisma.InputJsonValue),
            aiGenerationJobId: data.weeklyReview.aiGenerationJobId === undefined ? existing.weeklyReview?.aiGenerationJobId : data.weeklyReview.aiGenerationJobId,
            aiGeneratedAt: data.weeklyReview.aiGeneratedAt === undefined ? existing.weeklyReview?.aiGeneratedAt : data.weeklyReview.aiGeneratedAt,
            aiPromptVersion: data.weeklyReview.aiPromptVersion === undefined ? existing.weeklyReview?.aiPromptVersion : data.weeklyReview.aiPromptVersion,
            aiSourceEntryVersion: data.weeklyReview.aiSourceEntryVersion === undefined ? existing.weeklyReview?.aiSourceEntryVersion : data.weeklyReview.aiSourceEntryVersion,
          },
        });
      }

      if (data.dailyReview) {
        await tx.journalDailyReview.upsert({
          where: { entryId: id },
          create: {
            entryId: id,
            periodDate: data.dailyReview.periodDate ?? existing.dailyReview?.periodDate ?? existing.entryDate,
            summarySnapshot: (data.dailyReview.summarySnapshot ?? {}) as Prisma.InputJsonValue,
            wentWellMarkdown: data.dailyReview.wentWellMarkdown,
            frictionMarkdown: data.dailyReview.frictionMarkdown,
            learnedMarkdown: data.dailyReview.learnedMarkdown,
            contextMarkdown: data.dailyReview.contextMarkdown,
            aiInsightsSnapshot: data.dailyReview.aiInsightsSnapshot as Prisma.InputJsonValue,
            aiGenerationJobId: data.dailyReview.aiGenerationJobId,
            aiGeneratedAt: data.dailyReview.aiGeneratedAt,
            aiPromptVersion: data.dailyReview.aiPromptVersion,
            aiSourceEntryVersion: data.dailyReview.aiSourceEntryVersion,
          },
          update: {
            periodDate: data.dailyReview.periodDate,
            summarySnapshot: data.dailyReview.summarySnapshot === undefined ? undefined : (data.dailyReview.summarySnapshot as Prisma.InputJsonValue),
            wentWellMarkdown: data.dailyReview.wentWellMarkdown,
            frictionMarkdown: data.dailyReview.frictionMarkdown,
            learnedMarkdown: data.dailyReview.learnedMarkdown,
            contextMarkdown: data.dailyReview.contextMarkdown,
            aiInsightsSnapshot: data.dailyReview.aiInsightsSnapshot === undefined ? undefined : (data.dailyReview.aiInsightsSnapshot as Prisma.InputJsonValue),
            aiGenerationJobId: data.dailyReview.aiGenerationJobId,
            aiGeneratedAt: data.dailyReview.aiGeneratedAt,
            aiPromptVersion: data.dailyReview.aiPromptVersion,
            aiSourceEntryVersion: data.dailyReview.aiSourceEntryVersion,
          },
        });
      }

      if (data.tagIds !== undefined) {
        await tx.journalTagAssignment.deleteMany({ where: { entryId: id } });
        if (data.tagIds.length > 0) {
          await tx.journalTagAssignment.createMany({
            data: data.tagIds.map((tagId) => ({ entryId: id, tagId })),
          });
        }
      }

      const updatedRaw = await tx.journalEntry.findUniqueOrThrow({
        where: { id },
        include: {
          weeklyReview: true,
          dailyReview: true,
          tags: { include: { tag: true } },
          attachments: { where: { deletedAt: null } },
        },
      });
      return mapEntryToModel(updatedRaw);
    });
  }

  async softDelete(userId: string, id: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.journalEntry.updateMany({
        where: { id, userId, deletedAt: null },
        data: { deletedAt: new Date(), version: { increment: 1 } },
      });
      if (!res.count) return false;
      await recordSyncChange(tx, userId, 'journalentry', id, 'DELETE', { id });
      return true;
    });
  }

  async delete(userId: string, id: string): Promise<boolean> {
    return this.softDelete(userId, id);
  }

  async restore(userId: string, id: string): Promise<JournalEntryModel | null> {
    return this.prisma.$transaction(async (tx) => {
      const res = await tx.journalEntry.updateMany({
        where: { id, userId, deletedAt: { not: null } },
        data: { deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } },
      });
      if (!res.count) return null;
      const restored = await tx.journalEntry.findUniqueOrThrow({ where: { id }, include: { weeklyReview: true, dailyReview: true, tags: { include: { tag: true } }, attachments: { where: { deletedAt: null } } } });
      await recordSyncChange(tx, userId, 'journalentry', id, 'UPSERT', restored);
      return mapEntryToModel(restored);
    });
  }

  async saveReviewAiInsights(
    userId: string,
    entryId: string,
    sourceEntryVersion: number,
    generationId: string | null,
    summarySnapshot: Record<string, unknown>,
    comparisonSnapshot: Record<string, unknown> | undefined,
    insightsSnapshot: Record<string, unknown>,
  ): Promise<JournalEntryModel | null> {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.journalEntry.findFirst({
        where: { id: entryId, userId, deletedAt: null, version: sourceEntryVersion },
        include: { weeklyReview: true, dailyReview: true },
      });
      if (!current || (current.kind !== 'DAILY_REVIEW' && current.kind !== 'WEEKLY_REVIEW')) return null;

      const aiFields = {
        summarySnapshot: summarySnapshot as Prisma.InputJsonValue,
        ...(current.kind === 'WEEKLY_REVIEW' && comparisonSnapshot
          ? { comparisonSnapshot: comparisonSnapshot as Prisma.InputJsonValue }
          : {}),
        aiInsightsSnapshot: insightsSnapshot as Prisma.InputJsonValue,
        aiGenerationJobId: generationId,
        aiGeneratedAt: new Date(),
        aiPromptVersion: 'review-insights-v1',
        aiSourceEntryVersion: sourceEntryVersion,
      };
      if (current.kind === 'DAILY_REVIEW') {
        await tx.journalDailyReview.update({ where: { entryId }, data: aiFields });
      } else {
        await tx.journalWeeklyReview.update({ where: { entryId }, data: aiFields });
      }

      const updated = await tx.journalEntry.findUniqueOrThrow({
        where: { id: entryId },
        include: {
          weeklyReview: true,
          dailyReview: true,
          tags: { include: { tag: true } },
          attachments: { where: { deletedAt: null } },
        },
      });
      const model = mapEntryToModel(updated);
      const revisionNumber = (await tx.journalEntryRevision.count({ where: { entryId } })) + 1;
      await tx.journalEntryRevision.create({
        data: {
          id: `${entryId}_rev_${revisionNumber}`,
          entryId,
          revisionNumber,
          snapshot: JSON.parse(JSON.stringify(model)),
          mutationId: generationId ? `ai-job:${generationId}` : `ai-direct:${entryId}`,
        },
      });
      await recordSyncChange(tx, userId, 'journalentry', entryId, 'UPSERT', updated);
      return model;
    });
  }

  async hardDelete(userId: string, id: string): Promise<JournalAttachmentModel[] | null> {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findFirst({
        where: { id, userId, deletedAt: { not: null } },
        include: { attachments: true },
      });
      if (!entry) return null;
      const attachments = entry.attachments.map((attachment) => ({
        id: attachment.id,
        userId: attachment.userId,
        entryId: attachment.entryId,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        storageKey: attachment.storageKey,
        url: `/journal/attachments/${attachment.id}/file`,
        createdAt: attachment.createdAt,
        deletedAt: attachment.deletedAt,
      }));
      await tx.journalEntry.delete({ where: { id } });
      return attachments;
    });
  }

  async listRevisions(userId: string, entryId: string): Promise<JournalEntryRevisionModel[]> {
    const entry = await this.prisma.journalEntry.findFirst({ where: { id: entryId, userId } });
    if (!entry) return [];
    const revs = await this.prisma.journalEntryRevision.findMany({
      where: { entryId },
      orderBy: { revisionNumber: 'desc' },
    });
    return revs.map((r) => ({
      id: r.id,
      entryId: r.entryId,
      revisionNumber: r.revisionNumber,
      snapshot: r.snapshot as Record<string, unknown>,
      mutationId: r.mutationId,
      deviceId: r.deviceId,
      createdAt: r.createdAt,
    }));
  }

  async restoreRevision(userId: string, entryId: string, revisionId: string): Promise<JournalEntryModel | null> {
    const revision = await this.prisma.journalEntryRevision.findFirst({
      where: { id: revisionId, entryId, entry: { userId } },
    });
    if (!revision) return null;
    const snap = revision.snapshot as any;
    return this.update(userId, entryId, {
      title: snap.title,
      contentMarkdown: snap.contentMarkdown,
      entryDate: new Date(snap.entryDate),
      timezone: snap.timezone,
      templateId: snap.templateId,
      contextType: snap.contextType,
      contextId: snap.contextId,
      contextData: snap.contextData,
      tagIds: snap.tags?.map((t: any) => t.id),
      weeklyReview: snap.weeklyReview
        ? {
            periodStart: new Date(snap.weeklyReview.periodStart),
            periodEnd: new Date(snap.weeklyReview.periodEnd),
            summarySnapshot: snap.weeklyReview.summarySnapshot ?? {},
            wentWellMarkdown: snap.weeklyReview.wentWellMarkdown ?? null,
            frictionMarkdown: snap.weeklyReview.frictionMarkdown ?? null,
            learnedMarkdown: snap.weeklyReview.learnedMarkdown ?? null,
            differentFromLastWeekMarkdown: snap.weeklyReview.differentFromLastWeekMarkdown ?? null,
            nextWeekMarkdown: snap.weeklyReview.nextWeekMarkdown ?? null,
            experimentSnapshot: snap.weeklyReview.experimentSnapshot ?? null,
            comparisonSnapshot: snap.weeklyReview.comparisonSnapshot ?? null,
            aiInsightsSnapshot: snap.weeklyReview.aiInsightsSnapshot ?? null,
            aiGenerationJobId: snap.weeklyReview.aiGenerationJobId ?? null,
            aiGeneratedAt: snap.weeklyReview.aiGeneratedAt ? new Date(snap.weeklyReview.aiGeneratedAt) : null,
            aiPromptVersion: snap.weeklyReview.aiPromptVersion ?? null,
            aiSourceEntryVersion: snap.weeklyReview.aiSourceEntryVersion ?? null,
          }
        : undefined,
      dailyReview: snap.dailyReview
        ? {
            periodDate: new Date(snap.dailyReview.periodDate),
            summarySnapshot: snap.dailyReview.summarySnapshot ?? {},
            wentWellMarkdown: snap.dailyReview.wentWellMarkdown ?? null,
            frictionMarkdown: snap.dailyReview.frictionMarkdown ?? null,
            learnedMarkdown: snap.dailyReview.learnedMarkdown ?? null,
            contextMarkdown: snap.dailyReview.contextMarkdown ?? null,
            aiInsightsSnapshot: snap.dailyReview.aiInsightsSnapshot ?? null,
            aiGenerationJobId: snap.dailyReview.aiGenerationJobId ?? null,
            aiGeneratedAt: snap.dailyReview.aiGeneratedAt ? new Date(snap.dailyReview.aiGeneratedAt) : null,
            aiPromptVersion: snap.dailyReview.aiPromptVersion ?? null,
            aiSourceEntryVersion: snap.dailyReview.aiSourceEntryVersion ?? null,
          }
        : undefined,
    });
  }
}
