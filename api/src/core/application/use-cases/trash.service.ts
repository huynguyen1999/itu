import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import type { ITrashUseCase, TrashSnapshot } from '@core/application/ports/in/trash-use-case.port';
import type { ITrashRepository } from '@core/application/ports/out/repositories.port';
import type { IMediaStorage } from '@core/application/ports/out/services.port';
import { CardImageModel, CardModel, DeckModel } from '@core/domain/models';
import {
  EntityNotFoundException,
  InvalidTrashOperationException,
  ProtectedDefaultDeckException,
} from '@core/domain/exceptions';

@Injectable()
export class TrashService implements ITrashUseCase {
  constructor(
    @Inject(TOKENS.TRASH_REPOSITORY) private readonly trash: ITrashRepository,
    @Inject(TOKENS.MEDIA_STORAGE) private readonly media: IMediaStorage,
  ) {}

  list(userId: string): Promise<TrashSnapshot> {
    return this.trash.list(userId);
  }

  async restoreDeck(userId: string, deckId: string): Promise<DeckModel> {
    const deck = await this.trash.restoreDeck(userId, deckId);
    if (!deck) throw new EntityNotFoundException('TrashDeck', deckId);
    return deck;
  }

  async restoreCard(userId: string, cardId: string): Promise<CardModel> {
    const card = await this.trash.restoreCard(userId, cardId);
    if (!card) {
      throw new InvalidTrashOperationException('Restore the parent deck before restoring this card');
    }
    return card;
  }

  async restoreCardImage(userId: string, imageId: string): Promise<CardImageModel> {
    const image = await this.trash.restoreCardImage(userId, imageId);
    if (!image) {
      throw new InvalidTrashOperationException('Restore the parent card before restoring this image');
    }
    return image;
  }

  async restoreTask(userId: string, taskId: string): Promise<void> {
    const restored = await this.trash.restoreTask(userId, taskId);
    if (!restored) throw new EntityNotFoundException('TrashTask', taskId);
  }

  async deleteDeck(userId: string, deckId: string): Promise<void> {
    const snapshot = await this.trash.list(userId);
    if (snapshot.decks.some((deck) => deck.id === deckId && deck.isDefault)) {
      throw new ProtectedDefaultDeckException();
    }
    const images = await this.trash.deleteDeck(userId, deckId);
    if (!images) throw new EntityNotFoundException('TrashDeck', deckId);
    await this.deleteMedia(images);
  }

  async deleteCard(userId: string, cardId: string): Promise<void> {
    const images = await this.trash.deleteCard(userId, cardId);
    if (!images) throw new EntityNotFoundException('TrashCard', cardId);
    await this.deleteMedia(images);
  }

  async deleteCardImage(userId: string, imageId: string): Promise<void> {
    const image = await this.trash.deleteCardImage(userId, imageId);
    if (!image) throw new EntityNotFoundException('TrashCardImage', imageId);
    await this.deleteMedia([image]);
  }

  async deleteTask(userId: string, taskId: string): Promise<void> {
    const deleted = await this.trash.deleteTask(userId, taskId);
    if (!deleted) throw new EntityNotFoundException('TrashTask', taskId);
  }

  async restoreJournalEntry(userId: string, entryId: string): Promise<unknown> {
    const restored = await this.trash.restoreJournalEntry(userId, entryId);
    if (!restored) throw new EntityNotFoundException('TrashJournalEntry', entryId);
    return restored;
  }

  async restoreExpense(userId: string, expenseId: string): Promise<unknown> {
    const restored = await this.trash.restoreExpense(userId, expenseId);
    if (!restored) throw new EntityNotFoundException('TrashExpense', expenseId);
    return restored;
  }

  async restoreGymWorkout(userId: string, workoutId: string): Promise<unknown> {
    const restored = await this.trash.restoreGymWorkout(userId, workoutId);
    if (!restored) throw new EntityNotFoundException('TrashGymWorkout', workoutId);
    return restored;
  }

  async restoreGymExercise(userId: string, exerciseId: string): Promise<unknown> {
    const restored = await this.trash.restoreGymExercise(userId, exerciseId);
    if (!restored) throw new EntityNotFoundException('TrashGymExercise', exerciseId);
    return restored;
  }

  async deleteJournalEntry(userId: string, entryId: string): Promise<void> {
    const attachments = await this.trash.deleteJournalEntry(userId, entryId);
    if (!attachments) throw new EntityNotFoundException('TrashJournalEntry', entryId);
    await Promise.allSettled(attachments.map((attachment) => this.media.delete(attachment.storageKey)));
  }

  async deleteExpense(userId: string, expenseId: string): Promise<void> {
    const deleted = await this.trash.deleteExpense(userId, expenseId);
    if (!deleted) throw new EntityNotFoundException('TrashExpense', expenseId);
  }

  async deleteGymWorkout(userId: string, workoutId: string): Promise<void> {
    const deleted = await this.trash.deleteGymWorkout(userId, workoutId);
    if (!deleted) throw new EntityNotFoundException('TrashGymWorkout', workoutId);
  }

  async deleteGymExercise(userId: string, exerciseId: string): Promise<void> {
    const deleted = await this.trash.deleteGymExercise(userId, exerciseId);
    if (!deleted) throw new EntityNotFoundException('TrashGymExercise', exerciseId);
    if (deleted.imageStorageKey) {
      await this.media.delete(deleted.imageStorageKey).catch(() => undefined);
    }
  }

  private async deleteMedia(images: CardImageModel[]): Promise<void> {
    await Promise.all(images.map((image) => this.media.delete(image.storageKey)));
  }
}
