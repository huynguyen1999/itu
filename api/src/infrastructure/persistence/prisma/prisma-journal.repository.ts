import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
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
import { createUlid } from './ulid';
import { Prisma } from '@prisma/client';
import { formatDateOnly } from '@core/application/utils/calendar';

export function mapEntryToModel(entry: any): JournalEntryModel {
  return {
    id: entry.id,
    userId: entry.userId,
    kind: entry.kind as JournalEntryKind,
    title: entry.title,
    contentMarkdown: entry.contentMarkdown,
    entryDate: entry.entryDate,
    timezone: entry.timezone,
    templateId: entry.templateId,
    version: entry.version,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    deletedAt: entry.deletedAt,
    weeklyReview: entry.weeklyReview
      ? {
          entryId: entry.weeklyReview.entryId,
          periodStart: formatDateOnly(entry.weeklyReview.periodStart),
          periodEnd: formatDateOnly(entry.weeklyReview.periodEnd),
          summarySnapshot: entry.weeklyReview.summarySnapshot as Record<string, unknown>,
          wentWellMarkdown: entry.weeklyReview.wentWellMarkdown,
          frictionMarkdown: entry.weeklyReview.frictionMarkdown,
          nextWeekMarkdown: entry.weeklyReview.nextWeekMarkdown,
          experimentSnapshot: entry.weeklyReview.experimentSnapshot as Record<string, unknown> | null,
        }
      : null,
    tags: (entry.tags || []).map((assignment: any) => ({
      id: assignment.tag.id,
      userId: assignment.tag.userId,
      name: assignment.tag.name,
      color: assignment.tag.color,
      createdAt: assignment.tag.createdAt,
      updatedAt: assignment.tag.updatedAt,
    })),
    attachments: (entry.attachments || []).map((att: any) => ({
      id: att.id,
      userId: att.userId,
      entryId: att.entryId,
      fileName: att.fileName,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      storageKey: att.storageKey,
      url: `/journal/attachments/${att.id}/file`,
      createdAt: att.createdAt,
      deletedAt: att.deletedAt,
    })),
  };
}

@Injectable()
export class PrismaJournalRepository implements IJournalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(userId: string, id: string): Promise<JournalEntryModel | null> {
    const raw = await this.prisma.journalEntry.findFirst({
      where: { id, userId },
      include: {
        weeklyReview: true,
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
            nextWeekMarkdown: data.weeklyReview.nextWeekMarkdown,
            experimentSnapshot: data.weeklyReview.experimentSnapshot as Prisma.InputJsonValue,
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
            nextWeekMarkdown: data.weeklyReview.nextWeekMarkdown,
            experimentSnapshot: data.weeklyReview.experimentSnapshot as Prisma.InputJsonValue,
          },
          update: {
            periodStart: data.weeklyReview.periodStart ?? existing.weeklyReview?.periodStart,
            periodEnd: data.weeklyReview.periodEnd ?? existing.weeklyReview?.periodEnd,
            summarySnapshot: data.weeklyReview.summarySnapshot
              ? ((data.weeklyReview.summarySnapshot as unknown) as Prisma.InputJsonValue)
              : (existing.weeklyReview?.summarySnapshot as any),
            wentWellMarkdown: data.weeklyReview.wentWellMarkdown === undefined ? existing.weeklyReview?.wentWellMarkdown : data.weeklyReview.wentWellMarkdown,
            frictionMarkdown: data.weeklyReview.frictionMarkdown === undefined ? existing.weeklyReview?.frictionMarkdown : data.weeklyReview.frictionMarkdown,
            nextWeekMarkdown: data.weeklyReview.nextWeekMarkdown === undefined ? existing.weeklyReview?.nextWeekMarkdown : data.weeklyReview.nextWeekMarkdown,
            experimentSnapshot: data.weeklyReview.experimentSnapshot === undefined ? (existing.weeklyReview?.experimentSnapshot as any) : (data.weeklyReview.experimentSnapshot as Prisma.InputJsonValue),
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
          tags: { include: { tag: true } },
          attachments: { where: { deletedAt: null } },
        },
      });
      return mapEntryToModel(updatedRaw);
    });
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const res = await this.prisma.journalEntry.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return res.count > 0;
  }

  async restore(userId: string, id: string): Promise<JournalEntryModel | null> {
    const res = await this.prisma.journalEntry.updateMany({
      where: { id, userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (res.count === 0) return null;
    return this.findById(userId, id);
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
      tagIds: snap.tags?.map((t: any) => t.id),
      weeklyReview: snap.weeklyReview
        ? {
            periodStart: new Date(snap.weeklyReview.periodStart),
            periodEnd: new Date(snap.weeklyReview.periodEnd),
            summarySnapshot: snap.weeklyReview.summarySnapshot ?? {},
            wentWellMarkdown: snap.weeklyReview.wentWellMarkdown ?? null,
            frictionMarkdown: snap.weeklyReview.frictionMarkdown ?? null,
            nextWeekMarkdown: snap.weeklyReview.nextWeekMarkdown ?? null,
            experimentSnapshot: snap.weeklyReview.experimentSnapshot ?? null,
          }
        : undefined,
    });
  }
}

