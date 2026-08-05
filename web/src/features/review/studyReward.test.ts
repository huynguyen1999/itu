import { describe, expect, it } from 'vitest';
import { studyAccountXpForReviewedCount, studyCompletionMessage } from './studyReward';

describe('study rewards', () => {
  it.each([
    [1, 0],
    [2, 1],
    [41, 20],
  ])('uses reviewed-card count only (%d cards)', (reviewed, expectedXp) => {
    expect(studyAccountXpForReviewedCount(reviewed)).toBe(expectedXp);
    expect(studyAccountXpForReviewedCount(reviewed)).toBe(studyAccountXpForReviewedCount(reviewed));
  });

  it('communicates that accuracy does not change the reward', () => {
    expect(studyCompletionMessage(1)).toContain('1 card reviewed');
    expect(studyCompletionMessage(2)).toContain('2 cards reviewed');
    expect(studyCompletionMessage(2)).toContain('not accuracy');
  });
});
