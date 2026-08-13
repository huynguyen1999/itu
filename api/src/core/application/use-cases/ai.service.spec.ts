import { AiService } from './ai.service';
import type {
  IAiFeedbackRepository,
  IAiJobRepository,
  IStudySessionRepository,
} from '@core/application/ports/out/repositories.port';
import type { IAiProvider, ILogger, IQueueJobHandler } from '@core/application/ports/out/services.port';
import type { AiCredentialsService } from './ai-credentials.service';
import { AiJobStatus, AiJobType } from '@core/domain/enums';
import type { AiJobModel } from '@core/domain/models';

describe('AiService', () => {
  const userId = 'user-1';
  const job: AiJobModel = {
    id: 'job-1',
    userId,
    type: AiJobType.CARD_GENERATION,
    status: AiJobStatus.QUEUED,
    input: { pastedText: 'Photosynthesis makes glucose.' },
    attempts: 0,
    createdAt: new Date('2026-07-09T00:00:00.000Z'),
  };

  let jobs: jest.Mocked<IAiJobRepository>;
  let feedback: jest.Mocked<IAiFeedbackRepository>;
  let sessions: jest.Mocked<IStudySessionRepository>;
  let queue: jest.Mocked<IQueueJobHandler>;
  let logger: jest.Mocked<ILogger>;
  let ai: jest.Mocked<IAiProvider>;
  let service: AiService;

  beforeEach(() => {
    jobs = {
      create: jest.fn().mockResolvedValue(job),
      findById: jest.fn(),
      findByIdAnyUser: jest.fn(),
      markCompleted: jest.fn(),
      markFailed: jest.fn(),
      markRunning: jest.fn(),
    };
    feedback = {
      create: jest.fn(),
      findBySession: jest.fn(),
    };
    sessions = {
      activeRecallTrend: jest.fn(),
      addReviewLog: jest.fn(),
      complete: jest.fn(),
      countCompletedBetween: jest.fn(),
      countCompletedOnOrAfter: jest.fn(),
      create: jest.fn(),
      deckStats: jest.fn(),
      findById: jest.fn(),
      recent: jest.fn(),
      retentionRate: jest.fn(),
      studyCalendar: jest.fn(),
      sessionHistory: jest.fn(),
      sessionReviews: jest.fn(),
      sessionStats: jest.fn(),
    };
    queue = {
      enqueueCardSuggestions: jest.fn(),
      enqueueSessionFeedback: jest.fn(),
      enqueueReviewInsights: jest.fn(),
      enqueueScheduledJob: jest.fn(),
      enqueueSyncInvalidation: jest.fn(),
    };
    logger = {
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
    };
    ai = {
      generateCards: jest.fn(),
      reviewSession: jest.fn(),
      streamCards: jest.fn(),
      streamSessionSummary: jest.fn(),
      generateSessionGrading: jest.fn(),
      generateReviewInsights: jest.fn(),
    };
    const journal = {
      findById: jest.fn(),
    } as any;
    service = new AiService(
      jobs,
      feedback,
      sessions,
      queue,
      logger,
      ai,
      {
        storeCardImage: jest.fn(),
        storeUserImage: jest.fn(),
        storeAudio: jest.fn(),
        storeRawBuffer: jest.fn(),
        read: jest.fn(),
        delete: jest.fn(),
      },
      { assertUsable: jest.fn() } as unknown as AiCredentialsService,
      journal,
    );
  });

  it('marks a created card suggestion job failed when RabbitMQ enqueue fails', async () => {
    const error = new Error('RabbitMQ unavailable');
    queue.enqueueCardSuggestions.mockRejectedValue(error);

    await expect(service.suggestCards(userId, 'Photosynthesis makes glucose.')).rejects.toThrow(error);

    expect(jobs.create).toHaveBeenCalledWith(userId, AiJobType.CARD_GENERATION, {
      pastedText: 'Photosynthesis makes glucose.',
    });
    expect(jobs.markFailed).toHaveBeenCalledWith(job.id, 'RabbitMQ unavailable');
    expect(logger.error).toHaveBeenCalledWith('AI card suggestion job enqueue failed', {
      jobId: job.id,
      userId,
      error: 'RabbitMQ unavailable',
    });
  });
});
