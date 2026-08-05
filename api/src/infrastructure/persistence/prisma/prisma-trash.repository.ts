import { Injectable } from '@nestjs/common';
import { CardStatus, DeckColor, DeckIcon } from '@core/domain/enums';
import { ITrashRepository } from '@core/application/ports/out/repositories.port';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { mapCard, mapCardImage, mapDeck } from './prisma.mappers';
import { createUlid } from './ulid';

const RECOVERED_CARDS_DECK_TITLE = 'Recovered Cards';
const RECOVERED_CARDS_DECK_DESCRIPTION = 'Cards preserved after their original deck was permanently deleted.';

async function findOrCreateRecoveredCardsDeck(tx: Prisma.TransactionClient, userId: string): Promise<{ id: string }> {
  const existing = await tx.deck.findFirst({
    where: { userId, title: RECOVERED_CARDS_DECK_TITLE, archived: false },
    select: { id: true },
  });
  if (existing) return existing;

  return tx.deck.create({
    data: {
      id: createUlid(),
      userId,
      title: RECOVERED_CARDS_DECK_TITLE,
      description: RECOVERED_CARDS_DECK_DESCRIPTION,
    },
    select: { id: true },
  });
}

@Injectable()
export class PrismaTrashRepository implements ITrashRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const [decks, cards, cardImages, tasks] = await Promise.all([
      this.prisma.deck.findMany({
        where: { userId, archived: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.card.findMany({
        where: { userId, status: CardStatus.ARCHIVED, deck: { archived: false } },
        include: { images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }, reviewStates: true },
        orderBy: { updatedAt: 'desc' },
      }),
      this.prisma.cardImage.findMany({
        where: { userId, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      }),
      this.prisma.task.findMany({
        where: { userId, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
      }),
    ]);
    return {
      decks: decks.map(mapDeck),
      cards: cards.map(mapCard),
      cardImages: cardImages.map(mapCardImage),
      tasks,
    };
  }

  async restoreDeck(userId: string, deckId: string) {
    const deck = await this.prisma.deck.findFirst({ where: { id: deckId, userId, archived: true } });
    if (!deck) return null;
    const restored = await this.prisma.deck.update({
      where: { id: deckId },
      data: { archived: false },
    });
    return mapDeck(restored);
  }

  async restoreCard(userId: string, cardId: string) {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, userId, status: CardStatus.ARCHIVED, deck: { archived: false } },
    });
    if (!card) return null;
    const restored = await this.prisma.card.update({
      where: { id: cardId },
      data: { status: CardStatus.ACTIVE },
      include: { images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }, reviewStates: true },
    });
    return mapCard(restored);
  }

  async restoreCardImage(userId: string, imageId: string) {
    const image = await this.prisma.cardImage.findFirst({
      where: {
        id: imageId,
        userId,
        deletedAt: { not: null },
        card: { status: CardStatus.ACTIVE, deck: { archived: false } },
      },
    });
    if (!image) return null;
    const restored = await this.prisma.cardImage.update({ where: { id: imageId }, data: { deletedAt: null } });
    return mapCardImage(restored);
  }

  async deleteDeck(userId: string, deckId: string) {
    return this.prisma.$transaction(async (tx) => {
      const deck = await tx.deck.findFirst({ where: { id: deckId, userId, archived: true, isDefault: false } });
      if (!deck) return null;
      const recoveryDeck = await findOrCreateRecoveredCardsDeck(tx, userId);
      await tx.card.updateMany({ where: { userId, deckId }, data: { deckId: recoveryDeck.id } });
      await tx.deck.delete({ where: { id: deckId } });
      return [];
    });
  }

  async deleteCard(userId: string, cardId: string) {
    return this.prisma.$transaction(async (tx) => {
      const card = await tx.card.findFirst({ where: { id: cardId, userId, status: CardStatus.ARCHIVED } });
      if (!card) return null;
      const images = await tx.cardImage.findMany({ where: { userId, cardId } });
      await tx.card.delete({ where: { id: cardId } });
      return images.map(mapCardImage);
    });
  }

  async deleteCardImage(userId: string, imageId: string) {
    const image = await this.prisma.cardImage.findFirst({ where: { id: imageId, userId, deletedAt: { not: null } } });
    if (!image) return null;
    await this.prisma.cardImage.delete({ where: { id: imageId } });
    return mapCardImage(image);
  }

  async restoreTask(userId: string, taskId: string): Promise<boolean> {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, userId, deletedAt: { not: null } } });
    if (!task) return false;
    await this.prisma.task.update({ where: { id: taskId }, data: { deletedAt: null } });
    return true;
  }

  async deleteTask(userId: string, taskId: string): Promise<boolean> {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, userId, deletedAt: { not: null } } });
    if (!task) return false;
    await this.prisma.task.delete({ where: { id: taskId } });
    return true;
  }

  async purgeExpired(cutoff: Date) {
    const images = await this.prisma.cardImage.findMany({
      where: {
        OR: [{ deletedAt: { lt: cutoff } }, { card: { status: CardStatus.ARCHIVED, updatedAt: { lt: cutoff } } }],
      },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.cardImage.deleteMany({ where: { deletedAt: { lt: cutoff } } });
      await tx.card.deleteMany({ where: { status: CardStatus.ARCHIVED, updatedAt: { lt: cutoff } } });
      await tx.task.deleteMany({ where: { deletedAt: { lt: cutoff } } });
      const expiredDecks = await tx.deck.findMany({
        where: { archived: true, isDefault: false, updatedAt: { lt: cutoff } },
        select: { id: true, userId: true },
      });
      const deckIdsByUserId = new Map<string, string[]>();
      for (const deck of expiredDecks) {
        deckIdsByUserId.set(deck.userId, [...(deckIdsByUserId.get(deck.userId) ?? []), deck.id]);
      }
      for (const [userId, deckIds] of deckIdsByUserId) {
        const recoveryDeck = await findOrCreateRecoveredCardsDeck(tx, userId);
        await tx.card.updateMany({ where: { userId, deckId: { in: deckIds } }, data: { deckId: recoveryDeck.id } });
      }
      if (expiredDecks.length > 0) {
        await tx.deck.deleteMany({ where: { id: { in: expiredDecks.map((deck) => deck.id) } } });
      }
    });
    return images.map(mapCardImage);
  }
}
