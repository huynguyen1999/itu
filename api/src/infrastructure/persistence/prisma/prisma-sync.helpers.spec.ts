import { validatedGrowthInt } from './prisma-sync.helpers';

describe('validatedGrowthInt', () => {
  it('accepts null for optional nullable growth values', () => {
    expect(validatedGrowthInt(null, 'maxRewardCap', { min: 1 })).toBeUndefined();
  });
});
