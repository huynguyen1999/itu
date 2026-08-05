import { Injectable } from '@nestjs/common';
import { CardStatus, CardType, ReviewDirection } from '@core/domain/enums';
import { CursorPageOptions } from '@core/application/ports/pagination.port';
import { normalizeCursorOptions, toCursorPage } from '@core/application/pagination/cursor-pagination';
import { ICardRepository, IDeckRepository } from '@core/application/ports/out/repositories.port';
import type {
  AddCardImageData,
  CreateCardData,
  CreateDeckData,
  DeckStudyStatsData,
  UpdateCardData,
  UpdateDeckData,
} from '@core/application/ports/out/repository-types.port';
import { PrismaService } from './prisma.service';
import { mapCard, mapCardImage, mapDeck } from './prisma.mappers';
import { createUlid } from './ulid';
import { InvalidCardMoveException } from '@core/domain/exceptions';

@Injectable()
export class PrismaDeckRepository implements IDeckRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const decks = await this.prisma.deck.findMany({
      where: { userId, archived: false },
      orderBy: { updatedAt: 'desc' },
    });
    return decks.map(mapDeck);
  }

  async page(userId: string, options?: CursorPageOptions) {
    const normalized = normalizeCursorOptions(options);
    const decks = await this.prisma.deck.findMany({
      where: {
        userId,
        archived: false,
        ...(normalized.cursor
          ? {
              OR: [
                { createdAt: { lt: normalized.cursor.createdAt } },
                { createdAt: normalized.cursor.createdAt, id: { lt: normalized.cursor.id } },
              ],
            }
          : {}),
        ...(normalized.q
          ? {
              OR: [
                { title: { contains: normalized.q, mode: 'insensitive' } },
                { description: { contains: normalized.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: normalized.limit + 1,
    });
    const page = toCursorPage(decks.map(mapDeck), normalized.limit, (deck) => deck.createdAt);
    return { ...page, data: [...page.data].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)) };
  }

  async findById(userId: string, deckId: string) {
    const deck = await this.prisma.deck.findFirst({ where: { id: deckId, userId, archived: false } });
    return deck ? mapDeck(deck) : null;
  }

  async create(userId: string, data: CreateDeckData) {
    const deck = await this.prisma.deck.create({ data: { ...data, id: createUlid(), userId } });
    return mapDeck(deck);
  }

  async update(userId: string, deckId: string, data: UpdateDeckData) {
    const found = await this.findById(userId, deckId);
    if (!found) return null;
    const deck = await this.prisma.deck.update({ where: { id: deckId }, data });
    return mapDeck(deck);
  }

  async delete(userId: string, deckId: string) {
    const found = await this.findById(userId, deckId);
    if (!found) return false;
    await this.prisma.deck.update({ where: { id: deckId }, data: { archived: true } });
    return true;
  }

  async restore(userId: string, deckId: string) {
    const deck = await this.prisma.deck.findFirst({ where: { id: deckId, userId, archived: true } });
    if (!deck) return null;
    const restored = await this.prisma.deck.update({
      where: { id: deckId },
      data: { archived: false },
    });
    return mapDeck(restored);
  }
}

@Injectable()
export class PrismaCardRepository implements ICardRepository {
  constructor(private readonly prisma: PrismaService) {}

  async listByDeck(userId: string, deckId: string) {
    const cards = await this.prisma.card.findMany({
      where: { userId, deckId, status: CardStatus.ACTIVE, deck: { archived: false } },
      include: { images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }, reviewStates: true },
      orderBy: { updatedAt: 'desc' },
    });
    return cards.map(mapCard);
  }

  async studyStatsByDeck(userId: string, deckIds: string[], now = new Date()): Promise<DeckStudyStatsData[]> {
    if (deckIds.length === 0) return [];

    const baseWhere = { userId, deckId: { in: deckIds }, status: CardStatus.ACTIVE, deck: { archived: false } };
    const [totals, toReview, newCards, dueCards, reviewedCards, lastStudied] = await Promise.all([
      this.prisma.card.groupBy({
        by: ['deckId'],
        where: baseWhere,
        _count: { _all: true },
      }),
      this.prisma.card.groupBy({
        by: ['deckId'],
        where: { ...baseWhere, reviewStates: { some: { dueAt: { lte: now } } } },
        _count: { _all: true },
      }),
      this.prisma.card.groupBy({
        by: ['deckId'],
        where: { ...baseWhere, reviewStates: { every: { reviewCount: 0 } } },
        _count: { _all: true },
      }),
      this.prisma.card.groupBy({
        by: ['deckId'],
        where: {
          ...baseWhere,
          reviewStates: { some: { dueAt: { lte: now }, reviewCount: { gt: 0 } } },
        },
        _count: { _all: true },
      }),
      this.prisma.card.groupBy({
        by: ['deckId'],
        where: { ...baseWhere, reviewStates: { some: { reviewCount: { gt: 0 } } } },
        _count: { _all: true },
      }),
      this.prisma.studySession.groupBy({
        by: ['deckId'],
        where: { userId, deckId: { in: deckIds }, completedAt: { not: null }, reviewed: { gt: 0 } },
        _max: { completedAt: true },
      }),
    ]);

    const countByDeck = (rows: Array<{ deckId: string; _count: { _all: number } }>) =>
      new Map(rows.map((row) => [row.deckId, row._count._all]));
    const totalByDeck = countByDeck(totals);
    const toReviewByDeck = countByDeck(toReview);
    const newByDeck = countByDeck(newCards);
    const dueByDeck = countByDeck(dueCards);
    const reviewedByDeck = countByDeck(reviewedCards);
    const lastStudiedByDeck = new Map(lastStudied.map((row) => [row.deckId!, row._max.completedAt]));

    return deckIds.map((deckId) => ({
      deckId,
      totalCards: totalByDeck.get(deckId) ?? 0,
      toReviewCount: toReviewByDeck.get(deckId) ?? 0,
      newCount: newByDeck.get(deckId) ?? 0,
      dueCount: dueByDeck.get(deckId) ?? 0,
      reviewedCount: reviewedByDeck.get(deckId) ?? 0,
      lastStudiedAt: lastStudiedByDeck.get(deckId) ?? null,
    }));
  }

  async pageByDeck(userId: string, deckId: string, options?: CursorPageOptions) {
    const normalized = normalizeCursorOptions(options);
    const cards = await this.prisma.card.findMany({
      where: {
        userId,
        deckId,
        status: CardStatus.ACTIVE,
        deck: { archived: false },
        ...(normalized.cursor
          ? {
              OR: [
                { createdAt: { lt: normalized.cursor.createdAt } },
                { createdAt: normalized.cursor.createdAt, id: { lt: normalized.cursor.id } },
              ],
            }
          : {}),
        ...(normalized.q
          ? {
              OR: [
                { promptRichText: { contains: normalized.q, mode: 'insensitive' } },
                { answerRichText: { contains: normalized.q, mode: 'insensitive' } },
                { tags: { has: normalized.q } },
              ],
            }
          : {}),
      },
      include: { images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } }, reviewStates: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: normalized.limit + 1,
    });
    return toCursorPage(cards.map(mapCard), normalized.limit, (card) => card.createdAt);
  }

  async findById(userId: string, cardId: string) {
    const card = await this.prisma.card.findFirst({
      where: { id: cardId, userId, status: CardStatus.ACTIVE, deck: { archived: false } },
      include: { images: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });
    return card ? mapCard(card) : null;
  }

  async create(userId: string, deckId: string, data: CreateCardData) {
    const card = await this.prisma.card.create({
      data: { ...data, id: createUlid(), userId, deckId },
      include: { images: true },
    });
    return mapCard(card);
  }

  async update(userId: string, cardId: string, data: UpdateCardData) {
    const found = await this.findById(userId, cardId);
    if (!found) return null;
    const card = await this.prisma.card.update({ where: { id: cardId }, data, include: { images: true } });
    return mapCard(card);
  }

  async move(userId: string, cardIds: string[], targetDeckId: string) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.card.updateMany({
        where: { userId, id: { in: cardIds }, status: CardStatus.ACTIVE },
        data: { deckId: targetDeckId, version: { increment: 1 } },
      });
      if (result.count !== cardIds.length) {
        throw new InvalidCardMoveException('One or more selected cards could not be moved');
      }
      return cardIds;
    });
  }

  async delete(userId: string, cardId: string) {
    const found = await this.findById(userId, cardId);
    if (!found) return null;
    await this.prisma.card.update({ where: { id: cardId }, data: { status: CardStatus.ARCHIVED } });
    return found;
  }

  countImages(userId: string, cardId: string) {
    return this.prisma.cardImage.count({ where: { userId, cardId, deletedAt: null } });
  }

  async addImage(userId: string, cardId: string, data: AddCardImageData) {
    const image = await this.prisma.cardImage.create({ data: { ...data, id: createUlid(), userId, cardId } });
    return mapCardImage(image);
  }

  async findImage(userId: string, cardId: string, imageId: string) {
    const image = await this.prisma.cardImage.findFirst({ where: { userId, cardId, id: imageId, deletedAt: null } });
    return image ? mapCardImage(image) : null;
  }

  async findImageByStorageKey(userId: string, storageKey: string) {
    const image = await this.prisma.cardImage.findFirst({ where: { userId, storageKey, deletedAt: null } });
    return image ? mapCardImage(image) : null;
  }

  async deleteImage(userId: string, cardId: string, imageId: string) {
    const found = await this.findImage(userId, cardId, imageId);
    if (!found) return null;
    await this.prisma.cardImage.update({ where: { id: imageId }, data: { deletedAt: new Date() } });
    return found;
  }

  async restore(userId: string, cardId: string) {
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

  async restoreImage(userId: string, imageId: string) {
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

  async importCards(
    userId: string,
    deckName: string,
    items: Array<{ promptRichText: string; answerRichText: string; type: CardType; dueAt: Date }>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      let deck = await tx.deck.findFirst({
        where: {
          userId,
          title: deckName,
          archived: false,
        },
      });

      if (!deck) {
        deck = await tx.deck.create({
          data: {
            id: createUlid(),
            userId,
            title: deckName,
            description: `Imported cards on ${new Date().toLocaleDateString()}`,
          },
        });
      }

      const cardsData = items.map((item) => ({
        id: createUlid(),
        userId,
        deckId: deck.id,
        promptRichText: item.promptRichText,
        answerRichText: item.answerRichText,
        type: item.type,
        status: CardStatus.ACTIVE,
        dueAt: item.dueAt,
      }));
      const reviewStatesData = cardsData.flatMap((card) => {
        const states = [
          {
            id: createUlid(),
            userId,
            cardId: card.id,
            direction: ReviewDirection.FRONT_TO_BACK,
            dueAt: card.dueAt,
          },
        ];

        if (card.type === CardType.REVERSE) {
          states.push({
            id: createUlid(),
            userId,
            cardId: card.id,
            direction: ReviewDirection.BACK_TO_FRONT,
            dueAt: card.dueAt,
          });
        }

        return states;
      });

      if (cardsData.length > 0) {
        await tx.card.createMany({
          data: cardsData.map(({ dueAt: _dueAt, ...card }) => card),
        });
      }
      if (reviewStatesData.length > 0) {
        await tx.reviewState.createMany({ data: reviewStatesData });
      }

      const createdCards = await tx.card.findMany({
        where: { id: { in: cardsData.map((card) => card.id) } },
        include: { images: true, reviewStates: true },
      });
      const cardsById = new Map(createdCards.map((card) => [card.id, card]));
      return cardsData.flatMap((card) => {
        const created = cardsById.get(card.id);
        return created ? [mapCard(created)] : [];
      });
    });
  }
}
