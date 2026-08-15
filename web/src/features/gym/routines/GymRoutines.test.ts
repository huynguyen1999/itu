import { describe, expect, it } from 'vitest';
import { findActiveGymWorkout } from '../GymLocalNav';

describe('Gym Routines & Navigation', () => {
  it('identifies in-progress workouts for continue banner', () => {
    const workouts = [
      { id: 'w1', status: 'COMPLETED' as const },
      { id: 'w2', status: 'IN_PROGRESS' as const, title: 'Push Day' },
    ];
    const active = findActiveGymWorkout(workouts as any);
    expect(active?.id).toBe('w2');
  });

  it('calculates total target sets for a routine correctly', () => {
    const routine = {
      id: 'r1',
      name: 'Upper Body',
      sortOrder: 0,
      exercises: [
        { id: 're1', routineId: 'r1', exerciseId: 'e1', sortOrder: 0, setCount: 4 },
        { id: 're2', routineId: 'r1', exerciseId: 'e2', sortOrder: 1, setCount: 3 },
        { id: 're3', routineId: 'r1', exerciseId: 'e3', sortOrder: 2, setCount: 3 },
      ],
    };
    const totalSets = routine.exercises.reduce((sum, ex) => sum + ex.setCount, 0);
    expect(totalSets).toBe(10);
  });
});
