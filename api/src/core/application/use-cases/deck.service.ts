import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import type {
  IDeckUseCase,
  CreateDeckCommand,
  DeckListItem,
  UpdateDeckCommand,
} from '@core/application/ports/in/deck-use-case.port';
import type { ICardRepository, IDeckRepository } from '@core/application/ports/out/repositories.port';
import { DeckModel } from '@core/domain/models';
import { EntityNotFoundException, ProtectedDefaultDeckException } from '@core/domain/exceptions';
import { CursorPage, CursorPageOptions } from '@core/application/ports/pagination.port';

@Injectable()
export class DeckService implements IDeckUseCase {
  constructor(
    @Inject(TOKENS.DECK_REPOSITORY) private readonly decks: IDeckRepository,
    @Inject(TOKENS.CARD_REPOSITORY) private readonly cards: ICardRepository,
  ) {}

  async list(userId: string, options?: CursorPageOptions): Promise<CursorPage<DeckListItem>> {
    const page = await this.decks.page(userId, options);
    if (page.data.length === 0) return { ...page, data: [] };

    const stats = await this.cards.studyStatsByDeck(
      userId,
      page.data.map((deck) => deck.id),
    );
    const statsByDeck = new Map(stats.map((item) => [item.deckId, item]));

    return {
      ...page,
      data: page.data.map((deck) => {
        const deckStats = statsByDeck.get(deck.id);
        return {
          ...deck,
          studyStats: {
            totalCards: deckStats?.totalCards ?? 0,
            toReviewCount: deckStats?.toReviewCount ?? 0,
            newCount: deckStats?.newCount ?? 0,
            dueCount: deckStats?.dueCount ?? 0,
            reviewedCount: deckStats?.reviewedCount ?? 0,
            lastStudiedAt: deckStats?.lastStudiedAt ?? null,
          },
        };
      }),
    };
  }

  async get(userId: string, deckId: string): Promise<DeckModel> {
    const deck = await this.decks.findById(userId, deckId);
    if (!deck) throw new EntityNotFoundException('Deck', deckId);
    return deck;
  }

  create(userId: string, command: CreateDeckCommand): Promise<DeckModel> {
    return this.decks.create(userId, command);
  }

  async update(userId: string, deckId: string, command: UpdateDeckCommand): Promise<DeckModel> {
    const current = await this.decks.findById(userId, deckId);
    if (!current) throw new EntityNotFoundException('Deck', deckId);
    if (current.isDefault && command.archived) throw new ProtectedDefaultDeckException();
    const deck = await this.decks.update(userId, deckId, command);
    if (!deck) throw new EntityNotFoundException('Deck', deckId);
    return deck;
  }

  async remove(userId: string, deckId: string): Promise<void> {
    const current = await this.decks.findById(userId, deckId);
    if (!current) throw new EntityNotFoundException('Deck', deckId);
    if (current.isDefault) throw new ProtectedDefaultDeckException();
    const deleted = await this.decks.delete(userId, deckId);
    if (!deleted) throw new EntityNotFoundException('Deck', deckId);
  }
}
