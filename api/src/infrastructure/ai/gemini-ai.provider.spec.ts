import { GoogleGenAI } from '@google/genai';
import { ConfigService } from '@nestjs/config';
import { AiCredentialStatus, ReviewDirection, ReviewGrade } from '@core/domain/enums';
import type { IAiCredentialRepository } from '@core/application/ports/out/ai-credential-repository.port';
import type { IAiCredentialCrypto, ILogger } from '@core/application/ports/out/services.port';
import type { AiCredentialRecord } from '@core/application/ports/out/ai-credential-repository.port';
import { GeminiAiProvider } from './gemini-ai.provider';

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn(),
  Type: { OBJECT: 'OBJECT', ARRAY: 'ARRAY', STRING: 'STRING', NUMBER: 'NUMBER' },
}));

const GoogleGenAIMock = GoogleGenAI as unknown as jest.Mock;

describe('GeminiAiProvider', () => {
  let repository: jest.Mocked<IAiCredentialRepository>;
  let crypto: jest.Mocked<IAiCredentialCrypto>;
  let logger: jest.Mocked<ILogger>;
  let clients: Record<string, { models: { generateContent: jest.Mock; generateContentStream: jest.Mock } }>;
  let provider: GeminiAiProvider;

  beforeEach(() => {
    clients = {};
    GoogleGenAIMock.mockImplementation(({ apiKey }: { apiKey: string }) => {
      clients[apiKey] ??= {
        models: {
          generateContent: jest.fn(),
          generateContentStream: jest.fn(),
        },
      };
      return clients[apiKey];
    });
    repository = {
      list: jest.fn(),
      listEligible: jest.fn(),
      count: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(null),
      remove: jest.fn(),
    };
    crypto = {
      encrypt: jest.fn(),
      decrypt: jest.fn((value) => value.replace('enc-', 'key-')),
      keyHint: jest.fn(),
    };
    logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    provider = new GeminiAiProvider(
      { get: jest.fn((_key: string, fallback: string) => fallback) } as unknown as ConfigService,
      logger,
      repository,
      crypto,
    );
  });

  it('rotates to the next eligible key after an auth failure', async () => {
    const first = credential('one');
    const second = credential('two');
    repository.listEligible.mockResolvedValue([first, second]);
    clients['key-one'] = client();
    clients['key-two'] = client();
    clients['key-one'].models.generateContent.mockRejectedValue({ status: 401, message: 'invalid API key' });
    clients['key-two'].models.generateContent.mockResolvedValue({
      text: '{"cards":[{"promptRichText":"Q","answerRichText":"A"}]}',
    });

    await expect(provider.generateCards('user-1', 'notes')).resolves.toEqual([
      { promptRichText: 'Q', answerRichText: 'A', tags: [] },
    ]);

    expect(clients['key-one'].models.generateContent).toHaveBeenCalledTimes(1);
    expect(clients['key-two'].models.generateContent).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledWith(
      'user-1',
      'one',
      expect.objectContaining({ status: AiCredentialStatus.INVALID_KEY }),
    );
  });

  it('uses the retry hint when marking a rate-limited credential', async () => {
    const first = credential('one');
    const second = credential('two');
    repository.listEligible.mockResolvedValue([first, second]);
    clients['key-one'] = client();
    clients['key-two'] = client();
    clients['key-one'].models.generateContent.mockRejectedValue({
      status: 429,
      retryAfter: 2,
      message: 'rate limited',
    });
    clients['key-two'].models.generateContent.mockResolvedValue({
      text: '{"cards":[{"promptRichText":"Q","answerRichText":"A"}]}',
    });

    await provider.generateCards('user-1', 'notes');

    expect(repository.update).toHaveBeenCalledWith(
      'user-1',
      'one',
      expect.objectContaining({
        status: AiCredentialStatus.RATE_LIMITED,
        cooldownUntil: expect.any(Date),
      }),
    );
    const rateLimitUpdate = repository.update.mock.calls.find(
      ([, id, data]) => id === 'one' && data.status === AiCredentialStatus.RATE_LIMITED,
    );
    expect((rateLimitUpdate?.[2].cooldownUntil as Date).getTime()).toBeGreaterThan(Date.now() + 1_000);
  });

  it('tries at most one alternate key for generic provider failures', async () => {
    repository.listEligible.mockResolvedValue([credential('one'), credential('two'), credential('three')]);
    clients['key-one'] = client();
    clients['key-two'] = client();
    clients['key-three'] = client();
    clients['key-one'].models.generateContent.mockRejectedValue({ status: 503, message: 'unavailable' });
    clients['key-two'].models.generateContent.mockRejectedValue({ status: 503, message: 'unavailable' });

    await expect(provider.generateCards('user-1', 'notes')).rejects.toMatchObject({ status: 503 });
    expect(clients['key-three'].models.generateContent).not.toHaveBeenCalled();
  });

  it('does not rotate a stream after the first chunk has been emitted', async () => {
    repository.listEligible.mockResolvedValue([credential('one'), credential('two')]);
    clients['key-one'] = client();
    clients['key-two'] = client();
    clients['key-one'].models.generateContentStream.mockResolvedValue(brokenStream());

    const chunks: string[] = [];
    await expect(
      (async () => {
        for await (const chunk of provider.streamCards('user-1', 'notes')) chunks.push(chunk);
      })(),
    ).rejects.toMatchObject({ code: 'GEMINI_STREAM_INTERRUPTED' });

    expect(chunks).toEqual(['partial']);
    expect(clients['key-two'].models.generateContentStream).not.toHaveBeenCalled();
  });

  it('returns GEMINI_NOT_CONFIGURED when no eligible credential exists', async () => {
    repository.listEligible.mockResolvedValue([]);

    await expect(provider.generateCards('user-1', 'notes')).rejects.toMatchObject({ code: 'GEMINI_NOT_CONFIGURED' });
  });
});

function credential(id: string): AiCredentialRecord {
  return {
    id,
    userId: 'user-1',
    encryptedApiKey: `enc-${id}`,
    keyHint: `••••${id}`,
    enabled: true,
    status: AiCredentialStatus.HEALTHY,
    lastError: null,
    lastUsedAt: null,
    cooldownUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function client() {
  return { models: { generateContent: jest.fn(), generateContentStream: jest.fn() } };
}

async function* brokenStream() {
  yield { text: 'partial' };
  throw { status: 503, message: 'stream interrupted' };
}
