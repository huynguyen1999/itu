import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import type {
  ICardUseCase,
  AttachImageCommand,
  CreateCardCommand,
  UpdateCardCommand,
  ImportCardsCommand,
  MoveCardsCommand,
} from '@core/application/ports/in/card-use-case.port';
import type {
  ICardRepository,
  IDeckRepository,
  IReviewStateRepository,
} from '@core/application/ports/out/repositories.port';
import type { IMediaStorage } from '@core/application/ports/out/services.port';
import { CardImageModel, CardModel } from '@core/domain/models';
import { CardType } from '@core/domain/enums';
import { EntityNotFoundException, InvalidCardMoveException, InvalidReviewException } from '@core/domain/exceptions';
import { CursorPage, CursorPageOptions } from '@core/application/ports/pagination.port';

const MAX_IMAGES_PER_CARD = 8;

@Injectable()
export class CardService implements ICardUseCase {
  constructor(
    @Inject(TOKENS.DECK_REPOSITORY) private readonly decks: IDeckRepository,
    @Inject(TOKENS.CARD_REPOSITORY) private readonly cards: ICardRepository,
    @Inject(TOKENS.REVIEW_STATE_REPOSITORY) private readonly reviewStates: IReviewStateRepository,
    @Inject(TOKENS.MEDIA_STORAGE) private readonly media: IMediaStorage,
  ) {}

  async list(userId: string, deckId: string, options?: CursorPageOptions): Promise<CursorPage<CardModel>> {
    await this.ensureDeck(userId, deckId);
    return this.cards.pageByDeck(userId, deckId, options);
  }

  async get(userId: string, cardId: string): Promise<CardModel> {
    const card = await this.cards.findById(userId, cardId);
    if (!card) throw new EntityNotFoundException('Card', cardId);
    return card;
  }

  async create(userId: string, deckId: string, command: CreateCardCommand): Promise<CardModel> {
    await this.ensureDeck(userId, deckId);
    const card = await this.cards.create(userId, deckId, {
      ...command,
      tags: command.tags ?? [],
    });
    await this.reviewStates.createInitialStates(userId, card.id, card.type);
    return card;
  }

  async update(userId: string, cardId: string, command: UpdateCardCommand): Promise<CardModel> {
    const { resetReviewDate, ...cardPatch } = command;
    const card = await this.cards.update(userId, cardId, cardPatch);
    if (!card) throw new EntityNotFoundException('Card', cardId);
    if (resetReviewDate) {
      await this.reviewStates.resetCardDueAt(userId, cardId, new Date());
      return this.get(userId, cardId);
    }
    return card;
  }

  async remove(userId: string, cardId: string): Promise<void> {
    const card = await this.cards.delete(userId, cardId);
    if (!card) throw new EntityNotFoundException('Card', cardId);
    await Promise.all(card.images.map((image) => this.media.delete(image.storageKey)));
  }

  async attachImage(userId: string, command: AttachImageCommand): Promise<CardImageModel> {
    await this.get(userId, command.cardId);
    const imageCount = await this.cards.countImages(userId, command.cardId);
    if (imageCount >= MAX_IMAGES_PER_CARD) {
      throw new InvalidReviewException(`A card can contain at most ${MAX_IMAGES_PER_CARD} images`);
    }

    const stored = await this.media.storeCardImage({
      ...command,
      userId,
      sortOrder: imageCount,
    });
    return this.cards.addImage(userId, command.cardId, { ...stored, side: command.side });
  }

  async removeImage(userId: string, cardId: string, imageId: string): Promise<void> {
    const image = await this.cards.deleteImage(userId, cardId, imageId);
    if (!image) throw new EntityNotFoundException('CardImage', imageId);
    await this.media.delete(image.storageKey);
  }

  async importCards(userId: string, command: ImportCardsCommand): Promise<CardModel[]> {
    const items = command.items.map((item) => {
      let dueAt = new Date();
      if (item.nextReviewDate) {
        const parsed = new Date(item.nextReviewDate);
        if (!isNaN(parsed.getTime())) {
          dueAt = parsed;
        }
      }

      return {
        promptRichText: item.question,
        answerRichText: item.answer,
        type: item.generateReverse ? CardType.REVERSE : CardType.BASIC,
        dueAt,
      };
    });

    return this.cards.importCards(userId, command.deckName, items);
  }

  async move(userId: string, command: MoveCardsCommand): Promise<{ movedCardIds: string[]; targetDeckId: string }> {
    const cardIds = Array.from(new Set(command.cardIds));
    if (cardIds.length === 0) throw new InvalidCardMoveException('Select at least one card to move');
    if (cardIds.length !== command.cardIds.length) {
      throw new InvalidCardMoveException('Card IDs must be unique');
    }

    await this.ensureDeck(userId, command.targetDeckId);
    const cards = await Promise.all(cardIds.map((cardId) => this.cards.findById(userId, cardId)));
    if (cards.some((card) => !card)) {
      throw new InvalidCardMoveException('One or more selected cards were not found');
    }
    if (cards.some((card) => card?.deckId === command.targetDeckId)) {
      throw new InvalidCardMoveException('One or more selected cards are already in that deck');
    }

    const movedCardIds = await this.cards.move(userId, cardIds, command.targetDeckId);
    if (movedCardIds.length !== cardIds.length) {
      throw new InvalidCardMoveException('One or more selected cards could not be moved');
    }
    return { movedCardIds, targetDeckId: command.targetDeckId };
  }

  private async ensureDeck(userId: string, deckId: string): Promise<void> {
    const deck = await this.decks.findById(userId, deckId);
    if (!deck) throw new EntityNotFoundException('Deck', deckId);
  }
}
