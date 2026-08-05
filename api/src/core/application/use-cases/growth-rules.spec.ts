import { growthLevelProgress, growthCurvePreview } from './growth-rules';

describe('growthLevelProgress', () => {
  it.each([
    [0, 1, 100],
    [99, 1, 100],
    [100, 2, 400],
    [399, 2, 400],
    [400, 3, 900],
  ])('maps %i XP to level %i with next threshold %i for default baseXp=100', (xp, level, nextLevelXp) => {
    expect(growthLevelProgress(xp)).toMatchObject({ currentXp: xp, level, nextLevelXp });
  });

  it('handles custom baseXp (e.g. 50)', () => {
    // With baseXp=50:
    // L1: 0..49
    // L2: 50..199 (50*(2-1)^2 = 50, 50*2^2 = 200)
    // L3: 200..449 (50*3^2 = 450)
    expect(growthLevelProgress(0, 50)).toMatchObject({ level: 1, nextLevelXp: 50 });
    expect(growthLevelProgress(50, 50)).toMatchObject({ level: 2, nextLevelXp: 200 });
    expect(growthLevelProgress(200, 50)).toMatchObject({ level: 3, nextLevelXp: 450 });
  });

  it('clamps baseXp to safe range [10, 10000]', () => {
    expect(growthLevelProgress(100, 5)).toMatchObject({ baseXp: 10, level: 4 }); // 10*(L-1)^2 -> L4 is 90 XP
    expect(growthLevelProgress(100, 100000)).toMatchObject({ baseXp: 10000, level: 1 });
  });

  it('clamps invalid negative progression to zero', () => {
    expect(growthLevelProgress(-50)).toMatchObject({ currentXp: 0, level: 1 });
  });
});

describe('growthCurvePreview', () => {
  it('generates correct preview thresholds for default baseXp=100', () => {
    const preview = growthCurvePreview(100, 1, 3);
    expect(preview).toEqual([
      { level: 1, totalXpRequired: 0, xpForLevel: 100 },
      { level: 2, totalXpRequired: 100, xpForLevel: 300 },
      { level: 3, totalXpRequired: 400, xpForLevel: 500 },
    ]);
  });

  it('generates curve starting from arbitrary level', () => {
    const preview = growthCurvePreview(50, 3, 2);
    expect(preview).toEqual([
      { level: 3, totalXpRequired: 200, xpForLevel: 250 },
      { level: 4, totalXpRequired: 450, xpForLevel: 350 },
    ]);
  });
});
