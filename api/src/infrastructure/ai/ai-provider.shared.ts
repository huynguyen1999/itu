import { z } from 'zod';
import { AI_ERRORS } from '@core/application/constants/app.constants';
import type { SuggestedCard } from '@core/application/ports/in/ai-use-case.port';
import type {
  CardGrading,
  ReviewSessionInput,
  SessionFeedbackResult,
} from '@core/application/ports/out/service-types.port';

const CardSuggestionItemSchema = z.object({
  promptRichText: z.string(),
  answerRichText: z.string(),
  tags: z.array(z.string()).default([]),
});

const CardSuggestionArraySchema = z.array(CardSuggestionItemSchema).min(1).max(20);

export const CardSuggestionSchema = z
  .union([
    z.object({
      cards: CardSuggestionArraySchema,
    }),
    CardSuggestionArraySchema,
  ])
  .transform((value) => (Array.isArray(value) ? value : value.cards));

export const CardGradingSchema = z.object({
  cardId: z.string(),
  correctness: z.enum(['CORRECT', 'PARTIALLY_CORRECT', 'INCORRECT']),
  explanation: z.string(),
});

export const FeedbackSchema = z.object({
  summary: z.string(),
  cardGradings: z.array(CardGradingSchema).default([]),
  confidence: z.coerce.number().min(0).max(1).optional(),
});

export const GradingSchema = z.object({
  cardGradings: z.array(CardGradingSchema).default([]),
  confidence: z.coerce.number().min(0).max(1).optional(),
  gradePoint: z.coerce.number().min(0).max(100).optional(),
});

export function buildCardSuggestionPrompt(pastedText: string): string {
  return `Create concise flashcards from this study text. Use the following format for each card, separating cards with "---":

Front: [Flashcard question/prompt in Markdown]
Back: [Flashcard answer in Markdown]
Tags: [Comma-separated tags, optional]

Do not use JSON formatting. Make sure to follow the format exactly.
Study text:
${pastedText}`;
}

