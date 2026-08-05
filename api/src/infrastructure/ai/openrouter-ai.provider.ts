import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AI_CONSTANTS, CONFIG_KEYS, OPENROUTER_CONSTANTS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type { SuggestedCard } from '@core/application/ports/in/ai-use-case.port';
import type { IAiProvider, ILogger } from '@core/application/ports/out/services.port';
import type {
  CardGrading,
  ReviewSessionInput,
  SessionFeedbackResult,
} from '@core/application/ports/out/service-types.port';
import {
  buildCardSuggestionPrompt,
  buildSessionSummaryPrompt,
  buildSessionGradingPrompt,
  errorMessage,
  fallbackCards,
  fallbackSessionFeedback,
  parseCardSuggestionsJson,
  parseGradingJson,
} from './ai-provider.shared';
import { fetchWithTimeout, streamFetchTimeoutMs } from '../http/outbound-http';

type ChatMessage = {
  role: 'user';
  content:
    string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string; detail: 'auto' } }>;
};

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  response_format?: {
    type: 'json_object';
  };
};

type ChatCompletionStreamChunk = {
  choices?: Array<{
    delta?: {
      content?: string | null;
    };
  }>;
};

@Injectable()
export class OpenRouterAiProvider implements IAiProvider {
  private readonly apiKey: string | undefined;
  private readonly appTitle: string | undefined;
  private readonly baseUrl: string;
  private readonly httpReferer: string | undefined;
  private readonly model: string;
  private readonly visionModel: string | undefined;

  constructor(
    config: ConfigService,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
  ) {
    this.apiKey = config.get<string>(CONFIG_KEYS.openRouterApiKey) || undefined;
    this.appTitle = config.get<string>(CONFIG_KEYS.openRouterAppTitle) || undefined;
    this.baseUrl = trimTrailingSlash(
      config.get<string>(CONFIG_KEYS.openRouterBaseUrl, OPENROUTER_CONSTANTS.defaultBaseUrl),
    );
    this.httpReferer = config.get<string>(CONFIG_KEYS.openRouterHttpReferer) || undefined;
    this.model = config.get<string>(CONFIG_KEYS.openRouterModel, OPENROUTER_CONSTANTS.defaultModel);
    this.visionModel = config.get<string>(CONFIG_KEYS.openRouterVisionModel, OPENROUTER_CONSTANTS.defaultVisionModel);
    this.logger.debug('OpenRouter AI provider initialized', {
      model: this.model,
      configured: Boolean(this.apiKey),
    });
  }

  async generateCards(pastedText: string): Promise<SuggestedCard[]> {
    if (!this.apiKey) {
      const cards = fallbackCards(pastedText);
      this.logger.warn('OpenRouter API key is not configured, using fallback card suggestions', {
        cardCount: cards.length,
      });
      return cards;
    }

    try {
      this.logger.debug('Requesting OpenRouter card suggestions', { model: this.model, textLength: pastedText.length });
      const text = await this.chat([{ role: 'user', content: buildCardSuggestionPrompt(pastedText) }], false);
      const cards = parseCardSuggestionsJson(text);
      this.logger.debug('OpenRouter card suggestions parsed', { cardCount: cards.length });
      return cards;
    } catch (error) {
      this.logger.error('OpenRouter card suggestion generation failed', { error: errorMessage(error) });
      throw error;
    }
  }

  async reviewSession(input: ReviewSessionInput): Promise<SessionFeedbackResult> {
    if (!this.apiKey) {
      return fallbackSessionFeedback(input);
    }

    try {
      const prompt = buildSessionSummaryPrompt(input);
      const messages = this.sessionMessages(input, prompt);
      let summary: string;
      try {
        summary = await this.chat(messages, false, messages[0].content === prompt ? undefined : this.visionModel);
      } catch (error) {
        if (messages[0].content === prompt) throw error;
        this.logger.warn('OpenRouter vision feedback failed; retrying text-only', { error: errorMessage(error) });
        summary = await this.chat([{ role: 'user', content: prompt }], false);
      }
      const grading = await this.generateSessionGrading(input);
      return {
        summary,
        ...grading,
      };
    } catch (error) {
      this.logger.error('OpenRouter session feedback generation failed', { error: errorMessage(error) });
      throw error;
    }
  }

  async *streamCards(pastedText: string): AsyncIterable<string> {
    if (!this.apiKey) {
      const cards = fallbackCards(pastedText);
      yield cards.map((c) => `Front: ${c.promptRichText}\nBack: ${c.answerRichText}`).join('\n---\n');
      return;
    }
    yield* this.chatStream([{ role: 'user', content: buildCardSuggestionPrompt(pastedText) }], false);
  }

