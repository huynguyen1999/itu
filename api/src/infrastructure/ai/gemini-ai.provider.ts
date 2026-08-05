import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI, Type } from '@google/genai';
import { AI_CONSTANTS, CONFIG_KEYS } from '@core/application/constants/app.constants';
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
  interactionText,
  parseCardSuggestionsJson,
  parseGradingJson,
} from './ai-provider.shared';

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
          tags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
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
          correctness: {
            type: Type.STRING,
            enum: ['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT'],
          },
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

@Injectable()
export class GeminiAiProvider implements IAiProvider {
  private readonly ai: GoogleGenAI | null;
  private readonly model: string;
  private readonly visionModel: string;

  constructor(
    config: ConfigService,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
  ) {
    const apiKey = config.get<string>(CONFIG_KEYS.geminiApiKey);
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
    this.model = config.get<string>(CONFIG_KEYS.geminiModel, AI_CONSTANTS.defaultGeminiModel);
    this.visionModel = config.get<string>(CONFIG_KEYS.geminiVisionModel, this.model);
    this.logger.debug('Gemini AI provider initialized', {
      model: this.model,
      configured: Boolean(this.ai),
    });
  }

  async generateCards(pastedText: string): Promise<SuggestedCard[]> {
    if (!this.ai) {
      const cards = fallbackCards(pastedText);
      this.logger.warn('Gemini API key is not configured, using fallback card suggestions', {
        cardCount: cards.length,
      });
      return cards;
    }

    try {
      this.logger.debug('Requesting Gemini card suggestions', { model: this.model, textLength: pastedText.length });
      const response = await this.ai.models.generateContent({
        model: this.model,
        contents: buildCardSuggestionPrompt(pastedText),
      });
      const text = interactionText(response);
      const cards = parseCardSuggestionsJson(text);
      this.logger.debug('Gemini card suggestions parsed', { cardCount: cards.length });
      return cards;
    } catch (error) {
      this.logger.error('Gemini card suggestion generation failed', { error: errorMessage(error) });
      throw error;
    }
  }

  async reviewSession(input: ReviewSessionInput): Promise<SessionFeedbackResult> {
    if (!this.ai) {
      return fallbackSessionFeedback(input);
    }
    try {
      const summaryPrompt = buildSessionSummaryPrompt(input);
      let summaryResponse;
      try {
        summaryResponse = await this.ai.models.generateContent({
          model: this.hasImages(input) ? this.visionModel : this.model,
          contents: this.sessionContents(input, summaryPrompt),
        });
      } catch (error) {
        if (!this.hasImages(input)) throw error;
        this.logger.warn('Gemini vision feedback failed; retrying text-only', { error: errorMessage(error) });
        summaryResponse = await this.ai.models.generateContent({ model: this.model, contents: summaryPrompt });
      }
      const summary = interactionText(summaryResponse);

      const grading = await this.generateSessionGrading(input);

      return {
        summary,
        ...grading,
      };
    } catch (error) {
      this.logger.error('Gemini session review failed', { error: errorMessage(error) });
      throw error;
    }
  }

  async *streamCards(pastedText: string): AsyncIterable<string> {
    if (!this.ai) {
      const cards = fallbackCards(pastedText);
      yield cards.map((c) => `Front: ${c.promptRichText}\nBack: ${c.answerRichText}`).join('\n---\n');
      return;
    }

    try {
      this.logger.debug('Streaming Gemini card suggestions', { model: this.model, textLength: pastedText.length });
      const responseStream = await this.ai.models.generateContentStream({
        model: this.model,
        contents: buildCardSuggestionPrompt(pastedText),
      });

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      this.logger.error('Gemini card suggestion streaming failed', { error: errorMessage(error) });
      throw error;
    }
  }

  async *streamSessionSummary(input: ReviewSessionInput): AsyncIterable<string> {
    if (!this.ai) {
      const feedback = fallbackSessionFeedback(input);
      yield feedback.summary;
      return;
    }

    try {
      this.logger.debug('Streaming Gemini session summary', { model: this.model });
      const prompt = buildSessionSummaryPrompt(input);
      let responseStream;
      try {
        responseStream = await this.ai.models.generateContentStream({
          model: this.hasImages(input) ? this.visionModel : this.model,
          contents: this.sessionContents(input, prompt),
        });
      } catch (error) {
        if (!this.hasImages(input)) throw error;
        this.logger.warn('Gemini vision summary failed; retrying text-only', { error: errorMessage(error) });
        responseStream = await this.ai.models.generateContentStream({ model: this.model, contents: prompt });
      }

      for await (const chunk of responseStream) {
        const text = chunk.text;
        if (text) {
          yield text;
        }
      }
    } catch (error) {
      this.logger.error('Gemini session summary streaming failed', { error: errorMessage(error) });
      throw error;
    }
  }

  async generateSessionGrading(
    input: ReviewSessionInput,
  ): Promise<{ cardGradings: CardGrading[]; confidence?: number; gradePoint?: number }> {
    if (!this.ai) {
      const fallback = fallbackSessionFeedback(input);
      return {
        cardGradings: fallback.cardGradings,
        confidence: fallback.confidence,
        gradePoint: fallback.gradePoint,
      };
    }
    try {
      this.logger.debug('Generating Gemini session grading', { model: this.model });
      const prompt = buildSessionGradingPrompt(input);
      let response;
      try {
        response = await this.ai.models.generateContent({
          model: this.hasImages(input) ? this.visionModel : this.model,
          contents: this.sessionContents(input, prompt),
          config: {
            responseMimeType: AI_CONSTANTS.responseMimeType,
            responseSchema: GradingResponseSchema,
          },
        });
      } catch (error) {
        if (!this.hasImages(input)) throw error;
        this.logger.warn('Gemini vision grading failed; retrying text-only', { error: errorMessage(error) });
        response = await this.ai.models.generateContent({
          model: this.model,
          contents: prompt,
          config: {
            responseMimeType: AI_CONSTANTS.responseMimeType,
            responseSchema: GradingResponseSchema,
          },
        });
      }
      const text = interactionText(response);
      return parseGradingJson(text);
    } catch (error) {
      this.logger.error('Gemini session grading generation failed', { error: errorMessage(error) });
      throw error;
    }
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
