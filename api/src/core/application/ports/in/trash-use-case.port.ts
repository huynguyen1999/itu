import { CardImageModel, CardModel, DeckModel } from '@core/domain/models';

export interface TrashSnapshot {
  decks: DeckModel[];
  cards: CardModel[];
  cardImages: CardImageModel[];
  tasks: unknown[];
}

export interface ITrashUseCase {
  list(userId: string): Promise<TrashSnapshot>;
  restoreDeck(userId: string, deckId: string): Promise<DeckModel>;
  restoreCard(userId: string, cardId: string): Promise<CardModel>;
  restoreCardImage(userId: string, imageId: string): Promise<CardImageModel>;
  restoreTask(userId: string, taskId: string): Promise<void>;
  deleteDeck(userId: string, deckId: string): Promise<void>;
  deleteCard(userId: string, cardId: string): Promise<void>;
  deleteCardImage(userId: string, imageId: string): Promise<void>;
  deleteTask(userId: string, taskId: string): Promise<void>;
}
