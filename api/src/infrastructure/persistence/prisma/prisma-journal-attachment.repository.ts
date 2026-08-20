import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JournalAttachmentModel } from '@core/domain/journal/journal.types';
import { IJournalAttachmentRepository } from '@core/application/ports/out/journal-repository.port';

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

