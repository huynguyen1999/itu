import { ReviewDirection, ReviewGrade, StudyMode } from '@core/domain/enums';
import { InvalidReviewException } from '@core/domain/exceptions';
import type {
  ICardRepository,
  IReviewStateRepository,
  IStudySessionRepository,
} from '@core/application/ports/out/repositories.port';
import { StudyService } from './study.service';
import { SrsSchedulerService } from './srs-scheduler.service';

const emptyReviewStates = {} as IReviewStateRepository;
const emptySessions = {} as IStudySessionRepository;
const emptyCards = {} as ICardRepository;

describe('StudyService', () => {
  it('rejects session ratings outside 1-10', async () => {
    const service = new StudyService(
      emptyReviewStates,
      {
        sessionStats: jest.fn().mockResolvedValue({ reviewed: 0, correct: 0 }),
      } as unknown as IStudySessionRepository,
      emptyCards,
      new SrsSchedulerService(),
    );

    await expect(service.complete('user-1', 'session-1', { rating: 11 })).rejects.toBeInstanceOf(
      InvalidReviewException,
    );
  });

  it('records a per-card review through the scheduler', async () => {
    const state = {
      id: 'state-1',
      userId: 'user-1',
      cardId: 'card-1',
      direction: ReviewDirection.FRONT_TO_BACK,
      dueAt: new Date(),
      stability: 1,
      difficulty: 5,
      intervalDays: 0,
      lapseCount: 0,
      reviewCount: 0,
    };
    const sessions = {
      findById: jest.fn().mockResolvedValue({
        id: 'session-1',
        deckId: 'deck-1',
        completedAt: null,
      }),
      addReviewLog: jest.fn(),
    };
    const states = {
      find: jest.fn().mockResolvedValue(state),
      update: jest.fn().mockImplementation(async (next) => next),
      listDue: jest.fn().mockResolvedValue([]),
    };
    const service = new StudyService(
      states as unknown as IReviewStateRepository,
      sessions as unknown as IStudySessionRepository,
      {
        findById: jest.fn().mockResolvedValue({
          id: 'card-1',
          deckId: 'deck-1',
          promptRichText: 'Question',
          answerRichText: 'Answer',
          images: [
            {
              side: 'PROMPT',
              storageKey: 'user-1/card-1/image.webp',
              mimeType: 'image/webp',
              sortOrder: 0,
              sizeBytes: 123,
            },
          ],
        }),
      } as unknown as ICardRepository,
      new SrsSchedulerService(),
    );

    await service.submitReview('user-1', 'session-1', {
      cardId: 'card-1',
      direction: ReviewDirection.FRONT_TO_BACK,
      grade: ReviewGrade.GOOD,
      userAnswer: '  my answer  ',
    });

    expect(states.update).toHaveBeenCalledWith(expect.objectContaining({ reviewCount: 1 }));
    expect(sessions.addReviewLog).toHaveBeenCalledWith('user-1', expect.objectContaining({ userAnswer: 'my answer' }));
    expect(sessions.addReviewLog).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        cardImages: [
          {
            side: 'PROMPT',
            storageKey: 'user-1/card-1/image.webp',
            mimeType: 'image/webp',
            sortOrder: 0,
            sizeBytes: 123,
          },
        ],
      }),
    );
  });

  it('does not apply the state transition twice when the idempotency insert loses a race', async () => {
    const state = {
      id: 'state-1', userId: 'user-1', cardId: 'card-1', direction: ReviewDirection.FRONT_TO_BACK,
      dueAt: new Date(), stability: 1, difficulty: 5, intervalDays: 0, lapseCount: 0, reviewCount: 0,
    };
    let inserts = 0;
    const sessions = {
      findById: jest.fn().mockResolvedValue({ id: 'session-1', deckId: 'deck-1', completedAt: null }),
      addReviewLog: jest.fn().mockImplementation(async () => ++inserts === 1),
    };
    const states = {
      find: jest.fn().mockResolvedValue(state),
      update: jest.fn().mockImplementation(async (next) => next),
    };
    const service = new StudyService(
      states as unknown as IReviewStateRepository,
      sessions as unknown as IStudySessionRepository,
      { findById: jest.fn().mockResolvedValue({
        id: 'card-1', deckId: 'deck-1', promptRichText: 'Question', answerRichText: 'Answer', images: [],
      }) } as unknown as ICardRepository,
      new SrsSchedulerService(),
    );

    const command = {
      cardId: 'card-1', direction: ReviewDirection.FRONT_TO_BACK, grade: ReviewGrade.GOOD, idempotencyKey: 'review-1',
    };
    await Promise.all([service.submitReview('user-1', 'session-1', command), service.submitReview('user-1', 'session-1', command)]);

    expect(states.update).toHaveBeenCalledTimes(1);
  });

  it('replays a keyed review after the session has completed', async () => {
    const state = { id: 'state-1', userId: 'user-1', cardId: 'card-1', direction: ReviewDirection.FRONT_TO_BACK };
    const card = { id: 'card-1', deckId: 'deck-1', promptRichText: 'Question', answerRichText: 'Answer', images: [] };
    const sessions = {
      findById: jest.fn().mockResolvedValue({ id: 'session-1', completedAt: new Date() }),
      findReviewLogByIdempotencyKey: jest.fn().mockResolvedValue({
        sessionId: 'session-1', cardId: 'card-1', direction: ReviewDirection.FRONT_TO_BACK,
        grade: ReviewGrade.GOOD, userAnswer: null, responseMs: null,
      }),
      addReviewLog: jest.fn(),
    };
    const states = { find: jest.fn().mockResolvedValue(state), update: jest.fn() };
    const service = new StudyService(
      states as unknown as IReviewStateRepository,
      sessions as unknown as IStudySessionRepository,
      { findById: jest.fn().mockResolvedValue(card) } as unknown as ICardRepository,
      new SrsSchedulerService(),
    );

    await expect(service.submitReview('user-1', 'session-1', {
      cardId: 'card-1', direction: ReviewDirection.FRONT_TO_BACK, grade: ReviewGrade.GOOD, idempotencyKey: 'review-key',
    })).resolves.toEqual({ state, card });
    expect(sessions.addReviewLog).not.toHaveBeenCalled();
  });

  it('starts due sessions', async () => {
    const sessions = {
      create: jest.fn().mockResolvedValue({ id: 'session-1' }),
    };
    const service = new StudyService(
      emptyReviewStates,
      sessions as unknown as IStudySessionRepository,
      emptyCards,
      new SrsSchedulerService(),
    );

    await service.start('user-1', { mode: StudyMode.DUE });

    expect(sessions.create).toHaveBeenCalledWith('user-1', {
      deckId: null,
      mode: StudyMode.DUE,
    });
  });
});
