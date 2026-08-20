import { ExerciseMetricType, GymWorkoutStatus, PaymentMethod, Prisma, RecurringFrequency, WeightUnit, WorkoutSetType } from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { Tx, recordSyncChange } from './prisma-sync-mutation.shared';
import { assertClientId, enumValue, fieldConflict, notFound, optionalString, requiredString, stale } from './prisma-sync.helpers';
import { createUlid } from './ulid';
import { SyncMergeResolver } from './sync-merge-resolver';
import { validateCalendarPreferences } from '@core/application/use-cases/preferences.service';
import { advanceRecurringDate } from '@core/domain/budget/recurrence';
import { BUDGET_KINDS, GYM_KINDS, ROUTINE_KINDS, GRANULAR_GYM_KINDS, PREFERENCE_KINDS, MONEY_GYM_KINDS, BUDGET_MONEY_KINDS, CATEGORY_ICONS, CATEGORY_COLORS, DATE_PATTERN, PERIOD_PATTERN, MONEY_PATTERN, validateCategoryVisuals, dateOnly, budgetPeriod, money } from './prisma-sync-budget-gym.shared';

import { PrismaSyncGymMutationSupport } from './prisma-sync-gym-mutation-support';

export class PrismaSyncGymMutations extends PrismaSyncGymMutationSupport {
  readonly kinds: readonly string[] = [
    ...GYM_KINDS,
    ...ROUTINE_KINDS,
    ...MONEY_GYM_KINDS.filter((kind) => kind.startsWith('exercisedefinition.') || kind === 'gymworkout.complete' || kind === 'gymworkout.abandon'),
  ];