export function buildSessionSummaryPrompt(input: ReviewSessionInput): string {
  const reviewedCards = input.reviews
    .map((review, index) => {
      const question = review.direction === 'BACK_TO_FRONT' ? review.answerRichText : review.promptRichText;
      const correctAnswer = review.direction === 'BACK_TO_FRONT' ? review.promptRichText : review.answerRichText;
      return [
        `Card ${index + 1}`,
        `Direction: ${review.direction}`,
        `Grade: ${review.grade}`,
        `Question: ${stripHtml(question)}`,
        `Correct answer: ${stripHtml(correctAnswer)}`,
        `Learner answer: ${review.userAnswer?.trim() || '(not provided)'}`,
      ].join('\n');
    })
    .join('\n\n');

  return [
    "You are a friendly and helpful tutor reviewing a learner's study session. Write a short, personalized study summary in Markdown based only on the card results and answers below.",
    "Keep the summary at 100 words or fewer. Do not mention or infer the learner's self-rating.",
    'Do not output JSON or HTML. Directly output the summary text.',
    '',
    `Cards reviewed: ${input.reviewed}`,
    `Remembered: ${input.correct}`,
    '',
    'Reviewed flashcards:',
    reviewedCards || '(No reviewed cards were recorded.)',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export function buildSessionGradingPrompt(input: ReviewSessionInput): string {
  const reviewedCards = input.reviews
    .map((review, index) => {
      const question = review.direction === 'BACK_TO_FRONT' ? review.answerRichText : review.promptRichText;
      const correctAnswer = review.direction === 'BACK_TO_FRONT' ? review.promptRichText : review.answerRichText;
      return [
        `Card ${index + 1}`,
        `Card ID: ${review.cardId}`,
        `Question: ${stripHtml(question)}`,
        `Correct Answer: ${stripHtml(correctAnswer)}`,
        `Learner Answer: ${review.userAnswer?.trim() || '(not provided)'}`,
      ].join('\n');
    })
    .join('\n\n');

  return [
    "You are evaluating a learner's study session. For each card, evaluate the correctness of the Learner Answer compared to the Correct Answer.",
    'Also calculate an overall session gradePoint (a number from 0 to 100, where 100 is perfectly correct for all answers).',
    'Return JSON only in this exact shape: {"confidence":0.85,"gradePoint":85,"cardGradings":[{"cardId":"...","correctness":"CORRECT"|"PARTIALLY_CORRECT"|"INCORRECT","explanation":"..."}]}.',
    'Where correctness must be exactly one of "CORRECT", "PARTIALLY_CORRECT", or "INCORRECT", and explanation explains why the answer was graded this way.',
    '',
    `Cards reviewed: ${input.reviewed}`,
    `Remembered: ${input.correct}`,
    '',
    'Reviewed flashcards:',
    reviewedCards || '(No reviewed cards were recorded.)',
  ].join('\n');
}

export function parseCardsFromText(text: string): SuggestedCard[] {
  const cards: SuggestedCard[] = [];
  const blocks = text.split(/(?:^|\n)(?:---|\*\*\*|=== CARD ===|Card \d+:)\s*\n?/i);

  for (const block of blocks) {
    const lines = block.split('\n');
    let promptRichText = '';
    let answerRichText = '';
    let tags: string[] = [];

    let currentField: 'prompt' | 'answer' | 'tags' | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      const frontMatch = line.match(/^(?:Front|Question|Q|Prompt)\s*:\s*(.*)/i);
      const backMatch = line.match(/^(?:Back|Answer|A)\s*:\s*(.*)/i);
      const tagsMatch = line.match(/^(?:Tags|Tag)\s*:\s*(.*)/i);

      if (frontMatch) {
        currentField = 'prompt';
        promptRichText = (promptRichText ? promptRichText + '\n' : '') + frontMatch[1];
      } else if (backMatch) {
        currentField = 'answer';
        answerRichText = (answerRichText ? answerRichText + '\n' : '') + backMatch[1];
      } else if (tagsMatch) {
        currentField = 'tags';
        const tagsString = tagsMatch[1];
        tags = tagsString
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
      } else {
        if (currentField === 'prompt') {
          promptRichText = (promptRichText ? promptRichText + '\n' : '') + line;
        } else if (currentField === 'answer') {
          answerRichText = (answerRichText ? answerRichText + '\n' : '') + line;
        }
      }
    }

    const cleanPrompt = promptRichText.trim();
    const cleanAnswer = answerRichText.trim();

    if (cleanPrompt || cleanAnswer) {
      cards.push({
        promptRichText: cleanPrompt,
        answerRichText: cleanAnswer,
        tags,
      });
    }
  }

  return cards;
}

export function parseCardSuggestionsJson(text: string): SuggestedCard[] {
  // Try JSON first for backwards compatibility / fallback scenarios
  try {
    const cleanText = text
      .replace(/^```json\s*/i, '')
      .replace(/```$/, '')
      .trim();
    const parsed = JSON.parse(cleanText);
    return CardSuggestionSchema.parse(parsed);
  } catch {
    return parseCardsFromText(text);
  }
}

export function parseFeedbackJson(text: string): SessionFeedbackResult {
  const cleanText = text
    .replace(/^```json\s*/i, '')
    .replace(/```$/, '')
    .trim();
  return FeedbackSchema.parse(JSON.parse(cleanText)) as SessionFeedbackResult;
}

export function parseGradingJson(text: string): {
  cardGradings: CardGrading[];
  confidence?: number;
  gradePoint?: number;
} {
  const cleanText = text
    .replace(/^```json\s*/i, '')
    .replace(/```$/, '')
    .trim();
  const parsed = JSON.parse(cleanText);
  const validated = GradingSchema.parse(parsed);
  return {
    cardGradings: validated.cardGradings,
    confidence: validated.confidence,
    gradePoint: validated.gradePoint,
  };
}

export function interactionText(response: unknown): string {
  if (hasStringProperty(response, 'text')) {
    return response.text;
  }
  if (hasFunctionProperty(response, 'text')) {
    return response.text();
  }
  const direct = firstStringProperty(response, ['output_text', 'outputText']);
  if (direct) return direct;
  const candidate = firstCandidateText(response);
  if (candidate) return candidate;
  const text = outputItems(response)
    .map((output) => firstStringProperty(output, ['text', 'content']) ?? '')
    .join('\n')
    .trim();
  if (text) return text;
  throw new Error(AI_ERRORS.missingResponseText);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function firstCandidateText(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const candidates = (value as Record<string, unknown>).candidates;
  if (!Array.isArray(candidates)) return undefined;

  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const content = (candidate as Record<string, unknown>).content;
    if (typeof content !== 'object' || content === null) continue;
    const parts = (content as Record<string, unknown>).parts;
    if (!Array.isArray(parts)) continue;

    const text = parts
      .map((part) => firstStringProperty(part, ['text']))
      .filter((partText): partText is string => Boolean(partText))
      .join('\n')
      .trim();
    if (text) return text;
  }

  return undefined;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasStringProperty<T extends string>(value: unknown, key: T): value is Record<T, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    key in value &&
    typeof (value as Record<T, unknown>)[key] === 'string'
  );
}

function hasFunctionProperty<T extends string>(value: unknown, key: T): value is Record<T, () => string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    key in value &&
    typeof (value as Record<T, unknown>)[key] === 'function'
  );
}

function firstStringProperty(value: unknown, keys: string[]): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (typeof record[key] === 'string') return record[key];
  }
  return undefined;
}

function outputItems(value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null) return [];
  const outputs = (value as Record<string, unknown>).outputs;
  return Array.isArray(outputs) ? outputs : [];
}
