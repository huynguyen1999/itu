import { Inject, Injectable } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
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

@Injectable()
export class AiService implements IAiUseCase {
  constructor(
    @Inject(TOKENS.AI_JOB_REPOSITORY) private readonly jobs: IAiJobRepository,
    @Inject(TOKENS.AI_FEEDBACK_REPOSITORY) private readonly feedback: IAiFeedbackRepository,
    @Inject(TOKENS.STUDY_SESSION_REPOSITORY) private readonly sessions: IStudySessionRepository,
    @Inject(TOKENS.QUEUE_JOB_HANDLER) private readonly queue: IQueueJobHandler,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
    @Inject(TOKENS.AI_PROVIDER) private readonly ai: IAiProvider,
    @Inject(TOKENS.MEDIA_STORAGE) private readonly media: IMediaStorage,
    private readonly credentials: AiCredentialsService,
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
