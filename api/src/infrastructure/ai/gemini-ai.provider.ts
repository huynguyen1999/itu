import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import type { GenerateContentParameters } from '@google/genai';
import { AI_CONSTANTS, CONFIG_KEYS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import { AiCredentialStatus } from '@core/domain/enums';
import type { SuggestedCard } from '@core/application/ports/in/ai-use-case.port';
import type {
  AiCredentialRecord,
  IAiCredentialRepository,
} from '@core/application/ports/out/ai-credential-repository.port';
import type { IAiProvider, IAiCredentialCrypto, ILogger } from '@core/application/ports/out/services.port';
import type {
  CardGrading,
  ReviewSessionInput,
  SessionFeedbackResult,
} from '@core/application/ports/out/service-types.port';
import type { ReviewInsightsInput, ReviewInsightsResultV1 } from '@core/domain/review/review.types';
import {
  classifyGeminiError,
  errorText,
  geminiNotConfiguredError,
  GeminiProviderError,
  isImageCapabilityError,
} from '@core/application/gemini-errors';
import {
  buildCardSuggestionPrompt,
  buildSessionSummaryPrompt,
  buildSessionGradingPrompt,
  errorMessage,
  interactionText,
  parseCardSuggestionsJson,
  parseGradingJson,
} from './ai-provider.shared';
import { buildReviewInsightsPrompt, parseReviewInsights } from './review-insights';

const CardSuggestionResponseSchema = {
  type: Type.OBJECT,
  properties: {
    cards: {
      type: Type.ARRAY,
      minItems: 1,
      maxItems: 20,
      items: {
        type: Type.OBJECT,
        properties: {
          promptRichText: { type: Type.STRING },
          answerRichText: { type: Type.STRING },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ['promptRichText', 'answerRichText'],
      },
    },
  },
  required: ['cards'],
};

const GradingResponseSchema = {
  type: Type.OBJECT,
  properties: {
    cardGradings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          cardId: { type: Type.STRING },
          correctness: { type: Type.STRING, enum: ['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT'] },
          explanation: { type: Type.STRING },
        },
        required: ['cardId', 'correctness', 'explanation'],
      },
    },
    confidence: { type: Type.NUMBER },
    gradePoint: { type: Type.NUMBER },
  },
  required: ['cardGradings'],
};

const ReviewInsightsResponseSchema = {
  type: Type.OBJECT,
  properties: {
    version: { type: Type.INTEGER },
    headline: { type: Type.STRING },
    summary: { type: Type.STRING },
    insights: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { type: Type.STRING, enum: ['WIN', 'IMPROVEMENT', 'FRICTION', 'PATTERN', 'REFLECTION_ALIGNMENT', 'REFLECTION_TENSION'] },
          title: { type: Type.STRING },
          body: { type: Type.STRING },
          evidenceIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          confidence: { type: Type.STRING, enum: ['LOW', 'MEDIUM', 'HIGH'] },
        },
        required: ['type', 'title', 'body', 'evidenceIds', 'confidence'],
      },
    },
    attentionNext: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['version', 'headline', 'summary', 'insights', 'attentionNext'],
};

@Injectable()
export class GeminiAiProvider implements IAiProvider {
  private readonly model: string;
  private readonly visionModel: string;

  constructor(
    config: ConfigService,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
    @Inject(TOKENS.AI_CREDENTIAL_REPOSITORY) private readonly credentials: IAiCredentialRepository,
    @Inject(TOKENS.AI_CREDENTIAL_CRYPTO) private readonly crypto: IAiCredentialCrypto,
  ) {
    this.model = config.get<string>(CONFIG_KEYS.geminiModel, AI_CONSTANTS.defaultGeminiModel);
    this.visionModel = config.get<string>(CONFIG_KEYS.geminiVisionModel, this.model);
  }

  generateCards(userId: string, pastedText: string): Promise<SuggestedCard[]> {
    return this.withFailover(userId, async (ai) => {
      const response = await ai.models.generateContent({
        model: this.model,
        contents: buildCardSuggestionPrompt(pastedText),
      });
      return parseCardSuggestionsJson(interactionText(response));
    });
  }

