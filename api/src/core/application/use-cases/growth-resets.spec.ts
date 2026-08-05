import { growthLevelProgress } from './growth-rules';

describe('Growth v2 Resets Logic', () => {
  it('calculates skill reset adjustment correctly', () => {
    const xpBefore = 450; // Level 3 at 100 baseXp
    const levelBefore = growthLevelProgress(xpBefore, 100).level;
    expect(levelBefore).toBe(3);

    const adjustmentAmount = -xpBefore;
    const xpAfter = xpBefore + adjustmentAmount;
    const levelAfter = growthLevelProgress(xpAfter, 100).level;
    expect(xpAfter).toBe(0);
    expect(levelAfter).toBe(1);
  });

  it('handles custom baseXp resets', () => {
    const baseXp = 200;
    const xpBefore = 800; // Level 3 at 200 baseXp
    expect(growthLevelProgress(xpBefore, baseXp).level).toBe(3);

    const xpAfter = 0;
    expect(growthLevelProgress(xpAfter, baseXp).level).toBe(1);
  });
});
