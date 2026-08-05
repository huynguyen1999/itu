import { AiJob, AiSessionFeedback, Card, CardImage, Deck, ReviewState, StudySession, User } from '@prisma/client';
import {
  AiJobModel,
  AiSessionFeedbackModel,
  CardImageModel,
  CardModel,
  DeckModel,
  ReviewStateModel,
  ScheduledJobModel,
  StudySessionModel,
  UserModel,
} from '@core/domain/models';

export function mapUser(user: User): UserModel {
  return user;
}

export function mapDeck(deck: Deck): DeckModel {
  return deck as unknown as DeckModel;
}

export function mapCardImage(image: CardImage): CardImageModel {
  return image as CardImageModel;
}

export function mapCard(card: Card & { images?: CardImage[]; reviewStates?: ReviewState[] }): CardModel {
  const reviewStates = card.reviewStates ?? [];
  return {
    ...card,
    images: (card.images ?? []).map(mapCardImage),
    ...(reviewStates.length > 0
      ? {
          reviewSummary: {
            nextDueAt: reviewStates.reduce<Date | null>(
              (earliest, state) => (!earliest || state.dueAt < earliest ? state.dueAt : earliest),
              null,
            ),
            reviewCount: reviewStates.reduce((total, state) => total + state.reviewCount, 0),
          },
        }
      : {}),
  } as CardModel;
}

export function mapReviewState(state: ReviewState): ReviewStateModel {
  return state as ReviewStateModel;
}

export function mapStudySession(session: StudySession): StudySessionModel {
  return session as StudySessionModel;
}

export function mapAiJob(job: AiJob): AiJobModel {
  return job as AiJobModel;
}

export function mapAiFeedback(feedback: AiSessionFeedback): AiSessionFeedbackModel {
  return feedback as AiSessionFeedbackModel;
}

export function mapScheduledJob(job: unknown): ScheduledJobModel {
  return job as ScheduledJobModel;
}