  generateReviewInsights(userId: string, input: ReviewInsightsInput): Promise<ReviewInsightsResultV1> {
    return this.withFailover(userId, async (ai) => {
      const response = await ai.models.generateContent({
        model: this.model,
        contents: buildReviewInsightsPrompt(input.context),
        config: {
          responseMimeType: AI_CONSTANTS.responseMimeType,
          responseSchema: ReviewInsightsResponseSchema,
        },
      });
      return parseReviewInsights(interactionText(response), input.context);
    });
  }

  reviewSession(userId: string, input: ReviewSessionInput): Promise<SessionFeedbackResult> {
    return this.withFailover(userId, async (ai) => {
      const summaryPrompt = buildSessionSummaryPrompt(input);
      const summaryResponse = await this.generateWithVisionFallback(ai, input, summaryPrompt);
      const grading = await this.generateSessionGradingWithClient(ai, input);
      return { summary: interactionText(summaryResponse), ...grading };
    });
  }

  async *streamCards(userId: string, pastedText: string): AsyncIterable<string> {
    yield* this.streamWithFailover(userId, (ai) =>
      this.streamGemini(ai, {
        model: this.model,
        contents: buildCardSuggestionPrompt(pastedText),
      }),
    );
  }

  async *streamSessionSummary(userId: string, input: ReviewSessionInput): AsyncIterable<string> {
    const prompt = buildSessionSummaryPrompt(input);
    yield* this.streamWithFailover(userId, (ai) =>
      this.streamGemini(
        ai,
        {
          model: this.hasImages(input) ? this.visionModel : this.model,
          contents: this.sessionContents(input, prompt),
        },
        this.hasImages(input) ? { model: this.model, contents: prompt } : undefined,
      ),
    );
  }

  generateSessionGrading(
    userId: string,
    input: ReviewSessionInput,
  ): Promise<{ cardGradings: CardGrading[]; confidence?: number; gradePoint?: number }> {
    return this.withFailover(userId, (ai) => this.generateSessionGradingWithClient(ai, input));
  }

  private async generateSessionGradingWithClient(ai: GoogleGenAI, input: ReviewSessionInput) {
    const prompt = buildSessionGradingPrompt(input);
    const response = await this.generateWithVisionFallback(ai, input, prompt, {
      responseMimeType: AI_CONSTANTS.responseMimeType,
      responseSchema: GradingResponseSchema,
    });
    return parseGradingJson(interactionText(response));
  }

  private async generateWithVisionFallback(
    ai: GoogleGenAI,
    input: ReviewSessionInput,
    prompt: string,
    config?: GenerateContentParameters['config'],
  ) {
    const request = {
      model: this.hasImages(input) ? this.visionModel : this.model,
      contents: this.sessionContents(input, prompt),
      ...(config ? { config } : {}),
    };

    try {
      return await ai.models.generateContent(request);
    } catch (error) {
      if (!this.hasImages(input) || !isImageCapabilityError(error)) throw error;
      this.logger.warn('Gemini image capability unavailable; retrying text-only');
      return ai.models.generateContent({ model: this.model, contents: prompt, ...(config ? { config } : {}) });
    }
  }

  private async *streamGemini(
    ai: GoogleGenAI,
    request: GenerateContentParameters,
    textOnlyRequest?: GenerateContentParameters,
  ): AsyncIterable<string> {
    let stream: AsyncIterable<{ text?: string }>;
    let emitted = false;
    try {
      stream = await ai.models.generateContentStream(request);
    } catch (error) {
      if (!textOnlyRequest || !isImageCapabilityError(error)) throw error;
      stream = await ai.models.generateContentStream(textOnlyRequest);
    }

    try {
      for await (const chunk of stream) {
        if (chunk.text) {
          emitted = true;
          yield chunk.text;
        }
      }
    } catch (error) {
      if (emitted || !textOnlyRequest || !isImageCapabilityError(error)) throw error;
      const fallbackStream = await ai.models.generateContentStream(textOnlyRequest);
      for await (const chunk of fallbackStream) {
        if (chunk.text) {
          emitted = true;
          yield chunk.text;
        }
      }
    }
  }

