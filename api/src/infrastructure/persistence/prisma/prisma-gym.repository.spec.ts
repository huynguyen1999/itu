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
});
