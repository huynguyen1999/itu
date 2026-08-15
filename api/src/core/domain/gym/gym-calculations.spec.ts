import {
  calculateE1RM,
  isWorkingSet,
  detectSetPRs,
  detectWorkoutPRs,
  calculateMuscleDistribution,
  calculateWeeklyConsistencyStreak,
  buildExerciseProgress,
} from './gym-calculations';
import { WorkoutDomain, WorkoutSetDomain, ExerciseDomain } from './gym.domain';

describe('Gym Calculations', () => {
  describe('calculateE1RM', () => {
    it('returns null for zero or negative weights/reps', () => {
      expect(calculateE1RM(0, 5)).toBeNull();
      expect(calculateE1RM(100, 0)).toBeNull();
      expect(calculateE1RM(-50, 5)).toBeNull();
      expect(calculateE1RM(null, 5)).toBeNull();
      expect(calculateE1RM(100, null)).toBeNull();
    });

    it('returns exact weight for 1 rep', () => {
      expect(calculateE1RM(100, 1)).toBe(100);
      expect(calculateE1RM(82.5, 1)).toBe(82.5);
    });

    it('calculates Epley formula correctly: weight * (1 + reps / 30)', () => {
      // 100 * (1 + 10 / 30) = 100 * (1.333333) = 133.3
      expect(calculateE1RM(100, 10)).toBe(133.3);
      // 80 * (1 + 6 / 30) = 80 * 1.2 = 96
      expect(calculateE1RM(80, 6)).toBe(96);
    });
  });

  describe('isWorkingSet', () => {
    it('returns false for incomplete sets', () => {
      expect(isWorkingSet({ type: 'NORMAL', completedAt: null })).toBe(false);
      expect(isWorkingSet({ type: 'NORMAL', completedAt: undefined })).toBe(false);
    });

    it('returns false for warm-up sets', () => {
      expect(isWorkingSet({ type: 'WARM_UP', completedAt: new Date() })).toBe(false);
      expect(isWorkingSet({ type: 'WARMUP', completedAt: new Date() })).toBe(false);
    });

    it('returns true for completed NORMAL, DROP, FAILURE sets', () => {
      expect(isWorkingSet({ type: 'NORMAL', completedAt: new Date() })).toBe(true);
      expect(isWorkingSet({ type: 'DROP', completedAt: new Date() })).toBe(true);
      expect(isWorkingSet({ type: 'FAILURE', completedAt: new Date() })).toBe(true);
    });
  });

  describe('detectSetPRs', () => {
    it('detects HEAVIEST_WEIGHT, ESTIMATED_1RM, MOST_REPS, and BEST_SET_VOLUME', () => {
      const priorSets: WorkoutSetDomain[] = [
        { id: 's1', workoutExerciseId: 'we1', sortOrder: 0, type: 'NORMAL', weight: 80, reps: 8, completedAt: new Date() },
        { id: 's2', workoutExerciseId: 'we1', sortOrder: 1, type: 'NORMAL', weight: 85, reps: 6, completedAt: new Date() },
      ];

      // New set beats weight (90 kg) and e1RM (90 * 1.2 = 108 vs 85 * 1.2 = 102)
      const currentSet: WorkoutSetDomain = {
        id: 's3',
        workoutExerciseId: 'we1',
        sortOrder: 2,
        type: 'NORMAL',
        weight: 90,
        reps: 6,
        completedAt: new Date(),
      };

      const result = detectSetPRs(currentSet, 'WEIGHT_REPS', 'Bench Press', 'ex-1', priorSets);
      expect(result).not.toBeNull();
      expect(result?.prTypes).toContain('HEAVIEST_WEIGHT');
      expect(result?.prTypes).toContain('ESTIMATED_1RM');
      expect(result?.value).toBe(90);
      expect(result?.previousValue).toBe(85);
    });

    it('does not trigger PR for inferior performance', () => {
      const priorSets: WorkoutSetDomain[] = [
        { id: 's1', workoutExerciseId: 'we1', sortOrder: 0, type: 'NORMAL', weight: 100, reps: 10, completedAt: new Date() },
      ];
      const inferiorSet: WorkoutSetDomain = {
        id: 's2',
        workoutExerciseId: 'we1',
        sortOrder: 1,
        type: 'NORMAL',
        weight: 90,
        reps: 8,
        completedAt: new Date(),
      };

      const result = detectSetPRs(inferiorSet, 'WEIGHT_REPS', 'Bench Press', 'ex-1', priorSets);
      expect(result).toBeNull();
    });

    it('detects LONGEST_DURATION for duration exercises', () => {
      const priorSets: WorkoutSetDomain[] = [
        { id: 's1', workoutExerciseId: 'we1', sortOrder: 0, type: 'NORMAL', durationSeconds: 60, completedAt: new Date() },
      ];
      const plankSet: WorkoutSetDomain = {
        id: 's2',
        workoutExerciseId: 'we1',
        sortOrder: 1,
        type: 'NORMAL',
        durationSeconds: 90,
        completedAt: new Date(),
      };

      const result = detectSetPRs(plankSet, 'DURATION', 'Plank', 'ex-plank', priorSets);
      expect(result).not.toBeNull();
      expect(result?.prTypes).toContain('LONGEST_DURATION');
      expect(result?.value).toBe(90);
    });
  });

  describe('calculateMuscleDistribution', () => {
    it('groups working sets by primary muscle group only', () => {
      const exerciseChest: ExerciseDomain = {
        id: 'ex-chest',
        userId: 'u1',
        name: 'Bench Press',
        normalizedName: 'bench press',
        metricType: 'WEIGHT_REPS',
        defaultWeightUnit: 'KG',
        primaryMuscleGroup: 'Chest',
        secondaryMuscleGroups: ['Triceps', 'Shoulders'],
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      };

      const exerciseBack: ExerciseDomain = {
        id: 'ex-back',
        userId: 'u1',
        name: 'Pull Up',
        normalizedName: 'pull up',
        metricType: 'REPS',
        defaultWeightUnit: 'KG',
        primaryMuscleGroup: 'Back',
        secondaryMuscleGroups: ['Biceps'],
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      };

      const workout: WorkoutDomain = {
        id: 'w1',
        userId: 'u1',
        status: 'COMPLETED',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        exercises: [
          {
            id: 'we1',
            workoutId: 'w1',
            exerciseId: 'ex-chest',
            sortOrder: 0,
            exercise: exerciseChest,
            sets: [
              { id: 's1', workoutExerciseId: 'we1', sortOrder: 0, type: 'WARM_UP', completedAt: new Date() },
              { id: 's2', workoutExerciseId: 'we1', sortOrder: 1, type: 'NORMAL', completedAt: new Date() },
              { id: 's3', workoutExerciseId: 'we1', sortOrder: 2, type: 'NORMAL', completedAt: new Date() },
              { id: 's4', workoutExerciseId: 'we1', sortOrder: 3, type: 'DROP', completedAt: new Date() },
            ],
          },
          {
            id: 'we2',
            workoutId: 'w1',
            exerciseId: 'ex-back',
            sortOrder: 1,
            exercise: exerciseBack,
            sets: [
              { id: 's5', workoutExerciseId: 'we2', sortOrder: 0, type: 'NORMAL', completedAt: new Date() },
              { id: 's6', workoutExerciseId: 'we2', sortOrder: 1, type: 'NORMAL', completedAt: new Date() },
            ],
          },
        ],
      };

      const dist = calculateMuscleDistribution([workout]);
      expect(dist['Chest']).toBe(3); // excludes warm-up set
      expect(dist['Back']).toBe(2);
      expect(dist['Triceps']).toBeUndefined(); // secondary muscle excluded
    });
  });

  describe('calculateWeeklyConsistencyStreak', () => {
    it('calculates consecutive weeks meeting weekly workout target', () => {
      const now = new Date('2026-08-15T10:00:00Z'); // Saturday in 2026-W33

      // Create 3 workouts per week for the last 3 weeks
      const workouts: WorkoutDomain[] = [];
      // This week (W33): 3 workouts
      workouts.push(
        { id: 'w1', userId: 'u1', status: 'COMPLETED', startedAt: new Date('2026-08-10T08:00:00Z'), createdAt: new Date('2026-08-10T08:00:00Z'), updatedAt: new Date(), version: 1, exercises: [] },
        { id: 'w2', userId: 'u1', status: 'COMPLETED', startedAt: new Date('2026-08-12T08:00:00Z'), createdAt: new Date('2026-08-12T08:00:00Z'), updatedAt: new Date(), version: 1, exercises: [] },
        { id: 'w3', userId: 'u1', status: 'COMPLETED', startedAt: new Date('2026-08-14T08:00:00Z'), createdAt: new Date('2026-08-14T08:00:00Z'), updatedAt: new Date(), version: 1, exercises: [] },
      );
      // Last week (W32): 3 workouts
      workouts.push(
        { id: 'w4', userId: 'u1', status: 'COMPLETED', startedAt: new Date('2026-08-03T08:00:00Z'), createdAt: new Date('2026-08-03T08:00:00Z'), updatedAt: new Date(), version: 1, exercises: [] },
        { id: 'w5', userId: 'u1', status: 'COMPLETED', startedAt: new Date('2026-08-05T08:00:00Z'), createdAt: new Date('2026-08-05T08:00:00Z'), updatedAt: new Date(), version: 1, exercises: [] },
        { id: 'w6', userId: 'u1', status: 'COMPLETED', startedAt: new Date('2026-08-07T08:00:00Z'), createdAt: new Date('2026-08-07T08:00:00Z'), updatedAt: new Date(), version: 1, exercises: [] },
      );
      // 2 weeks ago (W31): 3 workouts
      workouts.push(
        { id: 'w7', userId: 'u1', status: 'COMPLETED', startedAt: new Date('2026-07-27T08:00:00Z'), createdAt: new Date('2026-07-27T08:00:00Z'), updatedAt: new Date(), version: 1, exercises: [] },
        { id: 'w8', userId: 'u1', status: 'COMPLETED', startedAt: new Date('2026-07-29T08:00:00Z'), createdAt: new Date('2026-07-29T08:00:00Z'), updatedAt: new Date(), version: 1, exercises: [] },
        { id: 'w9', userId: 'u1', status: 'COMPLETED', startedAt: new Date('2026-07-31T08:00:00Z'), createdAt: new Date('2026-07-31T08:00:00Z'), updatedAt: new Date(), version: 1, exercises: [] },
      );

      const streak = calculateWeeklyConsistencyStreak(workouts, 3, now);
      expect(streak).toBe(3);

      const streakHigherTarget = calculateWeeklyConsistencyStreak(workouts, 4, now);
      expect(streakHigherTarget).toBe(0);
    });
  });

  describe('buildExerciseProgress', () => {
    it('returns calculated records and history points across ranges', () => {
      const exercise: ExerciseDomain = {
        id: 'ex-squat',
        userId: 'u1',
        name: 'Barbell Squat',
        normalizedName: 'barbell squat',
        metricType: 'WEIGHT_REPS',
        defaultWeightUnit: 'KG',
        primaryMuscleGroup: 'Quads',
        secondaryMuscleGroups: ['Glutes'],
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
        version: 1,
      };

      const sets: WorkoutSetDomain[] = [
        { id: 's1', workoutExerciseId: 'we1', sortOrder: 0, type: 'NORMAL', weight: 100, reps: 5, performedAt: new Date('2026-06-01'), completedAt: new Date('2026-06-01') },
        { id: 's2', workoutExerciseId: 'we2', sortOrder: 0, type: 'NORMAL', weight: 110, reps: 5, performedAt: new Date('2026-07-01'), completedAt: new Date('2026-07-01') },
        { id: 's3', workoutExerciseId: 'we3', sortOrder: 0, type: 'NORMAL', weight: 120, reps: 3, performedAt: new Date('2026-08-01'), completedAt: new Date('2026-08-01') },
      ];

      const progress = buildExerciseProgress(exercise, sets, 'ALL', new Date('2026-08-15'));
      expect(progress.records.heaviestWeight).toBe(120);
      expect(progress.records.mostReps).toBe(5);
      expect(progress.records.totalCompletedSets).toBe(3);
      expect(progress.historyPoints.length).toBe(3);
    });
  });
});
