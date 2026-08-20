import type { IJournalRepository } from '../ports/out/journal-repository.port';
import type { IAiProvider } from '../ports/out/services.port';
import type { ReviewRangeInput } from '../ports/out/review-data-source.port';
import { ReviewContextBuilder, REVIEW_PROMPT_VERSION } from './review-context.builder';
import type { ReviewContextV1, ReviewKind, ReviewInsightsResultV1 } from '@core/domain/review/review.types';
import type { JournalEntryModel } from '@core/domain/journal/journal.types';
import { ResourceConflictException, ResourceNotFoundException } from '@core/domain/exceptions';

export function reviewContextInput(
  entry: JournalEntryModel,
  kind: ReviewKind,
  period?: Omit<ReviewRangeInput, 'kind'>,
): { range: ReviewRangeInput; reflections: Record<string, string> } {
  if (kind === 'DAILY') {
    const review = entry.dailyReview;
    if (!review) throw new ResourceConflictException('Review data is missing.');
    return {
      range: {
        kind,
        startDate: period?.startDate ?? review.periodDate,
        endDate: period?.endDate ?? review.periodDate,
        timezone: period?.timezone ?? entry.timezone,
      },
      reflections: {
        wentWell: review.wentWellMarkdown ?? '',
        friction: review.frictionMarkdown ?? '',
        learned: review.learnedMarkdown ?? '',
        context: review.contextMarkdown ?? '',
      },
    };
  }

  const review = entry.weeklyReview;
  if (!review) throw new ResourceConflictException('Review data is missing.');
  return {
    range: {
      kind,
      startDate: period?.startDate ?? review.periodStart,
      endDate: period?.endDate ?? review.periodEnd,
      timezone: period?.timezone ?? entry.timezone,
    },
    reflections: {
      wentWell: review.wentWellMarkdown ?? '',
      friction: review.frictionMarkdown ?? '',
      learned: review.learnedMarkdown ?? '',
      differentFromLastWeek: review.differentFromLastWeekMarkdown ?? '',
      nextWeek: review.nextWeekMarkdown ?? '',
    },
  };
}

export async function generateAndSaveReviewInsights(
  journal: IJournalRepository,
  ai: IAiProvider,
  userId: string,
  entryId: string,
  sourceEntryVersion: number,
  generationId: string | null,
  context: ReviewContextV1,
  promptVersion: 'review-insights-v1' = REVIEW_PROMPT_VERSION,
): Promise<JournalEntryModel | null> {
  const insights: ReviewInsightsResultV1 = await ai.generateReviewInsights(userId, { context, promptVersion });
  return journal.saveReviewAiInsights(
    userId,
    entryId,
    sourceEntryVersion,
    generationId,
    context.metrics,
    context.previousPeriod?.comparison,
    insights as unknown as Record<string, unknown>,
  );
}

export class ReviewInsightsService {
  constructor(
    private readonly journal: IJournalRepository,
    private readonly ai: IAiProvider,
    private readonly contextBuilder: ReviewContextBuilder,
  ) {}

  async generate(userId: string, entryId: string): Promise<JournalEntryModel> {
    const entry = await this.journal.findById(userId, entryId);
    if (!entry) throw new ResourceNotFoundException('Journal entry not found');

    const kind: ReviewKind | null =
      entry.kind === 'DAILY_REVIEW' ? 'DAILY' : entry.kind === 'WEEKLY_REVIEW' ? 'WEEKLY' : null;
    if (!kind) throw new ResourceConflictException('Only daily and weekly reviews can generate insights.');
    const input = reviewContextInput(entry, kind);
    const context = await this.contextBuilder.build(userId, input.range, input.reflections, entryId);
    const saved = await generateAndSaveReviewInsights(this.journal, this.ai, userId, entryId, entry.version, null, context);
    if (!saved) throw new ResourceConflictException('Review changed while insights were generating. Save and regenerate.');
    return saved;
  }
}
