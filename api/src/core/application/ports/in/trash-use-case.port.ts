import { CardImageModel, CardModel, DeckModel } from '@core/domain/models';

export interface TrashSnapshot {
  decks: DeckModel[];
  cards: CardModel[];
  cardImages: CardImageModel[];
  tasks: unknown[];
  /** Additive GLOBAL-TRASH collections. Legacy clients may ignore these fields. */
  journalEntries?: unknown[];
  expenses?: unknown[];
  gymWorkouts?: unknown[];
  gymExercises?: unknown[];
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
  restoreJournalEntry(userId: string, entryId: string): Promise<unknown>;
  restoreExpense(userId: string, expenseId: string): Promise<unknown>;
  restoreGymWorkout(userId: string, workoutId: string): Promise<unknown>;
  restoreGymExercise(userId: string, exerciseId: string): Promise<unknown>;
  deleteJournalEntry(userId: string, entryId: string): Promise<void>;
  deleteExpense(userId: string, expenseId: string): Promise<void>;
  deleteGymWorkout(userId: string, workoutId: string): Promise<void>;
  deleteGymExercise(userId: string, exerciseId: string): Promise<void>;
}
