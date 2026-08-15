import { PrismaGymRepository } from './prisma-gym.repository';

describe('PrismaGymRepository exercise stats', () => {
  it('includes dated workout context on recent sets', async () => {
    const startedAt = new Date('2026-08-10T07:00:00Z');
    const endedAt = new Date('2026-08-10T07:42:00Z');
    const prisma = {
      exerciseDefinition: {
        findFirst: jest.fn().mockResolvedValue({ id: 'exercise-1', userId: 'user-1', archivedAt: null, deletedAt: null }),
      },
      gymWorkoutSet: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'set-1',
          workoutExerciseId: 'workout-exercise-1',
          sortOrder: 0,
          type: 'NORMAL',
          reps: 8,
          weight: 80,
          durationSeconds: null,
          distanceMeters: null,
          rpe: null,
          completedAt: new Date('2026-08-10T07:40:00Z'),
          version: 2,
          deletedAt: null,
          workoutExercise: {
            workout: { id: 'workout-1', title: 'Morning strength', startedAt, endedAt, createdAt: startedAt },
          },
        }]),
      },
    } as any;

    const stats = await new PrismaGymRepository(prisma).getExerciseStats('user-1', 'exercise-1');

    expect(stats.recentSets[0]).toMatchObject({
      id: 'set-1',
      performedAt: new Date('2026-08-10T07:40:00Z'),
      workoutId: 'workout-1',
      workoutTitle: 'Morning strength',
    });
  });

  it('bounds analytics queries to the requested range', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repo = new PrismaGymRepository({ gymWorkout: { findMany } } as any);
    const from = new Date('2026-08-01T00:00:00Z');
    const to = new Date('2026-08-31T23:59:59Z');

    await repo.getAnalytics('user-1', 'CUSTOM', from, to);

    expect(findMany.mock.calls[0][0]).toEqual(expect.objectContaining({
      where: expect.objectContaining({
        userId: 'user-1',
        status: 'COMPLETED',
        startedAt: { gte: from, lte: to },
      }),
    }));
  });

  it('aggregates a single completed workout inside a custom range', async () => {
    const repo = new PrismaGymRepository({ gymWorkout: { findMany: jest.fn() } } as any);
    const workout = {
      id: 'workout-1',
      status: 'COMPLETED',
      startedAt: new Date('2026-08-10T07:00:00Z'),
      createdAt: new Date('2026-08-10T07:00:00Z'),
      durationMinutes: 42,
      exercises: [{
        exerciseId: 'exercise-1',
        exercise: { name: 'Bench press', primaryMuscleGroup: 'Chest', metricType: 'WEIGHT_REPS' },
        sets: [{ type: 'NORMAL', reps: 8, weight: 80, completedAt: new Date('2026-08-10T07:40:00Z') }],
      }],
    };
    jest.spyOn(repo, 'getWorkouts').mockResolvedValue([workout] as any);

    await expect(repo.getAnalytics(
      'user-1',
      'CUSTOM',
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-31T23:59:59Z'),
    )).resolves.toMatchObject({
      totalWorkouts: 1,
      totalWorkingSets: 1,
      totalVolumeKg: 640,
      totalTrainingMinutes: 42,
      muscleDistribution: { Chest: 1 },
    });
  });
});
