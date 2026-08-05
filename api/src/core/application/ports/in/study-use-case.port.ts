import { ReviewDirection, ReviewGrade, StudyMode } from '@core/domain/enums';
import { AiSessionFeedbackModel, CardModel, ReviewStateModel, StudySessionModel } from '@core/domain/models';
import { CursorPage, CursorPageOptions } from '@core/application/ports/pagination.port';
import { StudySessionHistoryData } from '@core/application/ports/out/repository-types.port';
import { SessionReviewItem } from '@core/application/ports/out/service-types.port';

export interface DueReviewItem {
  card: CardModel;
  state: ReviewStateModel;
}

export interface StartSessionCommand {
  deckId?: string;
  mode: StudyMode;
}

export interface SubmitReviewCommand {
  cardId: string;
  direction: ReviewDirection;
  grade: ReviewGrade;
  userAnswer?: string;
  responseMs?: number;
  idempotencyKey?: string;
}

export interface CompleteSessionCommand {
  rating: number;
}

export interface IStudyUseCase {
  due(userId: string, deckId?: string): Promise<DueReviewItem[]>;
  history(userId: string, options?: CursorPageOptions): Promise<CursorPage<StudySessionHistoryData>>;
  start(userId: string, command: StartSessionCommand): Promise<StudySessionModel>;
  submitReview(userId: string, sessionId: string, command: SubmitReviewCommand): Promise<DueReviewItem>;
  complete(userId: string, sessionId: string, command: CompleteSessionCommand): Promise<StudySessionModel>;
  sessionDetails(
    userId: string,
    sessionId: string,
  ): Promise<StudySessionModel & { reviews: SessionReviewItem[]; feedback?: AiSessionFeedbackModel | null }>;
}
