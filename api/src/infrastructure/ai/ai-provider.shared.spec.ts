import { ReviewDirection, ReviewGrade } from '@core/domain/enums';
import type { ReviewSessionInput } from '@core/application/ports/out/service-types.port';
import { buildSessionSummaryPrompt } from './ai-provider.shared';

describe('AI provider shared prompts', () => {
  it('limits session summaries to 100 words and excludes user self-rating', () => {
    const prompt = buildSessionSummaryPrompt(reviewInput());

    expect(prompt).toContain('100 words or fewer');
    expect(prompt).toContain("Do not mention or infer the learner's self-rating.");
    expect(prompt).not.toContain('Session rating');
    expect(prompt).not.toContain('8/10');
  });
});

function reviewInput(): ReviewSessionInput {
  return {
    rating: 8,
    reviewed: 2,
    correct: 1,
    reviews: [
      {
        answerRichText: 'Mitochondria',
        cardId: 'card-1',
        direction: ReviewDirection.FRONT_TO_BACK,
        grade: ReviewGrade.GOOD,
        promptRichText: 'What makes ATP?',
        userAnswer: 'Mitochondria',
      },
    ],
  };
}
