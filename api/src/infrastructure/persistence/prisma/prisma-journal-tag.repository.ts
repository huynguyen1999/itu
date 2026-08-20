import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { JournalTagModel } from '@core/domain/journal/journal.types';
import { IJournalTagRepository } from '@core/application/ports/out/journal-repository.port';
import { createUlid } from './ulid';

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