  private async *streamWithFailover(
    userId: string,
    operation: (ai: GoogleGenAI) => AsyncIterable<string>,
  ): AsyncIterable<string> {
    const candidates = await this.eligible(userId);
    let lastError: unknown;
    let emitted = false;

    for (let index = 0; index < candidates.length; index += 1) {
      const credential = candidates[index];
      await this.markUsed(credential);
      try {
        for await (const text of operation(this.client(credential))) {
          emitted = true;
          yield text;
        }
        await this.markHealthy(credential);
        return;
      } catch (error) {
        lastError = error;
        await this.markFailed(credential, error);
        if (emitted) {
          throw new GeminiProviderError(
            'Gemini streaming was interrupted after output started. Retry to continue.',
            'GEMINI_STREAM_INTERRUPTED',
          );
        }
        const classification = classifyGeminiError(error);
        const maxAttempts = classification.status === AiCredentialStatus.PROVIDER_ERROR ? 2 : candidates.length;
        if (index + 1 >= Math.min(maxAttempts, candidates.length)) throw error;
      }
    }

    throw lastError ?? geminiNotConfiguredError();
  }

  private async withFailover<T>(userId: string, operation: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
    const candidates = await this.eligible(userId);
    let lastError: unknown;

    for (let index = 0; index < candidates.length; index += 1) {
      const credential = candidates[index];
      await this.markUsed(credential);
      try {
        const result = await operation(this.client(credential));
        await this.markHealthy(credential);
        return result;
      } catch (error) {
        lastError = error;
        await this.markFailed(credential, error);
        const classification = classifyGeminiError(error);
        const maxAttempts = classification.status === AiCredentialStatus.PROVIDER_ERROR ? 2 : candidates.length;
        if (index + 1 >= Math.min(maxAttempts, candidates.length)) throw error;
      }
    }

    throw lastError ?? geminiNotConfiguredError();
  }

  private async eligible(userId: string): Promise<AiCredentialRecord[]> {
    const candidates = await this.credentials.listEligible(userId, new Date());
    if (candidates.length === 0) throw geminiNotConfiguredError();
    return candidates;
  }

  private client(credential: AiCredentialRecord): GoogleGenAI {
    return new GoogleGenAI({ apiKey: this.crypto.decrypt(credential.encryptedApiKey) });
  }

  private async markUsed(credential: AiCredentialRecord): Promise<void> {
    await this.credentials.update(credential.userId, credential.id, { lastUsedAt: new Date() });
  }

  private async markHealthy(credential: AiCredentialRecord): Promise<void> {
    await this.credentials.update(credential.userId, credential.id, {
      status: AiCredentialStatus.HEALTHY,
      lastError: null,
      cooldownUntil: null,
    });
  }

  private async markFailed(credential: AiCredentialRecord, error: unknown): Promise<void> {
    const classification = classifyGeminiError(error);
    await this.credentials.update(credential.userId, credential.id, {
      status: classification.status,
      lastError: errorText(error),
      cooldownUntil:
        classification.status === AiCredentialStatus.RATE_LIMITED
          ? new Date(Date.now() + (classification.retryAfterMs ?? 60_000))
          : null,
    });
    this.logger.error('Gemini request failed', { credentialId: credential.id, error: errorMessage(error) });
  }

  private hasImages(input: ReviewSessionInput): boolean {
    return input.reviews.some((review) => (review.images?.length ?? 0) > 0);
  }

  private sessionContents(input: ReviewSessionInput, prompt: string) {
    if (!this.hasImages(input)) return prompt;
    return [
      {
        role: 'user',
        parts: [
          { text: prompt },
          ...input.reviews.flatMap((review, reviewIndex) =>
            (review.images ?? []).flatMap((image) => [
              { text: `Image for Card ${reviewIndex + 1} (${review.cardId}), ${image.side} side:` },
              { inlineData: { mimeType: image.mimeType, data: image.data } },
            ]),
          ),
        ],
      },
    ];
  }
}
