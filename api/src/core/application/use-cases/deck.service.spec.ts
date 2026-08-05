import type { ICardRepository, IDeckRepository } from '@core/application/ports/out/repositories.port';
import type { DeckModel } from '@core/domain/models';
import { DeckColor, DeckIcon } from '@core/domain/enums';
import { ProtectedDefaultDeckException } from '@core/domain/exceptions';
import { DeckService } from './deck.service';

const deck: DeckModel = {
  id: 'deck-1',
  userId: 'user-1',
  title: 'Biology',
  description: null,
  icon: DeckIcon.BOOK,
  color: DeckColor.TEAL,
  isDefault: false,
  archived: false,
  createdAt: new Date('2026-07-10T00:00:00.000Z'),
  updatedAt: new Date('2026-07-10T00:00:00.000Z'),
};

describe('DeckService', () => {
  it('adds card study stats to paginated decks', async () => {
    const decks = {
      page: jest.fn().mockResolvedValue({
        data: [deck],
        meta: { nextCursor: null, hasNextPage: false },
      }),
    };
    const cards = {
      studyStatsByDeck: jest.fn().mockResolvedValue([
        {
          deckId: deck.id,
          totalCards: 12,
          toReviewCount: 5,
          newCount: 2,
          dueCount: 3,
          reviewedCount: 10,
        },
      ]),
    };
    const service = new DeckService(decks as unknown as IDeckRepository, cards as unknown as ICardRepository);

    const result = await service.list('user-1');

    expect(cards.studyStatsByDeck).toHaveBeenCalledWith('user-1', [deck.id]);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: deck.id,
        studyStats: {
          totalCards: 12,
          toReviewCount: 5,
          newCount: 2,
          dueCount: 3,
          reviewedCount: 10,
          lastStudiedAt: null,
        },
      }),
    );
  });

  it('does not query card stats for an empty page', async () => {
    const decks = {
      page: jest.fn().mockResolvedValue({
        data: [],
        meta: { nextCursor: null, hasNextPage: false },
      }),
    };
    const cards = { studyStatsByDeck: jest.fn() };
    const service = new DeckService(decks as unknown as IDeckRepository, cards as unknown as ICardRepository);

    await expect(service.list('user-1')).resolves.toEqual({
      data: [],
      meta: { nextCursor: null, hasNextPage: false },
    });
    expect(cards.studyStatsByDeck).not.toHaveBeenCalled();
  });

  it('prevents deleting the protected default deck', async () => {
    const decks = {
      findById: jest.fn().mockResolvedValue({ ...deck, isDefault: true }),
      delete: jest.fn(),
    };
    const service = new DeckService(decks as unknown as IDeckRepository, {} as ICardRepository);

    await expect(service.remove('user-1', deck.id)).rejects.toBeInstanceOf(ProtectedDefaultDeckException);
    expect(decks.delete).not.toHaveBeenCalled();
  });

  it('allows renaming and restyling the default deck', async () => {
    const updated = { ...deck, isDefault: true, title: 'Quick capture', icon: DeckIcon.INBOX, color: DeckColor.BLUE };
    const decks = {
      findById: jest.fn().mockResolvedValue({ ...deck, isDefault: true }),
      update: jest.fn().mockResolvedValue(updated),
    };
    const service = new DeckService(decks as unknown as IDeckRepository, {} as ICardRepository);

    await expect(
      service.update('user-1', deck.id, {
        title: updated.title,
        icon: updated.icon,
        color: updated.color,
      }),
    ).resolves.toEqual(updated);
  });
});
