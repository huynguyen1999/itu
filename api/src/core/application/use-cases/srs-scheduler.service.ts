import { ReviewGrade } from '@core/domain/enums';
import { ReviewStateModel } from '@core/domain/models';

export interface ScheduledReview {
  state: ReviewStateModel;
  nextDueAt: Date;
}

const GRADE_WEIGHTS: Record<ReviewGrade, { stability: number; difficulty: number; minimumDays: number }> = {
  [ReviewGrade.AGAIN]: { stability: 0.35, difficulty: 1.3, minimumDays: 0 },
  [ReviewGrade.HARD]: { stability: 0.8, difficulty: 1.12, minimumDays: 1 },
  [ReviewGrade.GOOD]: { stability: 1.75, difficulty: 0.95, minimumDays: 2 },
  [ReviewGrade.EASY]: { stability: 2.5, difficulty: 0.82, minimumDays: 4 },
};

export class SrsSchedulerService {
  schedule(previous: ReviewStateModel, grade: ReviewGrade, now = new Date()): ScheduledReview {
    const weight = GRADE_WEIGHTS[grade];
    const nextReviewCount = previous.reviewCount + 1;
    const previousStability = Math.max(previous.stability || 1, 1);
    const nextStability =
      grade === ReviewGrade.AGAIN ? 1 : previousStability * weight.stability + nextReviewCount * 0.15;
    const nextDifficulty = Math.min(10, Math.max(1, previous.difficulty * weight.difficulty));
    const intervalDays =
      grade === ReviewGrade.AGAIN
        ? 0
        : Math.max(weight.minimumDays, Math.round(nextStability * (11 - nextDifficulty) * 0.7));
    const nextDueAt = new Date(now);
    nextDueAt.setDate(nextDueAt.getDate() + intervalDays);

    return {
      nextDueAt,
      state: {
        ...previous,
        dueAt: nextDueAt,
        stability: Number(nextStability.toFixed(2)),
        difficulty: Number(nextDifficulty.toFixed(2)),
        intervalDays,
        lapseCount: previous.lapseCount + (grade === ReviewGrade.AGAIN ? 1 : 0),
        reviewCount: nextReviewCount,
      },
    };
  }
}
