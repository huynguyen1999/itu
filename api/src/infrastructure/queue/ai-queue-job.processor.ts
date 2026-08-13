import { Inject, Injectable } from '@nestjs/common';
import { AI_ERRORS } from '@core/application/constants/app.constants';
import { TOKENS } from '@core/application/constants/tokens';
import type {
  IAiFeedbackRepository,
  IAiJobRepository,
  IStudySessionRepository,
} from '@core/application/ports/out/repositories.port';
import type { AiJobModel } from '@core/domain/models';
import type { IAiProvider, ILogger, IMediaStorage } from '@core/application/ports/out/services.port';
import { JOURNAL_REPOSITORY, type IJournalRepository } from '@core/application/ports/out/journal-repository.port';
import { ReviewContextBuilder } from '@core/application/use-cases/review-context.builder';
import { generateAndSaveReviewInsights, reviewContextInput } from '@core/application/use-cases/review-insights.service';
import { hydrateSessionReviewImages } from '@core/application/use-cases/ai-session-images';
import type { AiQueueJob, AiQueueJobType } from './queue.types';

export type { AiQueueJob, AiQueueJobType };

@Injectable()
export class AiQueueJobProcessor {
  constructor(
    @Inject(TOKENS.AI_JOB_REPOSITORY) private readonly jobs: IAiJobRepository,
    @Inject(TOKENS.AI_FEEDBACK_REPOSITORY) private readonly feedback: IAiFeedbackRepository,
    @Inject(TOKENS.STUDY_SESSION_REPOSITORY) private readonly sessions: IStudySessionRepository,
    @Inject(TOKENS.AI_PROVIDER) private readonly ai: IAiProvider,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
    @Inject(TOKENS.MEDIA_STORAGE) private readonly media: IMediaStorage,
    @Inject(JOURNAL_REPOSITORY) private readonly journal: IJournalRepository,
    private readonly reviewContext: ReviewContextBuilder,
  ) {}

  async process(job: AiQueueJob): Promise<void> {
    this.logger.debug('AI job started from RabbitMQ', { jobId: job.jobId, type: job.type });
    if (job.type === 'card-suggestions') {
      await this.runCardSuggestions(job.jobId);
      return;
    }
    if (job.type === 'review-insights') {
      await this.runReviewInsights(job.jobId);
      return;
    }
    await this.runSessionFeedback(job.jobId);
  }

  private async runReviewInsights(jobId: string): Promise<void> {
    let entryId = '';
    try {
      await this.jobs.markRunning(jobId);
      const job = await this.findJobByKnownUser(jobId);
      const input = job.input as {
        entryId: string;
        reviewKind: 'DAILY' | 'WEEKLY';
        sourceEntryVersion: number;
        period: { startDate: string; endDate: string; timezone: string };
        promptVersion: 'review-insights-v1';
      };
      entryId = input.entryId;
      const entry = await this.journal.findById(job.userId, entryId);
      if (!entry) throw new Error('REVIEW_DELETED');
      if (entry.version !== input.sourceEntryVersion) {
        await this.jobs.markCompleted(jobId, { stale: true });
        return;
      }
      const reviewInput = reviewContextInput(entry, input.reviewKind, input.period);
      const context = await this.reviewContext.build(job.userId, reviewInput.range, reviewInput.reflections, entryId);
      const saved = await generateAndSaveReviewInsights(
        this.journal,
        this.ai,
        job.userId,
        entryId,
        input.sourceEntryVersion,
        jobId,
        context,
        input.promptVersion,
      );
      if (!saved) {
        await this.jobs.markCompleted(jobId, { stale: true });
        this.logger.warn('AI review insights completed against a changed review', { jobId, entryId });
        return;
      }
      await this.jobs.markCompleted(jobId, saved.weeklyReview?.aiInsightsSnapshot ?? saved.dailyReview?.aiInsightsSnapshot ?? {});
      this.logger.debug('AI review insights job completed', { jobId, entryId, userId: job.userId });
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error('AI review insights job failed', { jobId, entryId, error: message });
      await this.jobs.markFailed(jobId, message);
    }
  }

  private async runCardSuggestions(jobId: string): Promise<void> {
    try {
      await this.jobs.markRunning(jobId);
      const job = await this.findJobByKnownUser(jobId);
      const input = job.input as { pastedText: string };
      const output = await this.ai.generateCards(job.userId, input.pastedText);
      await this.jobs.markCompleted(jobId, { cards: output });
      this.logger.debug('AI card suggestion job completed', { jobId, cardCount: output.length });
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error('AI card suggestion job failed', { jobId, error: message });
      await this.jobs.markFailed(jobId, message);
    }
  }

  private async runSessionFeedback(jobId: string): Promise<void> {
    let userId = '';
    let sessionId = '';
    try {
      await this.jobs.markRunning(jobId);
      const job = await this.findJobByKnownUser(jobId);
      userId = job.userId;
      const input = job.input as { sessionId: string };
      sessionId = input.sessionId;
      const session = await this.sessions.findById(job.userId, input.sessionId);
      if (!session?.rating) throw new Error(AI_ERRORS.sessionIncomplete);
      const reviews = await hydrateSessionReviewImages(
        await this.sessions.sessionReviews(job.userId, input.sessionId),
        this.media,
        this.logger,
      );
      const output = await this.ai.reviewSession(job.userId, {
        rating: session.rating,
        reviewed: session.reviewed,
        correct: session.correct,
        reviews,
      });
      await this.feedback.create(job.userId, input.sessionId, {
        summary: output.summary,
        weakAreas: output.cardGradings.map((g) => JSON.stringify(g)),
        nextSteps: [],
        confidence: output.confidence,
      });
      await this.jobs.markCompleted(jobId, output);
      this.logger.debug('AI session feedback job completed', { jobId, sessionId: input.sessionId, userId: job.userId });
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error('AI session feedback job failed', { jobId, sessionId, userId, error: message });
      await this.jobs.markFailed(jobId, message);
    }
  }

  private async findJobByKnownUser(jobId: string): Promise<AiJobModel & { userId: string }> {
    const job = await this.jobs.findByIdAnyUser(jobId);
    if (!job) throw new Error(`AI job ${jobId} was not found`);
    if (!job.userId) throw new Error(`AI job ${jobId} is not attached to an active user`);
    return { ...job, userId: job.userId };
  }

  private errorMessage(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    const code = 'code' in error && typeof error.code === 'string' ? `${error.code}: ` : '';
    return `${code}${error.message}`;
  }
}
