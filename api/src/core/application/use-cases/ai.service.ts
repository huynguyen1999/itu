import { IAiUseCase } from '@core/application/ports/in/ai-use-case.port';
import {
  IAiFeedbackRepository,
  IAiJobRepository,
  IStudySessionRepository,
} from '@core/application/ports/out/repositories.port';
import { IAiProvider, ILogger, IMediaStorage, IQueueJobHandler } from '@core/application/ports/out/services.port';
import { CardGrading } from '@core/application/ports/out/service-types.port';
import { AiJobType } from '@core/domain/enums';
import { AiJobModel, AiSessionFeedbackModel } from '@core/domain/models';
import { EntityNotFoundException } from '@core/domain/exceptions';
import { AI_CONSTANTS } from '@core/application/constants/app.constants';
import { hydrateSessionReviewImages } from './ai-session-images';

export class AiService implements IAiUseCase {
  constructor(
    private readonly jobs: IAiJobRepository,
    private readonly feedback: IAiFeedbackRepository,
    private readonly sessions: IStudySessionRepository,
    private readonly queue: IQueueJobHandler,
    private readonly logger: ILogger,
    private readonly ai: IAiProvider,
    private readonly media: IMediaStorage,
  ) {}

  async suggestCards(userId: string, pastedText: string): Promise<AiJobModel> {
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
    this.logger.debug('Starting real-time streaming for card suggestions', { userId, textLength: pastedText.length });
    return this.ai.streamCards(pastedText);
  }

  async streamSessionSummary(userId: string, sessionId: string): Promise<AsyncIterable<string>> {
    this.logger.debug('Starting real-time streaming for session summary', { userId, sessionId });
    const session = await this.sessions.findById(userId, sessionId);
    if (!session) throw new EntityNotFoundException('StudySession', sessionId);
    const reviews = await hydrateSessionReviewImages(
      await this.sessions.sessionReviews(userId, sessionId),
      this.media,
      this.logger,
    );

    return this.ai.streamSessionSummary({
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

    try {
      const grading = await this.ai.generateSessionGrading(input);
      await this.feedback.create(userId, sessionId, {
        summary,
        weakAreas: grading.cardGradings.map((g) => JSON.stringify(g)),
        nextSteps: grading.gradePoint !== undefined ? [String(grading.gradePoint)] : [],
        confidence: grading.confidence,
      });
      return grading;
    } catch (error) {
      const message = this.errorMessage(error);
      this.logger.error('Failed to generate or save session grading', { userId, sessionId, error: message });
      const fallbackGrading = {
        cardGradings: reviews.map((r) => ({
          cardId: r.cardId,
          correctness: r.grade === 'AGAIN' ? ('INCORRECT' as const) : ('CORRECT' as const),
          explanation: `Learner marked this card as ${r.grade}.`,
        })),
        confidence: AI_CONSTANTS.fallbackConfidence,
        gradePoint: Math.round((session.correct / (session.reviewed || 1)) * 100),
      };
      await this.feedback.create(userId, sessionId, {
        summary,
        weakAreas: fallbackGrading.cardGradings.map((g) => JSON.stringify(g)),
        nextSteps: [String(fallbackGrading.gradePoint)],
        confidence: fallbackGrading.confidence,
      });
      return fallbackGrading;
    }
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