@Injectable()
export class PrismaJournalTemplateRepository implements IJournalTemplateRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, includeArchived = false): Promise<JournalTemplateModel[]> {
    const where: any = { userId };
    if (!includeArchived) where.archivedAt = null;
    const templates = await this.prisma.journalTemplate.findMany({
      where,
      orderBy: { createdAt: 'asc' },
    });
    return templates.map((t) => ({
      id: t.id,
      userId: t.userId,
      name: t.name,
      entryKind: t.entryKind as JournalEntryKind,
      titleTemplate: t.titleTemplate,
      bodyMarkdown: t.bodyMarkdown,
      defaults: t.defaults as Record<string, unknown>,
      builtIn: t.builtIn,
      archivedAt: t.archivedAt,
      version: t.version,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  async findById(userId: string, id: string): Promise<JournalTemplateModel | null> {
    const t = await this.prisma.journalTemplate.findFirst({ where: { id, userId } });
    if (!t) return null;
    return {
      id: t.id,
      userId: t.userId,
      name: t.name,
      entryKind: t.entryKind as JournalEntryKind,
      titleTemplate: t.titleTemplate,
      bodyMarkdown: t.bodyMarkdown,
      defaults: t.defaults as Record<string, unknown>,
      builtIn: t.builtIn,
      archivedAt: t.archivedAt,
      version: t.version,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async create(userId: string, data: CreateJournalTemplateData): Promise<JournalTemplateModel> {
    const t = await this.prisma.journalTemplate.create({
      data: {
        id: data.id || createUlid(),
        userId,
        name: data.name,
        entryKind: data.entryKind as any,
        titleTemplate: data.titleTemplate ?? '',
        bodyMarkdown: data.bodyMarkdown ?? '',
        defaults: (data.defaults as Prisma.InputJsonValue) ?? {},
        builtIn: data.builtIn ?? false,
      },
    });
    return {
      id: t.id,
      userId: t.userId,
      name: t.name,
      entryKind: t.entryKind as JournalEntryKind,
      titleTemplate: t.titleTemplate,
      bodyMarkdown: t.bodyMarkdown,
      defaults: t.defaults as Record<string, unknown>,
      builtIn: t.builtIn,
      archivedAt: t.archivedAt,
      version: t.version,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async update(userId: string, id: string, data: UpdateJournalTemplateData): Promise<JournalTemplateModel | null> {
    const existing = await this.prisma.journalTemplate.findFirst({ where: { id, userId } });
    if (!existing) return null;
    const t = await this.prisma.journalTemplate.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        entryKind: (data.entryKind ?? existing.entryKind) as any,
        titleTemplate: data.titleTemplate ?? existing.titleTemplate,
        bodyMarkdown: data.bodyMarkdown ?? existing.bodyMarkdown,
        defaults: data.defaults ? (data.defaults as Prisma.InputJsonValue) : (existing.defaults as any),
        archivedAt: data.archivedAt !== undefined ? data.archivedAt : existing.archivedAt,
        version: existing.version + 1,
      },
    });
    return {
      id: t.id,
      userId: t.userId,
      name: t.name,
      entryKind: t.entryKind as JournalEntryKind,
      titleTemplate: t.titleTemplate,
      bodyMarkdown: t.bodyMarkdown,
      defaults: t.defaults as Record<string, unknown>,
      builtIn: t.builtIn,
      archivedAt: t.archivedAt,
      version: t.version,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const res = await this.prisma.journalTemplate.deleteMany({ where: { id, userId, builtIn: false } });
    return res.count > 0;
  }
}

@Injectable()
export class PrismaJournalTagRepository implements IJournalTagRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<JournalTagModel[]> {
    const tags = await this.prisma.journalTag.findMany({ where: { userId }, orderBy: { name: 'asc' } });
    return tags.map((t) => ({
      id: t.id,
      userId: t.userId,
      name: t.name,
      color: t.color,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  async create(userId: string, name: string, color = 'SLATE'): Promise<JournalTagModel> {
    const t = await this.prisma.journalTag.create({
      data: { id: createUlid(), userId, name, color } as any,
    });
    return {
      id: t.id,
      userId: t.userId,
      name: t.name,
      color: t.color,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  async findOrCreateByName(userId: string, name: string, color = 'SLATE'): Promise<JournalTagModel> {
    const existing = await this.prisma.journalTag.findFirst({ where: { userId, name } });
    if (existing) {
      return {
        id: existing.id,
        userId: existing.userId,
        name: existing.name,
        color: existing.color,
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      };
    }
    return this.create(userId, name, color);
  }
}

@Injectable()
export class PrismaJournalAttachmentRepository implements IJournalAttachmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    userId: string,
    data: { id: string; entryId: string; fileName: string; mimeType: string; sizeBytes: number; storageKey: string },
  ): Promise<JournalAttachmentModel> {
    const created = await this.prisma.journalAttachment.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        userId,
        entryId: data.entryId,
        fileName: data.fileName,
        mimeType: data.mimeType,
        sizeBytes: data.sizeBytes,
        storageKey: data.storageKey,
      },
      update: { entryId: data.entryId, fileName: data.fileName, mimeType: data.mimeType, sizeBytes: data.sizeBytes, storageKey: data.storageKey, deletedAt: null },
    });
    return {
      id: created.id,
      userId: created.userId,
      entryId: created.entryId,
      fileName: created.fileName,
      mimeType: created.mimeType,
      sizeBytes: created.sizeBytes,
      storageKey: created.storageKey,
      url: `/journal/attachments/${created.id}/file`,
      createdAt: created.createdAt,
      deletedAt: created.deletedAt,
    };
  }

  async findById(userId: string, id: string): Promise<JournalAttachmentModel | null> {
    const a = await this.prisma.journalAttachment.findFirst({
      where: { id, userId, deletedAt: null },
    });
    if (!a) return null;
    return {
      id: a.id,
      userId: a.userId,
      entryId: a.entryId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      storageKey: a.storageKey,
      url: `/journal/attachments/${a.id}/file`,
      createdAt: a.createdAt,
      deletedAt: a.deletedAt,
    };
  }

  async listByEntry(userId: string, entryId: string): Promise<JournalAttachmentModel[]> {
    const atts = await this.prisma.journalAttachment.findMany({
      where: { userId, entryId, deletedAt: null },
    });
    return atts.map((a) => ({
      id: a.id,
      userId: a.userId,
      entryId: a.entryId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      storageKey: a.storageKey,
      url: `/journal/attachments/${a.id}/file`,
      createdAt: a.createdAt,
      deletedAt: a.deletedAt,
    }));
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const res = await this.prisma.journalAttachment.updateMany({
      where: { id, userId },
      data: { deletedAt: new Date() },
    });
    return res.count > 0;
  }
}
