import { ITrashRepository } from '@core/application/ports/out/repositories.port';
import { IMediaStorage } from '@core/application/ports/out/services.port';
import { InvalidTrashOperationException } from '@core/domain/exceptions';
import { TrashService } from './trash.service';

describe('TrashService', () => {
  let repository: jest.Mocked<ITrashRepository>;
  let media: jest.Mocked<IMediaStorage>;
  let service: TrashService;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      restoreDeck: jest.fn(),
      restoreCard: jest.fn(),
      restoreCardImage: jest.fn(),
      restoreTask: jest.fn(),
      deleteDeck: jest.fn(),
      deleteCard: jest.fn(),
      deleteCardImage: jest.fn(),
      deleteTask: jest.fn(),
      restoreJournalEntry: jest.fn(),
      restoreBudgetTransaction: jest.fn(),
      restoreGymWorkout: jest.fn(),
      restoreGymExercise: jest.fn(),
      deleteJournalEntry: jest.fn(),
      deleteBudgetTransaction: jest.fn(),
      deleteGymWorkout: jest.fn(),
      deleteGymExercise: jest.fn(),
      purgeExpired: jest.fn(),
    };
    media = {
      storeCardImage: jest.fn(),
      storeUserImage: jest.fn(),
      storeAudio: jest.fn(),
      storeRawBuffer: jest.fn(),
      read: jest.fn(),
      delete: jest.fn(),
    };
    service = new TrashService(repository, media);
  });

  it('returns the user trash snapshot', async () => {
    repository.list.mockResolvedValue({ decks: [], cards: [], cardImages: [], tasks: [] });

    await expect(service.list('user-1')).resolves.toEqual({ decks: [], cards: [], cardImages: [], tasks: [] });

    expect(repository.list).toHaveBeenCalledWith('user-1');
  });

  it('requires restoring the parent deck before restoring a card', async () => {
    repository.restoreCard.mockResolvedValue(null);

    await expect(service.restoreCard('user-1', 'card-1')).rejects.toThrow(InvalidTrashOperationException);
  });

  it('requires restoring the parent card before restoring an image', async () => {
    repository.restoreCardImage.mockResolvedValue(null);

    await expect(service.restoreCardImage('user-1', 'image-1')).rejects.toThrow(InvalidTrashOperationException);
  });

  it('restores additive global-trash entities through the repository', async () => {
    repository.restoreBudgetTransaction!.mockResolvedValue({ id: 'tx-1' });

    await expect(service.restoreBudgetTransaction('user-1', 'tx-1')).resolves.toEqual({ id: 'tx-1' });
    expect(repository.restoreBudgetTransaction).toHaveBeenCalledWith('user-1', 'tx-1');
  });

  it('hard-deletes Journal Entry attachments even when media cleanup fails', async () => {
    repository.deleteJournalEntry!.mockResolvedValue([{ storageKey: 'journal/user-1/att-1' }] as any);
    media.delete.mockRejectedValue(new Error('storage unavailable'));

    await expect(service.deleteJournalEntry('user-1', 'entry-1')).resolves.toBeUndefined();
    expect(media.delete).toHaveBeenCalledWith('journal/user-1/att-1');
  });

  it('best-effort cleans an exercise image after permanent deletion', async () => {
    repository.deleteGymExercise!.mockResolvedValue({ imageStorageKey: 'gym/user-1/exercise-1.webp' } as any);
    media.delete.mockRejectedValue(new Error('storage unavailable'));

    await expect(service.deleteGymExercise('user-1', 'exercise-1')).resolves.toBeUndefined();
    expect(media.delete).toHaveBeenCalledWith('gym/user-1/exercise-1.webp');
  });
});
