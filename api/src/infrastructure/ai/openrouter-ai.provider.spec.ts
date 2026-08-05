import { ConfigService } from '@nestjs/config';
import { CardSide, ReviewDirection, ReviewGrade } from '@core/domain/enums';
import type { ILogger } from '@core/application/ports/out/services.port';
import type { ReviewSessionInput } from '@core/application/ports/out/service-types.port';
import { OpenRouterAiProvider } from './openrouter-ai.provider';

describe('OpenRouterAiProvider', () => {
  let fetchMock: jest.SpiedFunction<typeof fetch>;
  let logger: jest.Mocked<ILogger>;

  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch');
    logger = {
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
  });

  afterEach(() => {
    fetchMock.mockRestore();
  });

  it('sends card suggestion requests to OpenRouter with the configured model in text format', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ choices: [{ message: { content: cardResponseText() } }] })),
    );
    const provider = createProvider(logger);

    await provider.generateCards('Mitochondria make ATP.');

    expect(fetchMock).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer openrouter-key',
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:5173',
        'X-OpenRouter-Title': 'Quiz.me',
      },
      body: expect.any(String),
      signal: expect.any(AbortSignal),
    });
    const body = JSON.parse((fetchMock.mock.calls[0]?.[1] as RequestInit).body as string) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      response_format?: { type: string };
    };
    expect(body.model).toBe('openrouter/free');
    expect(body.response_format).toBeUndefined();
    expect(body.messages[0]?.content).toContain('Mitochondria make ATP.');
  });

  it('parses OpenRouter card suggestions', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(jsonResponse({ choices: [{ message: { content: cardResponseText() } }] })),
    );
    const provider = createProvider(logger);

    await expect(provider.generateCards('Mitochondria make ATP.')).resolves.toEqual([
      {
        promptRichText: 'What makes ATP?',
        answerRichText: 'Mitochondria',
        tags: ['biology'],
      },
    ]);
  });

  it('parses OpenRouter session feedback', async () => {
    fetchMock.mockImplementation((url, init) => {
      const body = JSON.parse(init?.body as string);
      const isGrading = body.response_format?.type === 'json_object';
      if (isGrading) {
        return Promise.resolve(
          jsonResponse({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    cardGradings: [
                      {
                        cardId: 'card-1',
                        correctness: 'CORRECT',
                        explanation: 'The learner answered correctly.',
                      },
                    ],
                    confidence: 0.8,
                    gradePoint: 85,
                  }),
                },
              },
            ],
          }),
        );
      } else {
        return Promise.resolve(
          jsonResponse({
            choices: [
              {
                message: {
                  content: 'Good recall with one weak area.',
                },
              },
            ],
          }),
        );
      }
    });
    const provider = createProvider(logger);

    await expect(provider.reviewSession(reviewInput())).resolves.toEqual({
      summary: 'Good recall with one weak area.',
      cardGradings: [
        {
          cardId: 'card-1',
          correctness: 'CORRECT',
          explanation: 'The learner answered correctly.',
        },
      ],
      confidence: 0.8,
      gradePoint: 85,
    });
  });

  it('sends reviewed images only to the configured vision model', async () => {
    fetchMock.mockImplementation((_url, init) => {
      const body = JSON.parse(init?.body as string);
      return Promise.resolve(
        jsonResponse({
          choices: [
            {
              message: {
                content: body.response_format
                  ? JSON.stringify({ cardGradings: [], confidence: 0.7, gradePoint: 80 })
                  : 'Visual feedback.',
              },
            },
          ],
        }),
      );
    });
    const provider = createProvider(logger, { OPENROUTER_VISION_MODEL: 'vision/model' });
    const input = reviewInput();
    input.reviews[0].images = [
      {
        side: CardSide.PROMPT,
        mimeType: 'image/webp',
        data: Buffer.from('image').toString('base64'),
        sortOrder: 0,
      },
    ];

    await provider.reviewSession(input);

    const requestBodies = fetchMock.mock.calls.map(
      (call) =>
        JSON.parse((call[1] as RequestInit).body as string) as {
          model: string;
          messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>;
        },
    );
    expect(requestBodies).toHaveLength(2);
    expect(requestBodies.every((body) => body.model === 'vision/model')).toBe(true);
    expect(requestBodies[0].messages[0].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'image_url',
          image_url: expect.objectContaining({ url: expect.stringMatching(/^data:image\/webp;base64,/) }),
        }),
      ]),
    );
  });

  it('uses fallback card suggestions when the OpenRouter API key is missing', async () => {
    const provider = createProvider(logger, { OPENROUTER_API_KEY: '' });

    const cards = await provider.generateCards('Photosynthesis uses light.');

    expect(cards).toHaveLength(1);
    expect(cards[0]?.tags).toEqual(['ai-suggested']);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith('OpenRouter API key is not configured, using fallback card suggestions', {
      cardCount: 1,
    });
  });

  it('throws and logs a clear error for non-2xx OpenRouter responses', async () => {
    fetchMock.mockResolvedValue(textResponse('rate limited', { ok: false, status: 429 }));
    const provider = createProvider(logger);

    await expect(provider.generateCards('Mitochondria make ATP.')).rejects.toThrow(
      'OpenRouter request failed with 429: rate limited',
    );
    expect(logger.error).toHaveBeenCalledWith('OpenRouter card suggestion generation failed', {
      error: 'OpenRouter request failed with 429: rate limited',
    });
  });
});

function createProvider(logger: ILogger, overrides: Record<string, string> = {}) {
  return new OpenRouterAiProvider(
    new ConfigService({
      OPENROUTER_API_KEY: 'openrouter-key',
      OPENROUTER_APP_TITLE: 'Quiz.me',
      OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
      OPENROUTER_HTTP_REFERER: 'http://localhost:5173',
      OPENROUTER_MODEL: 'openrouter/free',
      ...overrides,
    }),
    logger,
  );
}

function cardResponseText(): string {
  return JSON.stringify({
    cards: [
      {
        promptRichText: 'What makes ATP?',
        answerRichText: 'Mitochondria',
        tags: ['biology'],
      },
    ],
  });
}

function reviewInput(): ReviewSessionInput {
  return {
    rating: 8,
    reviewed: 1,
    correct: 1,
    reviews: [
      {
        answerRichText: 'Mitochondria',
        cardId: 'card-1',
        direction: ReviewDirection.FRONT_TO_BACK,
        grade: ReviewGrade.GOOD,
        promptRichText: 'What makes ATP?',
        userAnswer: 'Mitochondria',
      },
    ],
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  });
}

function textResponse(body: string, init: { ok: false; status: number }): Response {
  return new Response(body, { status: init.status });
}
