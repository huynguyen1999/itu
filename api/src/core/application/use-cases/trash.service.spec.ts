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
      purgeExpired: jest.fn(),
    };
    media = {
      storeCardImage: jest.fn(),
      storeUserImage: jest.fn(),
      storeAudio: jest.fn(),
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
});
