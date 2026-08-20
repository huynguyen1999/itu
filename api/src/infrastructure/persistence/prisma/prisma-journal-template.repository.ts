import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JournalEntryKind } from '@core/domain/enums';
import { JournalTemplateModel } from '@core/domain/journal/journal.types';
import { CreateJournalTemplateData, IJournalTemplateRepository, UpdateJournalTemplateData } from '@core/application/ports/out/journal-repository.port';
import { createUlid } from './ulid';
import { Prisma } from '@prisma/client';

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
