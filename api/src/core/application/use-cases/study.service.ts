import { Inject, Injectable, Optional } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import type {
  IStudyUseCase,
  CompleteSessionCommand,
  DueReviewItem,
  StartSessionCommand,
  SubmitReviewCommand,
} from '@core/application/ports/in/study-use-case.port';
import type {
  ICardRepository,
  IAiFeedbackRepository,
  IReviewStateRepository,
  IStudySessionRepository,
} from '@core/application/ports/out/repositories.port';
import { EntityNotFoundException, InvalidReviewException } from '@core/domain/exceptions';
import { ReviewGrade, StudyMode } from '@core/domain/enums';
import { StudySessionModel } from '@core/domain/models';
import { CursorPage, CursorPageOptions } from '@core/application/ports/pagination.port';
import { StudySessionHistoryData } from '@core/application/ports/out/repository-types.port';
import { SessionReviewItem } from '@core/application/ports/out/service-types.port';
import { SrsSchedulerService } from './srs-scheduler.service';

@Injectable()
export class StudyService implements IStudyUseCase {
  constructor(
    @Inject(TOKENS.REVIEW_STATE_REPOSITORY) private readonly reviewStates: IReviewStateRepository,
    @Inject(TOKENS.STUDY_SESSION_REPOSITORY) private readonly sessions: IStudySessionRepository,
    @Inject(TOKENS.CARD_REPOSITORY) private readonly cards: ICardRepository,
    private readonly scheduler: SrsSchedulerService,
    @Optional() @Inject(TOKENS.AI_FEEDBACK_REPOSITORY) private readonly feedback?: IAiFeedbackRepository,
  ) {}

  due(userId: string, deckId?: string): Promise<DueReviewItem[]> {
    return this.reviewStates.listDue(userId, deckId);
  }

  history(userId: string, options?: CursorPageOptions): Promise<CursorPage<StudySessionHistoryData>> {
    return this.sessions.sessionHistory(userId, options);
  }

  start(userId: string, command: StartSessionCommand): Promise<StudySessionModel> {
    return this.sessions.create(userId, {
      deckId: command.deckId ?? null,
      mode: command.mode ?? StudyMode.DUE,
    });
  }

  private isSameReviewPayload(existing: any, sessionId: string, command: SubmitReviewCommand): boolean {
    return (
      existing.sessionId === sessionId &&
      existing.cardId === command.cardId &&
      existing.direction === command.direction &&
      existing.grade === command.grade &&
      (existing.userAnswer ?? null) === (this.normalizeUserAnswer(command.userAnswer) ?? null) &&
      (existing.responseMs ?? null) === (command.responseMs ?? null)
    );
  }

  async submitReview(userId: string, sessionId: string, command: SubmitReviewCommand): Promise<DueReviewItem> {
    const session = await this.sessions.findById(userId, sessionId);
    if (!session) throw new EntityNotFoundException('StudySession', sessionId);

    // Resolve an existing keyed review before the completed-session guard: a
    // lost response may be retried after the session was completed.
    if (command.idempotencyKey) {
      const existing = await this.sessions.findReviewLogByIdempotencyKey?.(userId, command.idempotencyKey);
      if (existing) {
        if (!this.isSameReviewPayload(existing, sessionId, command)) {
          throw new InvalidReviewException('Review idempotency key was reused with a different payload');
        }
        const [state, card] = await Promise.all([
          this.reviewStates.find(userId, command.cardId, command.direction),
          this.cards.findById(userId, command.cardId),
        ]);
        if (!state) throw new EntityNotFoundException('ReviewState', `${command.cardId}:${command.direction}`);
        if (!card) throw new EntityNotFoundException('Card', command.cardId);
        return { state, card };
      }
    }
    if (session.completedAt) throw new InvalidReviewException('Cannot add reviews to a completed session');

    const previous = await this.reviewStates.find(userId, command.cardId, command.direction);
    if (!previous) throw new EntityNotFoundException('ReviewState', `${command.cardId}:${command.direction}`);
    const card = await this.cards.findById(userId, command.cardId);
    if (!card) throw new EntityNotFoundException('Card', command.cardId);

    const scheduled = this.scheduler.schedule(previous, command.grade);
    const created = await this.sessions.addReviewLog(userId, {
      sessionId,
      cardId: command.cardId,
      cardDeckId: card.deckId,
      cardPromptRichText: card.promptRichText,
      cardAnswerRichText: card.answerRichText,
      cardImages: card.images.map((image) => ({
        side: image.side,
        storageKey: image.storageKey,
        mimeType: image.mimeType,
        sortOrder: image.sortOrder,
        sizeBytes: image.sizeBytes,
      })),
      direction: command.direction,
      grade: command.grade,
      userAnswer: this.normalizeUserAnswer(command.userAnswer),
      responseMs: command.responseMs,
      previousDueAt: previous.dueAt,
      nextDueAt: scheduled.nextDueAt,
      previousInterval: previous.intervalDays,
      nextInterval: scheduled.state.intervalDays,
      idempotencyKey: command.idempotencyKey,
    });

    // A concurrent request with the same key may win the unique insert race.
    // In that case the winner already applied the state transition; return
    // the authoritative current state without applying it twice. `undefined`
    // is treated as success for legacy repository adapters.
    if (created === false) {
      const state = await this.reviewStates.find(userId, command.cardId, command.direction);
      if (!state) throw new EntityNotFoundException('ReviewState', `${command.cardId}:${command.direction}`);
      return { state, card };
    }

    const nextState = await this.reviewStates.update(scheduled.state);

    return { state: nextState, card };
  }

  async complete(userId: string, sessionId: string, command: CompleteSessionCommand): Promise<StudySessionModel> {
    if (command.rating < 1 || command.rating > 10) {
      throw new InvalidReviewException('Session rating must be between 1 and 10');
    }
    const session = await this.sessions.complete(userId, sessionId, {
      rating: command.rating,
    });
    if (!session) throw new EntityNotFoundException('StudySession', sessionId);
    return session;
  }

  async sessionDetails(
    userId: string,
    sessionId: string,
  ): Promise<
    StudySessionModel & {
      reviews: SessionReviewItem[];
      feedback?: Awaited<ReturnType<IAiFeedbackRepository['findBySession']>>;
    }
  > {
    const session = await this.sessions.findById(userId, sessionId);
    if (!session) throw new EntityNotFoundException('StudySession', sessionId);
    const [storedReviews, feedback] = await Promise.all([
      this.sessions.sessionReviews(userId, sessionId),
      this.feedback?.findBySession(userId, sessionId) ?? Promise.resolve(null),
    ]);
    const reviews: SessionReviewItem[] = storedReviews.map(({ images: _images, ...review }) => review);
    return {
      ...session,
      reviews,
      feedback,
    };
  }

  private normalizeUserAnswer(userAnswer?: string): string | null {
    const trimmed = userAnswer?.trim();
    return trimmed ? trimmed : null;
  }
}

function isCorrectGrade(grade: ReviewGrade): boolean {
  return grade !== ReviewGrade.AGAIN;
}
