import { AiJobModel, AiSessionFeedbackModel } from '@core/domain/models';

export interface SuggestedCard {
  promptRichText: string;
  answerRichText: string;
  tags: string[];
}

import { CardGrading } from '../out/service-types.port';

export interface IAiUseCase {
  suggestCards(userId: string, pastedText: string): Promise<AiJobModel>;
  requestSessionFeedback(userId: string, sessionId: string): Promise<AiJobModel>;
  requestReviewInsights(userId: string, entryId: string, expectedVersion: number): Promise<AiJobModel>;
  getJob(userId: string, jobId: string): Promise<AiJobModel>;
  getSessionFeedback(userId: string, sessionId: string): Promise<AiSessionFeedbackModel | null>;
  streamCards(userId: string, pastedText: string): Promise<AsyncIterable<string>>;
  streamSessionSummary(userId: string, sessionId: string): Promise<AsyncIterable<string>>;
  generateSessionGrading(
    userId: string,
    sessionId: string,
    summary: string,
  ): Promise<{ cardGradings: CardGrading[]; confidence?: number; gradePoint?: number }>;
}
