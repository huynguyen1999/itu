import type { IAiUseCase } from '@core/application/ports/in/ai-use-case.port';
import type {
  IAiFeedbackRepository,
  IAiJobRepository,
  IStudySessionRepository,
} from '@core/application/ports/out/repositories.port';
import type { IAiProvider, ILogger, IMediaStorage, IQueueJobHandler } from '@core/application/ports/out/services.port';
import type { CardGrading } from '@core/application/ports/out/service-types.port';
import { AiJobType } from '@core/domain/enums';
import { AiJobModel, AiSessionFeedbackModel } from '@core/domain/models';
import { EntityNotFoundException } from '@core/domain/exceptions';
import { hydrateSessionReviewImages } from './ai-session-images';
import { AiCredentialsService } from './ai-credentials.service';
import { JOURNAL_REPOSITORY, type IJournalRepository } from '@core/application/ports/out/journal-repository.port';

export class AiService implements IAiUseCase {
  constructor(
    private readonly jobs: IAiJobRepository,
    private readonly feedback: IAiFeedbackRepository,
    private readonly sessions: IStudySessionRepository,
    private readonly queue: IQueueJobHandler,
    private readonly logger: ILogger,
    private readonly ai: IAiProvider,
    private readonly media: IMediaStorage,
    private readonly credentials: AiCredentialsService,
    private readonly journal: IJournalRepository,
  ) {}

  async suggestCards(userId: string, pastedText: string): Promise<AiJobModel> {
    await this.credentials.assertUsable(userId);
    const job = await this.jobs.create(userId, AiJobType.CARD_GENERATION, { pastedText });
    try {
      await this.queue.enqueueCardSuggestions(job.id);
    } catch (error) {
      const message = this.errorMessage(error);
      await this.jobs.markFailed(job.id, message);
      this.logger.error('AI card suggestion job enqueue failed', { jobId: job.id, userId, error: message });
      throw error;
    }
    this.logger.debug('AI card suggestion job enqueued', { jobId: job.id, userId });
    return job;
  }

  async requestSessionFeedback(userId: string, sessionId: string): Promise<AiJobModel> {
    const session = await this.sessions.findById(userId, sessionId);
    if (!session) throw new EntityNotFoundException('StudySession', sessionId);
    await this.credentials.assertUsable(userId);
    const job = await this.jobs.create(userId, AiJobType.SESSION_FEEDBACK, { sessionId });
    try {
      await this.queue.enqueueSessionFeedback(job.id);
    } catch (error) {
      const message = this.errorMessage(error);
      await this.jobs.markFailed(job.id, message);
      this.logger.error('AI session feedback job enqueue failed', { jobId: job.id, sessionId, userId, error: message });
      throw error;
    }
    this.logger.debug('AI session feedback job enqueued', { jobId: job.id, sessionId, userId });
    return job;
  }

  async requestReviewInsights(userId: string, entryId: string, expectedVersion: number): Promise<AiJobModel> {
    const entry = await this.journal.findById(userId, entryId);
    if (!entry) throw new EntityNotFoundException('JournalEntry', entryId);
    if (entry.version !== expectedVersion) throw new Error('REVIEW_VERSION_MISMATCH');
    const reviewKind = entry.kind === 'DAILY_REVIEW' ? 'DAILY' : entry.kind === 'WEEKLY_REVIEW' ? 'WEEKLY' : null;
    if (!reviewKind) throw new Error('REVIEW_KIND_REQUIRED');
    const review = reviewKind === 'DAILY' ? entry.dailyReview : entry.weeklyReview;
    if (!review) throw new Error('REVIEW_DATA_MISSING');
    await this.credentials.assertUsable(userId);
    const job = await this.jobs.create(userId, AiJobType.REVIEW_INSIGHTS, {
      entryId,
      reviewKind,
      sourceEntryVersion: expectedVersion,
      period: {
        startDate: reviewKind === 'DAILY' ? entry.dailyReview!.periodDate : entry.weeklyReview!.periodStart,
        endDate: reviewKind === 'DAILY' ? entry.dailyReview!.periodDate : entry.weeklyReview!.periodEnd,
        timezone: entry.timezone,
      },
      promptVersion: 'review-insights-v1',
    });
    try {
      if (!this.queue.enqueueReviewInsights) throw new Error('REVIEW_INSIGHTS_QUEUE_UNAVAILABLE');
      await this.queue.enqueueReviewInsights(job.id);
    } catch (error) {
      const message = this.errorMessage(error);
      await this.jobs.markFailed(job.id, message);
      this.logger.error('AI review insights job enqueue failed', { jobId: job.id, entryId, userId, error: message });
      throw error;
    }
    this.logger.debug('AI review insights job enqueued', { jobId: job.id, entryId, userId });
    return job;
  }

  async getJob(userId: string, jobId: string): Promise<AiJobModel> {
    const job = await this.jobs.findById(userId, jobId);
    if (!job) throw new EntityNotFoundException('AiJob', jobId);
    return job;
  }

  getSessionFeedback(userId: string, sessionId: string): Promise<AiSessionFeedbackModel | null> {
    return this.feedback.findBySession(userId, sessionId);
  }

  async streamCards(userId: string, pastedText: string): Promise<AsyncIterable<string>> {
    await this.credentials.assertUsable(userId);
    this.logger.debug('Starting real-time streaming for card suggestions', { userId, textLength: pastedText.length });
    return this.ai.streamCards(userId, pastedText);
  }

  async streamSessionSummary(userId: string, sessionId: string): Promise<AsyncIterable<string>> {
    this.logger.debug('Starting real-time streaming for session summary', { userId, sessionId });
    const session = await this.sessions.findById(userId, sessionId);
    if (!session) throw new EntityNotFoundException('StudySession', sessionId);
    await this.credentials.assertUsable(userId);
    const reviews = await hydrateSessionReviewImages(
      await this.sessions.sessionReviews(userId, sessionId),
      this.media,
      this.logger,
    );

    return this.ai.streamSessionSummary(userId, {
      rating: session.rating ?? undefined,
      reviewed: session.reviewed,
      correct: session.correct,
      reviews,
    });
  }

  async generateSessionGrading(
    userId: string,
    sessionId: string,
    summary: string,
  ): Promise<{ cardGradings: CardGrading[]; confidence?: number; gradePoint?: number }> {
    this.logger.debug('Generating and saving session grading', { userId, sessionId });
    const session = await this.sessions.findById(userId, sessionId);
    if (!session) throw new EntityNotFoundException('StudySession', sessionId);
    await this.credentials.assertUsable(userId);
    const reviews = await hydrateSessionReviewImages(
      await this.sessions.sessionReviews(userId, sessionId),
      this.media,
      this.logger,
    );

    const input = {
      rating: session.rating ?? undefined,
      reviewed: session.reviewed,
      correct: session.correct,
      reviews,
    };

    const grading = await this.ai.generateSessionGrading(userId, input);
    await this.feedback.create(userId, sessionId, {
      summary,
      weakAreas: grading.cardGradings.map((g) => JSON.stringify(g)),
      nextSteps: grading.gradePoint !== undefined ? [String(grading.gradePoint)] : [],
      confidence: grading.confidence,
    });
    return grading;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
