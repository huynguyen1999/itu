import type {
  ReviewContextV1,
  ReviewKind,
  ReviewPeriod,
} from '@core/domain/review/review.types';

export interface ReviewPeriodData {
  period: ReviewPeriod;
  coverage: ReviewContextV1['coverage'];
  metrics: Record<string, unknown>;
  details: Record<string, unknown>;
}

export interface IReviewDataSource {
  loadPeriodData(userId: string, period: ReviewPeriod, excludeEntryId?: string): Promise<ReviewPeriodData>;
}

export interface ReviewRangeInput {
  kind: ReviewKind;
  startDate: string;
  endDate: string;
  timezone: string;
}

export const REVIEW_DATA_SOURCE = 'REVIEW_DATA_SOURCE';
