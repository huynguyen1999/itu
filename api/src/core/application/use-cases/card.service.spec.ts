import { CardService } from './card.service';
import { CardType } from '@core/domain/enums';
import type {
  ICardRepository,
  IDeckRepository,
  IReviewStateRepository,
} from '@core/application/ports/out/repositories.port';
import type { IMediaStorage } from '@core/application/ports/out/services.port';

describe('CardService - importCards', () => {
  let cardService: CardService;
  let mockDecks: jest.Mocked<IDeckRepository>;
  let mockCards: jest.Mocked<ICardRepository>;
  let mockReviewStates: jest.Mocked<IReviewStateRepository>;
  let mockMedia: jest.Mocked<IMediaStorage>;

  beforeEach(() => {
    mockDecks = {
      findById: jest.fn(),
      list: jest.fn(),
      page: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IDeckRepository>;

    mockCards = {
      importCards: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      findById: jest.fn(),
      pageByDeck: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      restore: jest.fn(),
      countImages: jest.fn(),
      addImage: jest.fn(),
      findImage: jest.fn(),
      findImageByStorageKey: jest.fn(),
      deleteImage: jest.fn(),
      restoreImage: jest.fn(),
      studyStatsByDeck: jest.fn(),
    } as unknown as jest.Mocked<ICardRepository>;

    mockReviewStates = {
      createInitialStates: jest.fn(),
      listDue: jest.fn(),
      find: jest.fn(),
      update: jest.fn(),
      resetCardDueAt: jest.fn(),
      dueCountByDeck: jest.fn(),
    } as unknown as jest.Mocked<IReviewStateRepository>;

    mockMedia = {
      storeCardImage: jest.fn(),
      delete: jest.fn(),
    } as unknown as jest.Mocked<IMediaStorage>;

    cardService = new CardService(mockDecks, mockCards, mockReviewStates, mockMedia);
  });

  it('maps import cards command correctly and delegates to repository', async () => {
    const userId = 'user-1';
    const deckName = 'Language';
    const command = {
      deckName,
      items: [
        {
          question: 'Hello',
          answer: 'Bonjour',
          nextReviewDate: '2026-07-20T12:00:00.000Z',
          generateReverse: true,
        },
        {
          question: 'Goodbye',
          answer: 'Au revoir',
          nextReviewDate: 'invalid-date',
          generateReverse: false,
        },
      ],
    };

    await cardService.importCards(userId, command);

    expect(mockCards.importCards).toHaveBeenCalledTimes(1);
    const [, passedDeckName, passedItems] = mockCards.importCards.mock.calls[0];

    expect(passedDeckName).toBe(deckName);
    expect(passedItems).toHaveLength(2);

    // First card: REVERSE, specific due date
    expect(passedItems[0].promptRichText).toBe('Hello');
    expect(passedItems[0].answerRichText).toBe('Bonjour');
    expect(passedItems[0].type).toBe(CardType.REVERSE);
    expect(passedItems[0].dueAt.toISOString()).toBe('2026-07-20T12:00:00.000Z');

    // Second card: BASIC, invalid date defaulted to current time
    expect(passedItems[1].promptRichText).toBe('Goodbye');
    expect(passedItems[1].answerRichText).toBe('Au revoir');
    expect(passedItems[1].type).toBe(CardType.BASIC);
    expect(passedItems[1].dueAt).toBeInstanceOf(Date);
    expect(Math.abs(passedItems[1].dueAt.getTime() - Date.now())).toBeLessThan(5000);
  });

  it('moves owned cards without changing their scheduling data', async () => {
    mockDecks.findById.mockResolvedValue({ id: 'deck-2' } as never);
    mockCards.findById
      .mockResolvedValueOnce({ id: 'card-1', deckId: 'deck-1' } as never)
      .mockResolvedValueOnce({ id: 'card-2', deckId: 'deck-1' } as never);
    mockCards.move = jest.fn().mockResolvedValue(['card-1', 'card-2']);

    await expect(
      cardService.move('user-1', { cardIds: ['card-1', 'card-2'], targetDeckId: 'deck-2' }),
    ).resolves.toEqual({ movedCardIds: ['card-1', 'card-2'], targetDeckId: 'deck-2' });
    expect(mockCards.move).toHaveBeenCalledWith('user-1', ['card-1', 'card-2'], 'deck-2');
    expect(mockReviewStates.resetCardDueAt).not.toHaveBeenCalled();
  });

  it('rejects duplicate card IDs before moving', async () => {
    await expect(cardService.move('user-1', { cardIds: ['card-1', 'card-1'], targetDeckId: 'deck-2' })).rejects.toThrow(
      'Card IDs must be unique',
    );
  });
});
