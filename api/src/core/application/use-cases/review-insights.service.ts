import { createHash } from 'node:crypto';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { JOURNAL_REPOSITORY, type IJournalRepository } from '../ports/out/journal-repository.port';
import { TOKENS } from '../constants/tokens';
import type { IAiProvider } from '../ports/out/services.port';
import { ReviewContextBuilder, REVIEW_PROMPT_VERSION } from './review-context.builder';
import type { ReviewKind } from '@core/domain/review/review.types';
import type { JournalEntryModel } from '@core/domain/journal/journal.types';

@Injectable()
export class ReviewInsightsService {
  constructor(
    @Inject(JOURNAL_REPOSITORY) private readonly journal: IJournalRepository,
    @Inject(TOKENS.AI_PROVIDER) private readonly ai: IAiProvider,
    private readonly contextBuilder: ReviewContextBuilder,
  ) {}

  async generate(userId: string, entryId: string): Promise<JournalEntryModel> {
    const entry = await this.journal.findById(userId, entryId);
    if (!entry) throw new NotFoundException('Journal entry not found');

    const kind: ReviewKind | null =
      entry.kind === 'DAILY_REVIEW' ? 'DAILY' : entry.kind === 'WEEKLY_REVIEW' ? 'WEEKLY' : null;
    if (!kind) throw new ConflictException('Only daily and weekly reviews can generate insights.');
    const context =
      kind === 'DAILY'
        ? await this.buildDailyContext(userId, entry, entryId)
        : await this.buildWeeklyContext(userId, entry, entryId);
    const aiInputFingerprint = createHash('sha256').update(JSON.stringify(context)).digest('hex');
    const insights = await this.ai.generateReviewInsights(userId, { context, promptVersion: REVIEW_PROMPT_VERSION });
    const saved = await this.journal.saveReviewAiInsights(
      userId,
      entryId,
      entry.version,
      null,
      context.metrics,
      context.previousPeriod?.comparison,
      insights as unknown as Record<string, unknown>,
      aiInputFingerprint,
    );
    if (!saved) throw new ConflictException('Review changed while insights were generating. Save and regenerate.');
    return saved;
  }

  private buildDailyContext(userId: string, entry: JournalEntryModel, entryId: string) {
    const review = entry.dailyReview;
    if (!review) throw new ConflictException('Review data is missing.');
    return this.contextBuilder.build(
      userId,
      { kind: 'DAILY', startDate: review.periodDate, endDate: review.periodDate, timezone: entry.timezone },
      {
        wentWell: review.wentWellMarkdown ?? '',
        friction: review.frictionMarkdown ?? '',
        learned: review.learnedMarkdown ?? '',
        context: review.contextMarkdown ?? '',
      },
      entryId,
    );
  }

  private buildWeeklyContext(userId: string, entry: JournalEntryModel, entryId: string) {
    const review = entry.weeklyReview;
    if (!review) throw new ConflictException('Review data is missing.');
    return this.contextBuilder.build(
      userId,
      { kind: 'WEEKLY', startDate: review.periodStart, endDate: review.periodEnd, timezone: entry.timezone },
      {
        wentWell: review.wentWellMarkdown ?? '',
        friction: review.frictionMarkdown ?? '',
        learned: review.learnedMarkdown ?? '',
        differentFromLastWeek: review.differentFromLastWeekMarkdown ?? '',
        nextWeek: review.nextWeekMarkdown ?? '',
      },
      entryId,
    );
  }
}