  async *streamSessionSummary(input: ReviewSessionInput): AsyncIterable<string> {
    if (!this.apiKey) {
      const feedback = fallbackSessionFeedback(input);
      yield feedback.summary;
      return;
    }
    const prompt = buildSessionSummaryPrompt(input);
    const messages = this.sessionMessages(input, prompt);
    if (messages[0].content === prompt) {
      yield* this.chatStream(messages, false);
      return;
    }
    try {
      yield* this.chatStream(messages, false, this.visionModel);
    } catch (error) {
      this.logger.warn('OpenRouter vision summary failed; retrying text-only', { error: errorMessage(error) });
      yield* this.chatStream([{ role: 'user', content: prompt }], false);
    }
  }

  async generateSessionGrading(
    input: ReviewSessionInput,
  ): Promise<{ cardGradings: CardGrading[]; confidence?: number; gradePoint?: number }> {
    if (!this.apiKey) {
      const fallback = fallbackSessionFeedback(input);
      return {
        cardGradings: fallback.cardGradings,
        confidence: fallback.confidence,
        gradePoint: fallback.gradePoint,
      };
    }

    try {
      this.logger.debug('Generating OpenRouter session grading', { model: this.model });
      const prompt = buildSessionGradingPrompt(input);
      const messages = this.sessionMessages(input, prompt);
      let text: string;
      try {
        text = await this.chat(messages, true, messages[0].content === prompt ? undefined : this.visionModel);
      } catch (error) {
        if (messages[0].content === prompt) throw error;
        this.logger.warn('OpenRouter vision grading failed; retrying text-only', { error: errorMessage(error) });
        text = await this.chat([{ role: 'user', content: prompt }], true);
      }
      return parseGradingJson(text);
    } catch (error) {
      this.logger.error('OpenRouter session grading generation failed', { error: errorMessage(error) });
      throw error;
    }
  }

  private async *chatStream(
    messages: ChatMessage[],
    jsonMode = true,
    model = this.model,
  ): AsyncGenerator<string, void, unknown> {
    const body: ChatCompletionRequest = {
      model,
      messages,
      stream: true,
    };
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetchWithTimeout(
      `${this.baseUrl}${OPENROUTER_CONSTANTS.chatCompletionsPath}`,
      {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      },
      streamFetchTimeoutMs(),
    );

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`OpenRouter request failed with ${response.status}: ${bodyText.slice(0, 500)}`);
    }

    if (!response.body) {
      throw new Error('OpenRouter response did not include a body for streaming');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of streamChunks(response.body)) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const clean = line.trim();
        if (!clean) continue;
        if (clean === 'data: [DONE]') continue;
        if (clean.startsWith('data: ')) {
          try {
            const data = JSON.parse(clean.slice(6)) as ChatCompletionStreamChunk;
            const text = data.choices?.[0]?.delta?.content;
            if (text) {
              yield text;
            }
          } catch {
            // Ignore incomplete line JSON parsing issues
          }
        }
      }
    }
  }

  private async chat(messages: ChatMessage[], jsonMode = true, model = this.model): Promise<string> {
    const body: ChatCompletionRequest = {
      model,
      messages,
    };
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }

    const response = await fetchWithTimeout(`${this.baseUrl}${OPENROUTER_CONSTANTS.chatCompletionsPath}`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(`OpenRouter request failed with ${response.status}: ${bodyText.slice(0, 500)}`);
    }

    const json = (await response.json()) as ChatCompletionResponse;
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      this.logger.error('OpenRouter response did not include assistant message content', { rawResponse: json });
      throw new Error('OpenRouter response did not include assistant message content');
    }
    return content;
  }

  private headers(): HeadersInit {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': AI_CONSTANTS.responseMimeType,
    };
    if (this.httpReferer) headers['HTTP-Referer'] = this.httpReferer;
    if (this.appTitle) headers['X-OpenRouter-Title'] = this.appTitle;
    return headers;
  }

  private sessionMessages(input: ReviewSessionInput, prompt: string): ChatMessage[] {
    const images = input.reviews.flatMap((review, reviewIndex) =>
      (review.images ?? []).map((image) => ({
        reviewIndex,
        cardId: review.cardId,
        image,
      })),
    );
    if (!this.visionModel || images.length === 0) return [{ role: 'user', content: prompt }];

    return [
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...images.flatMap(({ reviewIndex, cardId, image }) => [
            {
              type: 'text' as const,
              text: `Image for Card ${reviewIndex + 1} (${cardId}), ${image.side} side:`,
            },
            {
              type: 'image_url' as const,
              image_url: {
                url: `data:${image.mimeType};base64,${image.data}`,
                detail: 'auto' as const,
              },
            },
          ]),
        ],
      },
    ];
  }
}

function trimTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

async function* streamChunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array, void, unknown> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
