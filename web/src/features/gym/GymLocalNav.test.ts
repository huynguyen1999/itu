import { describe, expect, it } from 'vitest';
import { findActiveGymWorkout } from './GymLocalNav';

describe('GymLocalNav active workout', () => {
  it('finds an in-progress or active workout for the prominent continue link', () => {
    expect(
      findActiveGymWorkout([
        { id: 'done', status: 'COMPLETED' },
        { id: 'active', status: 'IN_PROGRESS' },
      ] as any)?.id,
    ).toBe('active');
  });

  it('returns no link target when there is no active workout', () => {
    expect(findActiveGymWorkout([{ id: 'done', status: 'COMPLETED' }] as any)).toBeNull();
  });
});