  async applyMutation(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null | undefined> {
    if (ROUTINE_KINDS.includes(mutation.kind)) return this.applyRoutine(tx, userId, mutation);
    if (GYM_KINDS.includes(mutation.kind)) return this.applyGym(tx, userId, mutation);
    if (mutation.kind.startsWith('exercisedefinition.')) return this.applyExerciseDefinition(tx, userId, mutation);
    if (mutation.kind === 'gymworkout.complete' || mutation.kind === 'gymworkout.abandon') return this.applyGymLifecycle(tx, userId, mutation);
    return undefined;
  }

  private async applyRoutine(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    if (mutation.kind.startsWith('gymroutineexercise.')) {
      return this.applyRoutineExercise(tx, userId, mutation);
    }
    if (mutation.kind === 'gymroutine.create') {
      assertClientId(mutation.entityId);
      const name = requiredString(payload, 'name');
      const row = await tx.gymRoutine.upsert({
        where: { id: mutation.entityId },
        create: {
          id: mutation.entityId,
          userId,
          name,
          description: optionalString(payload, 'description'),
          sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : 0,
        },
        update: {},
      });
      await recordSyncChange(tx, userId, 'gymroutine', row.id, 'UPSERT', row);
      return null;
    }
    const row = await tx.gymRoutine.findFirst({ where: { id: mutation.entityId, userId } });
    if (!row) return notFound(mutation, 'gymroutine');
    if (mutation.kind === 'gymroutine.archive') {
      const updated = await tx.gymRoutine.update({
        where: { id: row.id },
        data: { archivedAt: new Date(), version: { increment: 1 } },
      });
      await recordSyncChange(tx, userId, 'gymroutine', updated.id, 'DELETE', { id: updated.id });
      return null;
    }
    if (mutation.kind === 'gymroutine.delete') {
      const updated = await tx.gymRoutine.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), deletedByDeviceId: (mutation as any).serverDeviceId, version: { increment: 1 } },
      });
      await recordSyncChange(tx, userId, 'gymroutine', updated.id, 'DELETE', { id: updated.id });
      return null;
    }
    if (mutation.kind === 'gymroutine.restore') {
      const updated = await tx.gymRoutine.update({
        where: { id: row.id },
        data: { deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } },
      });
      await recordSyncChange(tx, userId, 'gymroutine', updated.id, 'UPSERT', updated);
      return null;
    }
    const conflict = fieldConflict(mutation, 'gymroutine', row);
    if (conflict) return conflict;
    const updated = await tx.gymRoutine.update({
      where: { id: row.id },
      data: {
        name: payload.name === undefined ? row.name : requiredString(payload, 'name'),
        description: payload.description === undefined ? row.description : optionalString(payload, 'description'),
        sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : row.sortOrder,
        version: { increment: 1 },
      },
    });
    await recordSyncChange(tx, userId, 'gymroutine', updated.id, 'UPSERT', updated);
    return null;
  }

  private async applyRoutineExercise(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    if (mutation.kind === 'gymroutineexercise.create') {
      assertClientId(mutation.entityId);
      const routineId = requiredString(payload, 'routineId');
      const routine = await tx.gymRoutine.findFirst({ where: { id: routineId, userId, deletedAt: null } });
      if (!routine) return notFound(mutation, 'gymroutine');
      const exerciseId = requiredString(payload, 'exerciseId');
      const exercise = await tx.exerciseDefinition.findFirst({ where: { id: exerciseId, userId, deletedAt: null } });
      if (!exercise) return notFound(mutation, 'exercisedefinition');

      const created = await tx.gymRoutineExercise.create({
        data: {
          id: mutation.entityId,
          routineId,
          exerciseId,
          sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : 0,
          setCount: typeof payload.setCount === 'number' ? payload.setCount : 3,
          targetRepsMin: this.numberOrNull(payload, 'targetRepsMin'),
          targetRepsMax: this.numberOrNull(payload, 'targetRepsMax'),
          targetDurationSeconds: this.numberOrNull(payload, 'targetDurationSeconds'),
          targetDistanceMeters: this.numberOrNull(payload, 'targetDistanceMeters'),
          restSeconds: this.numberOrNull(payload, 'restSeconds'),
          note: optionalString(payload, 'note'),
        },
      });
      await recordSyncChange(tx, userId, 'gymroutineexercise', created.id, 'UPSERT', created);
      return null;
    }
    const row = await tx.gymRoutineExercise.findFirst({
      where: { id: mutation.entityId, routine: { userId } },
    });
    if (!row) return notFound(mutation, 'gymroutineexercise');
    if (mutation.kind === 'gymroutineexercise.delete') {
      const deleted = await tx.gymRoutineExercise.update({
        where: { id: row.id },
        data: { deletedAt: new Date(), deletedByDeviceId: (mutation as any).serverDeviceId, version: { increment: 1 } },
      });
      await recordSyncChange(tx, userId, 'gymroutineexercise', deleted.id, 'DELETE', { id: deleted.id });
      return null;
    }
    const conflict = fieldConflict(mutation, 'gymroutineexercise', row);
    if (conflict) return conflict;
    const updated = await tx.gymRoutineExercise.update({
      where: { id: row.id },
      data: {
        sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : row.sortOrder,
        setCount: typeof payload.setCount === 'number' ? payload.setCount : row.setCount,
        targetRepsMin: payload.targetRepsMin === undefined ? row.targetRepsMin : this.numberOrNull(payload, 'targetRepsMin'),
        targetRepsMax: payload.targetRepsMax === undefined ? row.targetRepsMax : this.numberOrNull(payload, 'targetRepsMax'),
        targetDurationSeconds: payload.targetDurationSeconds === undefined ? row.targetDurationSeconds : this.numberOrNull(payload, 'targetDurationSeconds'),
        targetDistanceMeters: payload.targetDistanceMeters === undefined ? row.targetDistanceMeters : this.numberOrNull(payload, 'targetDistanceMeters'),
        restSeconds: payload.restSeconds === undefined ? row.restSeconds : this.numberOrNull(payload, 'restSeconds'),
        note: payload.note === undefined ? row.note : optionalString(payload, 'note'),
        version: { increment: 1 },
      },
    });
    await recordSyncChange(tx, userId, 'gymroutineexercise', updated.id, 'UPSERT', updated);
    return null;
  }

  private async applyExerciseDefinition(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    if (mutation.kind.endsWith('.create')) {
      assertClientId(mutation.entityId);
      const name = requiredString(payload, 'name');
      const row = await tx.exerciseDefinition.upsert({ where: { id: mutation.entityId }, create: { id: mutation.entityId, userId, name, normalizedName: name.trim().toLowerCase(), description: optionalString(payload, 'description'), metricType: enumValue(ExerciseMetricType, payload.metricType ?? 'WEIGHT_REPS', 'metricType'), defaultWeightUnit: enumValue(WeightUnit, payload.defaultWeightUnit ?? 'KG', 'defaultWeightUnit'), equipment: optionalString(payload, 'equipment'), primaryMuscleGroup: optionalString(payload, 'primaryMuscleGroup'), secondaryMuscleGroups: Array.isArray(payload.secondaryMuscleGroups) ? payload.secondaryMuscleGroups.filter((v): v is string => typeof v === 'string') : [] }, update: {} });
      await recordSyncChange(tx, userId, 'exercisedefinition', row.id, 'UPSERT', row);
      return null;
    }
    const row = await tx.exerciseDefinition.findFirst({ where: { id: mutation.entityId, userId } });
    if (!row) return notFound(mutation, 'exercisedefinition');
    if (mutation.kind.endsWith('.delete')) { const updated = await tx.exerciseDefinition.update({ where: { id: row.id }, data: { deletedAt: new Date(), deletedByDeviceId: (mutation as any).serverDeviceId, version: { increment: 1 } } }); await recordSyncChange(tx, userId, 'exercisedefinition', updated.id, 'DELETE', { id: updated.id }); return null; }
    if (mutation.kind.endsWith('.restore')) { if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'exercisedefinition', row); const updated = await tx.exerciseDefinition.update({ where: { id: row.id }, data: { deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } } }); await recordSyncChange(tx, userId, 'exercisedefinition', updated.id, 'UPSERT', updated); return null; }
    const conflict = fieldConflict(mutation, 'exercisedefinition', row);
    if (conflict) return conflict;
    const updated = await tx.exerciseDefinition.update({ where: { id: row.id }, data: { name: payload.name === undefined ? row.name : requiredString(payload, 'name'), normalizedName: payload.name === undefined ? row.normalizedName : requiredString(payload, 'name').trim().toLowerCase(), description: payload.description === undefined ? row.description : optionalString(payload, 'description'), version: { increment: 1 } } });
    await recordSyncChange(tx, userId, 'exercisedefinition', updated.id, 'UPSERT', updated);
    return null;
  }

  private async applyGymLifecycle(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const row = await tx.gymWorkout.findFirst({ where: { id: mutation.entityId, userId, deletedAt: null } });
    if (!row) return notFound(mutation, 'gymworkout');
    if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'gymworkout', row);
    if (mutation.kind.endsWith('.abandon')) { const deleted = await tx.gymWorkout.update({ where: { id: row.id }, data: { deletedAt: new Date(), deletedByDeviceId: (mutation as any).serverDeviceId, version: { increment: 1 } } }); await recordSyncChange(tx, userId, 'gymworkout', deleted.id, 'DELETE', { id: deleted.id }); return null; }
    const endedAt = mutation.payload.endedAt ? new Date(mutation.payload.endedAt as string) : new Date(mutation.occurredAt);
    await tx.gymWorkoutSet.updateMany({ where: { workoutExercise: { workoutId: row.id }, completedAt: null, deletedAt: null }, data: { deletedAt: endedAt, version: { increment: 1 } } });
    await tx.gymWorkoutExercise.updateMany({ where: { workoutId: row.id, deletedAt: null, sets: { none: { completedAt: { not: null }, deletedAt: null } } }, data: { deletedAt: endedAt, version: { increment: 1 } } });
    const completed = await tx.gymWorkout.update({ where: { id: row.id }, data: { status: GymWorkoutStatus.COMPLETED, endedAt, durationMinutes: typeof mutation.payload.durationMinutes === 'number' ? mutation.payload.durationMinutes : row.durationMinutes, version: { increment: 1 } } });
    await recordSyncChange(tx, userId, 'gymworkout', completed.id, 'UPSERT', await this.fullWorkout(tx, completed.id));
    return null;
  }

  private async applyGym(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    if (mutation.kind.endsWith('.create')) {
      assertClientId(mutation.entityId);
      if (payload.status === 'COMPLETED') throw new InvalidSyncMutationException('Workouts must be finished after creation');
      const status = GymWorkoutStatus.IN_PROGRESS;
      if (await tx.gymWorkout.findFirst({ where: { userId, status, deletedAt: null } })) {
        return { mutationId: mutation.id, entityType: 'gymworkout', entityId: mutation.entityId, reason: 'STALE_VERSION', serverData: null, localDraft: payload };
      }
      const row = await tx.gymWorkout.upsert({
        where: { id: mutation.entityId },
        create: {
          id: mutation.entityId,
          userId,
          title: optionalString(payload, 'title'),
          source: optionalString(payload, 'source'),
          status,
          startedAt: payload.startedAt ? new Date(payload.startedAt as string) : new Date(),
          endedAt: null,
          durationMinutes: null,
        },
        update: {},
      });
      await this.replaceExercises(tx, userId, row.id, payload.exercises);
      const full = await this.fullWorkout(tx, row.id);
      await recordSyncChange(tx, userId, 'gymworkout', row.id, 'UPSERT', full);
      return null;
    }
    const row = await tx.gymWorkout.findFirst({ where: { id: mutation.entityId, userId } });
    if (!row) return notFound(mutation, 'gymworkout');
    if (payload.status !== undefined) throw new InvalidSyncMutationException('Workout status changes must use the workout lifecycle');
    if (mutation.kind.endsWith('.restore')) {
      if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'gymworkout', row);
      const restored = await tx.gymWorkout.update({ where: { id: row.id }, data: { deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } } });
      await recordSyncChange(tx, userId, 'gymworkout', restored.id, 'UPSERT', await this.fullWorkout(tx, restored.id));
      return null;
    }
    if (mutation.kind.endsWith('.delete')) {
      if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'gymworkout', row);
      const deleted = await tx.gymWorkout.update({ where: { id: row.id }, data: { deletedAt: new Date(), deletedByDeviceId: (mutation as any).serverDeviceId, version: { increment: 1 } } });
      await recordSyncChange(tx, userId, 'gymworkout', deleted.id, 'DELETE', { id: deleted.id });
      return null;
    }
    const conflict = fieldConflict(mutation, 'gymworkout', row);
    if (conflict) return conflict;
    await tx.gymWorkout.update({
      where: { id: row.id },
      data: {
        title: payload.title === undefined ? row.title : optionalString(payload, 'title'),
        source: payload.source === undefined ? row.source : optionalString(payload, 'source'),
        status: row.status,
        startedAt: payload.startedAt === undefined ? row.startedAt : new Date(payload.startedAt as string),
        endedAt: payload.endedAt === undefined ? row.endedAt : new Date(payload.endedAt as string),
        durationMinutes: payload.durationMinutes === undefined ? row.durationMinutes : (payload.durationMinutes as number),
        version: { increment: 1 },
      },
    });
    if (payload.exercises !== undefined) await this.replaceExercises(tx, userId, row.id, payload.exercises);
    const full = await this.fullWorkout(tx, row.id);
    await recordSyncChange(tx, userId, 'gymworkout', row.id, 'UPSERT', full);
    return null;
  }


}

