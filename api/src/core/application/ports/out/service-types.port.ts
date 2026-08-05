import { CardSide, ReviewDirection, ReviewGrade } from '@core/domain/enums';

export interface StoreCardImageInput {
  userId: string;
  cardId: string;
  side: CardSide;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
  sortOrder: number;
}

export interface StoreUserImageInput {
  userId: string;
  folder: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface StoreAudioInput {
  userId: string;
  soundId: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface ReviewSessionInput {
  rating?: number | null;
  reviewed: number;
  correct: number;
  reviews: SessionReviewItem[];
}

export interface CardGrading {
  cardId: string;
  correctness: 'CORRECT' | 'PARTIALLY_CORRECT' | 'INCORRECT';
  explanation: string;
}

export interface SessionFeedbackResult {
  summary: string;
  cardGradings: CardGrading[];
  confidence?: number;
  gradePoint?: number;
}

export interface SessionReviewItem {
  cardId: string;
  direction: ReviewDirection;
  grade: ReviewGrade;
  userAnswer?: string | null;
  promptRichText: string;
  answerRichText: string;
  images?: SessionReviewImage[];
}

export interface SessionReviewImage {
  side: CardSide;
  mimeType: string;
  data: string;
  sortOrder: number;
}

export interface VerifiedTokenPayload {
  sub: string;
  email: string;
  jti?: string;
}
