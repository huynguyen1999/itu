import { ExerciseMetricType, GymWorkoutStatus, PaymentMethod, Prisma, RecurringFrequency, WeightUnit, WorkoutSetType } from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { Tx, recordSyncChange } from './prisma-sync-mutation.shared';
import { assertClientId, enumValue, fieldConflict, notFound, optionalString, requiredString, stale } from './prisma-sync.helpers';
import { createUlid } from './ulid';
import { SyncMergeResolver } from './sync-merge-resolver';

export abstract class PrismaSyncGymMutationSupport {
  protected readonly mergeResolver = new SyncMergeResolver();
  protected numberOrNull(payload: Record<string, unknown>, key: string): number | null | undefined {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) return undefined;
    const value = payload[key];
    if (value === null || value === undefined) return value as null | undefined;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'object' && value !== null && 'toNumber' in value && typeof value.toNumber === 'function') {
      const number = value.toNumber();
      if (Number.isFinite(number)) return number;
    }
    throw new InvalidSyncMutationException(`${key} must be a number`);
  }

  protected async replaceExercises(tx: Tx, userId: string, workoutId: string, raw: unknown) {
    if (!Array.isArray(raw)) return;
    await tx.gymWorkoutExercise.deleteMany({ where: { workoutId } });
    for (const [index, value] of raw.entries()) {
      const exercise = value as Record<string, unknown>;
      const definition = await tx.exerciseDefinition.findFirst({ where: { id: requiredString(exercise, 'exerciseId'), userId, deletedAt: null } });
      if (!definition) throw new InvalidSyncMutationException('Exercise definition not found');
      const created = await tx.gymWorkoutExercise.create({ data: {
        id: typeof exercise.id === 'string' ? exercise.id : createUlid(), workoutId,
        exerciseId: definition.id, exerciseName: definition.name, metricType: definition.metricType, weightUnit: definition.defaultWeightUnit, sortOrder: typeof exercise.sortOrder === 'number' ? exercise.sortOrder : index,
        note: optionalString(exercise, 'note'), restSeconds: typeof exercise.restSeconds === 'number' ? exercise.restSeconds : null,
      } });
      if (!Array.isArray(exercise.sets)) continue;
      for (const [setIndex, rawSet] of exercise.sets.entries()) {
        const set = rawSet as Record<string, unknown>;
        await tx.gymWorkoutSet.create({ data: {
          id: typeof set.id === 'string' ? set.id : createUlid(), workoutExerciseId: created.id,
          sortOrder: typeof set.sortOrder === 'number' ? set.sortOrder : setIndex,
          type: enumValue(WorkoutSetType, set.type ?? 'NORMAL', 'type'), reps: typeof set.reps === 'number' ? set.reps : null,
          weight: typeof set.weight === 'number' ? set.weight : null, durationSeconds: typeof set.durationSeconds === 'number' ? set.durationSeconds : null,
          distanceMeters: typeof set.distanceMeters === 'number' ? set.distanceMeters : null, rpe: typeof set.rpe === 'number' ? set.rpe : null,
          completedAt: set.completedAt ? new Date(set.completedAt as string) : null,
        } });
      }
    }
  }

  protected fullWorkout(tx: Tx, id: string) {
    return tx.gymWorkout.findUniqueOrThrow({ where: { id }, include: { exercises: { where: { deletedAt: null }, include: { exercise: true, sets: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } } } });
  }
}

