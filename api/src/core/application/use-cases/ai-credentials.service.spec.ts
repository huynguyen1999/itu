import { AiCredentialStatus } from '@core/domain/enums';
import { InvalidAiCredentialException } from '@core/domain/exceptions';
import type { IAiCredentialCrypto, IGeminiKeyValidator } from '@core/application/ports/out/services.port';
import type { IAiCredentialRepository } from '@core/application/ports/out/ai-credential-repository.port';
import { AiCredentialsService } from './ai-credentials.service';

describe('AiCredentialsService', () => {
  const record = {
    id: 'credential-1',
    userId: 'user-1',
    encryptedApiKey: 'encrypted',
    keyHint: '••••1234',
    enabled: true,
    status: AiCredentialStatus.HEALTHY,
    lastError: null,
    lastUsedAt: null,
    cooldownUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  let repository: jest.Mocked<IAiCredentialRepository>;
  let crypto: jest.Mocked<IAiCredentialCrypto>;
  let validator: jest.Mocked<IGeminiKeyValidator>;
  let service: AiCredentialsService;

  beforeEach(() => {
    repository = {
      list: jest.fn(),
      listEligible: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findById: jest.fn(),
      create: jest.fn().mockResolvedValue(record),
      update: jest.fn().mockImplementation(async (_userId, _id, patch) => ({ ...record, ...patch })),
      remove: jest.fn(),
    };
    crypto = {
      encrypt: jest.fn().mockReturnValue('encrypted'),
      decrypt: jest.fn().mockReturnValue('AIza-valid'),
      keyHint: jest.fn().mockReturnValue('••••alid'),
    };
    validator = { validate: jest.fn() };
    service = new AiCredentialsService(repository, crypto, validator);
  });

  it('does not persist a key Gemini rejects during add', async () => {
    validator.validate.mockRejectedValue(new Error('invalid API key'));

    await expect(service.add('user-1', 'AIza-invalid')).rejects.toBeInstanceOf(InvalidAiCredentialException);
    expect(repository.create).not.toHaveBeenCalled();
    expect(crypto.encrypt).not.toHaveBeenCalled();
  });

  it('updates health information without changing enabled when Test Connection fails', async () => {
    repository.findById.mockResolvedValue(record);
    validator.validate.mockRejectedValue({ status: 429, retryAfter: 2, message: 'rate limited' });

    const result = await service.test('user-1', 'credential-1');
    expect(result).toMatchObject({
      enabled: true,
      status: AiCredentialStatus.RATE_LIMITED,
    });
    expect(result).not.toHaveProperty('encryptedApiKey');
    expect(repository.update).toHaveBeenCalledWith(
      'user-1',
      'credential-1',
      expect.objectContaining({ status: AiCredentialStatus.RATE_LIMITED }),
    );
    expect(repository.update.mock.calls[0][2]).not.toHaveProperty('enabled');
  });
});
