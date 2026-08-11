import { InvalidTrashOperationException } from '@core/domain/exceptions';
import { PrismaTrashRepository } from './prisma-trash.repository';

describe('PrismaTrashRepository global collections', () => {
  const prisma = {
    $transaction: jest.fn(async (work: (tx: any) => unknown) => work(prisma)),
    budgetTransaction: { deleteMany: jest.fn() },
    gymWorkout: { deleteMany: jest.fn() },
    exerciseDefinition: { findFirst: jest.fn(), delete: jest.fn() },
    gymWorkoutExercise: { count: jest.fn() },
  } as any;
  let repository: PrismaTrashRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new PrismaTrashRepository(prisma);
  });

  it('hard-deletes budget transactions only when owned and already trashed', async () => {
    prisma.budgetTransaction.deleteMany.mockResolvedValue({ count: 0 });

    await expect(repository.deleteBudgetTransaction('user-1', 'tx-1')).resolves.toBe(false);
    expect(prisma.budgetTransaction.deleteMany).toHaveBeenCalledWith({
      where: { id: 'tx-1', userId: 'user-1', deletedAt: { not: null } },
    });
  });

  it('hard-deletes gym workouts only when owned and already trashed', async () => {
    prisma.gymWorkout.deleteMany.mockResolvedValue({ count: 0 });

    await expect(repository.deleteGymWorkout('user-1', 'workout-1')).resolves.toBe(false);
    expect(prisma.gymWorkout.deleteMany).toHaveBeenCalledWith({
      where: { id: 'workout-1', userId: 'user-1', deletedAt: { not: null } },
    });
  });

  it('rejects permanent exercise deletion while any workout references it', async () => {
    prisma.exerciseDefinition.findFirst.mockResolvedValue({ id: 'exercise-1', userId: 'user-1', deletedAt: new Date() });
    prisma.gymWorkoutExercise.count.mockResolvedValue(1);

    await expect(repository.deleteGymExercise('user-1', 'exercise-1')).rejects.toBeInstanceOf(InvalidTrashOperationException);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(prisma.gymWorkoutExercise.count).toHaveBeenCalledWith({ where: { exerciseId: 'exercise-1' } });
    expect(prisma.exerciseDefinition.delete).not.toHaveBeenCalled();
  });

  it('deletes an unreferenced trashed exercise inside the serializable transaction', async () => {
    const exercise = { id: 'exercise-1', userId: 'user-1', deletedAt: new Date(), imageStorageKey: 'gym/e.webp' };
    prisma.exerciseDefinition.findFirst.mockResolvedValue(exercise);
    prisma.gymWorkoutExercise.count.mockResolvedValue(0);

    await expect(repository.deleteGymExercise('user-1', 'exercise-1')).resolves.toBe(exercise);
    expect(prisma.exerciseDefinition.delete).toHaveBeenCalledWith({ where: { id: 'exercise-1' } });
  });
});
