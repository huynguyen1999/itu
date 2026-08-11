import { describe, expect, it } from 'vitest';
import { mergeGymWorkoutCache } from './gymMutations';

describe('mergeGymWorkoutCache', () => {
  it('keeps exercises when an offline title update returns a partial workout', () => {
    const exercises = [{ id: 'entry-1', sets: [{ id: 'set-1' }] }];
    expect(
      mergeGymWorkoutCache({ id: 'workout-1', title: 'Before', exercises }, { id: 'workout-1', title: 'After' }),
    ).toEqual({
      id: 'workout-1',
      title: 'After',
      exercises,
    });
  });
});
