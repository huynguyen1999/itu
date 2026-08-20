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

export class PrismaSyncGranularGymMutations extends PrismaSyncGymMutationSupport {
  readonly kinds: readonly string[] = GRANULAR_GYM_KINDS;

  async applyMutation(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null | undefined> {
    if (GRANULAR_GYM_KINDS.includes(mutation.kind)) return this.applyGranularGym(tx, userId, mutation);
    return undefined;
  }

  private canonicalGranularKind(kind: string): string {
    if (kind === 'gymworkout.finish' || kind === 'workout.complete') return 'workout.finish';
    if (kind.startsWith('gymworkoutexercise.')) return kind.replace('gymworkoutexercise.', 'workout-exercise.');
    if (kind.startsWith('workout_exercise.')) return kind.replace('workout_exercise.', 'workout-exercise.');
    if (kind.startsWith('workoutexercise.')) return kind.replace('workoutexercise.', 'workout-exercise.');
    if (kind.startsWith('gymworkoutset.')) return kind.replace('gymworkoutset.', 'workout-set.');
    if (kind.startsWith('workout_set.')) return kind.replace('workout_set.', 'workout-set.');
    if (kind.startsWith('workoutset.')) return kind.replace('workoutset.', 'workout-set.');
    return kind;
  }

  private async applyGranularGym(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const kind = this.canonicalGranularKind(mutation.kind);
    if (kind === 'workout.create') return this.createGranularWorkout(tx, userId, mutation);
    if (kind === 'workout.update') return this.updateGranularWorkout(tx, userId, mutation);
    if (kind === 'workout.finish') return this.finishGranularWorkout(tx, userId, mutation);
    if (kind === 'workout.delete') return this.deleteGranularWorkout(tx, userId, mutation);
    if (kind.startsWith('workout-exercise.')) return this.applyGranularWorkoutExercise(tx, userId, mutation, kind);
    return this.applyGranularWorkoutSet(tx, userId, mutation, kind);
  }

  private async createGranularWorkout(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    assertClientId(mutation.entityId);
    const existing = await tx.gymWorkout.findFirst({ where: { id: mutation.entityId } });
    if (existing) {
      if (existing.userId !== userId) throw new InvalidSyncMutationException('Workout does not belong to user');
      return stale(mutation, 'workout', existing);
    }
    const payload = mutation.payload;
    if (payload.status === 'COMPLETED') throw new InvalidSyncMutationException('Workouts must be finished after creation');
    const status = GymWorkoutStatus.IN_PROGRESS;
    if (await tx.gymWorkout.findFirst({ where: { userId, status, deletedAt: null } })) {
      return { mutationId: mutation.id, entityType: 'workout', entityId: mutation.entityId, reason: 'STALE_VERSION', serverData: null, localDraft: payload };
    }
    const startedAt = this.dateValue(payload, 'startedAt') ?? new Date(mutation.occurredAt);
    const workout = await tx.gymWorkout.create({
      data: {
        id: mutation.entityId,
        userId,
        title: optionalString(payload, 'title'),
        source: optionalString(payload, 'source'),
        status,
        startedAt,
        endedAt: null,
        durationMinutes: null,
      },
    });
    await recordSyncChange(tx, userId, 'workout', workout.id, 'UPSERT', workout);
    return null;
  }

  private async updateGranularWorkout(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const workout = await tx.gymWorkout.findFirst({ where: { id: mutation.entityId, userId, deletedAt: null } });
    if (!workout) return notFound(mutation, 'workout');
    if (mutation.payload.status !== undefined) throw new InvalidSyncMutationException('Workout status changes must use the workout lifecycle');

    // This canonical mutation intentionally patches workout metadata only. Child
    // hierarchy changes have their own granular mutation kinds.
    const merged = await this.resolveGranularFields(tx, userId, mutation, 'workout', workout);
    if (merged.resolvedPayload === null || merged.resolvedPayload.title === undefined) return null;
    const title = merged.resolvedPayload.title;
    if (title !== null && typeof title !== 'string') throw new InvalidSyncMutationException('title must be a string');
    const updated = await tx.gymWorkout.update({
      where: { id: workout.id },
      data: { title: title === null ? null : title.trim(), version: { increment: 1 } },
    });
    await this.writeGranularClocks(tx, userId, mutation, 'workout', merged.updatedClocks);
    await recordSyncChange(tx, userId, 'workout', updated.id, 'UPSERT', updated);
    return null;
  }

  private async finishGranularWorkout(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const workout = await tx.gymWorkout.findFirst({ where: { id: mutation.entityId, userId, deletedAt: null } });
    if (!workout) return notFound(mutation, 'workout');
    if (mutation.baseVersion !== undefined && mutation.baseVersion !== workout.version) return stale(mutation, 'workout', workout);
    const endedAt = this.dateValue(mutation.payload, 'endedAt') ?? new Date(mutation.occurredAt);
    await tx.gymWorkoutSet.updateMany({
      where: { workoutExercise: { workoutId: workout.id }, completedAt: null, deletedAt: null },
      data: { deletedAt: endedAt, version: { increment: 1 } },
    });
    await tx.gymWorkoutExercise.updateMany({
      where: {
        workoutId: workout.id,
        deletedAt: null,
        sets: { none: { completedAt: { not: null }, deletedAt: null } },
      },
      data: { deletedAt: endedAt, version: { increment: 1 } },
    });
    const updated = await tx.gymWorkout.update({
      where: { id: workout.id },
      data: {
        status: GymWorkoutStatus.COMPLETED,
        endedAt,
        durationMinutes: this.numberValue(mutation.payload, 'durationMinutes') ?? workout.durationMinutes,
        version: { increment: 1 },
      },
    });
    await recordSyncChange(tx, userId, 'workout', updated.id, 'UPSERT', await this.fullWorkout(tx, updated.id));
    return null;
  }

  private async deleteGranularWorkout(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const workout = await tx.gymWorkout.findFirst({ where: { id: mutation.entityId, userId } });
    if (!workout) return notFound(mutation, 'workout');
    if (mutation.baseVersion !== undefined && mutation.baseVersion !== workout.version) return stale(mutation, 'workout', workout);
    const deleted = await tx.gymWorkout.update({
      where: { id: workout.id },
      data: { deletedAt: new Date(mutation.occurredAt), deletedByDeviceId: mutation.serverDeviceId ?? null, version: { increment: 1 } },
    });
    await recordSyncChange(tx, userId, 'workout', deleted.id, 'DELETE', { id: deleted.id });
    return null;
  }

  private async applyGranularWorkoutExercise(tx: Tx, userId: string, mutation: SyncMutation, kind: string): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    if (kind.endsWith('.create')) {
      assertClientId(mutation.entityId);
      const workoutId = requiredString(payload, 'workoutId');
      const workout = await tx.gymWorkout.findFirst({ where: { id: workoutId, userId, deletedAt: null } });
      if (!workout) return notFound(mutation, 'workout');
      const definition = await tx.exerciseDefinition.findFirst({ where: { id: requiredString(payload, 'exerciseId'), userId, deletedAt: null } });
      if (!definition) return notFound(mutation, 'exercisedefinition');
      const existing = await tx.gymWorkoutExercise.findFirst({ where: { id: mutation.entityId } });
      if (existing) return existing.workoutId === workoutId ? stale(mutation, 'workout-exercise', existing) : notFound(mutation, 'workout-exercise');
      const created = await tx.gymWorkoutExercise.create({
        data: {
          id: mutation.entityId,
          workoutId,
          exerciseId: definition.id,
          exerciseName: definition.name,
          metricType: definition.metricType,
          weightUnit: definition.defaultWeightUnit,
          sortOrder: this.numberValue(payload, 'sortOrder') ?? 0,
          note: payload.note === undefined ? null : this.nullableString(payload, 'note'),
          restSeconds: this.numberValue(payload, 'restSeconds'),
        },
      });
      await recordSyncChange(tx, userId, 'workout-exercise', created.id, 'UPSERT', created);
      return null;
    }

    const row = await tx.gymWorkoutExercise.findFirst({
      where: { id: mutation.entityId, deletedAt: null, workout: { userId, deletedAt: null } },
    });
    if (!row) return notFound(mutation, 'workout-exercise');
    if (kind.endsWith('.delete')) {
      if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'workout-exercise', row);
      const deleted = await tx.gymWorkoutExercise.update({ where: { id: row.id }, data: { deletedAt: new Date(mutation.occurredAt), deletedByDeviceId: mutation.serverDeviceId ?? null, version: { increment: 1 } } });
      await recordSyncChange(tx, userId, 'workout-exercise', deleted.id, 'DELETE', { id: deleted.id });
      return null;
    }
    const merged = await this.resolveGranularFields(tx, userId, mutation, 'workout-exercise', row);
    if (merged.resolvedPayload === null) return null;
    return this.updateGranularWorkoutExercise(tx, userId, mutation, row, merged.resolvedPayload, merged.updatedClocks);
  }

  private async updateGranularWorkoutExercise(tx: Tx, userId: string, mutation: SyncMutation, row: any, payload: Record<string, unknown>, updatedClocks: Array<{ fieldName: string; editedAt: Date }>): Promise<SyncConflict | null> {
    const data: Record<string, unknown> = {};
    if (payload.exerciseId !== undefined) {
      const definition = await tx.exerciseDefinition.findFirst({ where: { id: requiredString(payload, 'exerciseId'), userId, deletedAt: null } });
      if (!definition) return notFound(mutation, 'exercisedefinition');
      data.exerciseId = definition.id;
      data.exerciseName = definition.name;
      data.metricType = definition.metricType;
      data.weightUnit = definition.defaultWeightUnit;
    }
    for (const field of ['sortOrder', 'restSeconds']) if (payload[field] !== undefined) data[field] = this.numberOrNull(payload, field);
    if (payload.note !== undefined) data.note = this.nullableString(payload, 'note');
    if (Object.keys(data).length === 0) return null;
    const updated = await tx.gymWorkoutExercise.update({ where: { id: row.id }, data: { ...data, version: { increment: 1 } } });
    await this.writeGranularClocks(tx, userId, mutation, 'workout-exercise', updatedClocks);
    await recordSyncChange(tx, userId, 'workout-exercise', updated.id, 'UPSERT', updated);
    return null;
  }

  private async applyGranularWorkoutSet(tx: Tx, userId: string, mutation: SyncMutation, kind: string): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    if (kind.endsWith('.create')) {
      assertClientId(mutation.entityId);
      const workoutExerciseId = requiredString(payload, 'workoutExerciseId');
      const parent = await tx.gymWorkoutExercise.findFirst({ where: { id: workoutExerciseId, deletedAt: null, workout: { userId, deletedAt: null } } });
      if (!parent) return notFound(mutation, 'workout-exercise');
      const existing = await tx.gymWorkoutSet.findFirst({ where: { id: mutation.entityId } });
      if (existing) return existing.workoutExerciseId === workoutExerciseId ? stale(mutation, 'workout-set', existing) : notFound(mutation, 'workout-set');
      const created = await tx.gymWorkoutSet.create({
        data: {
          id: mutation.entityId,
          workoutExerciseId,
          sortOrder: this.numberValue(payload, 'sortOrder') ?? 0,
          type: enumValue(WorkoutSetType, payload.type ?? 'NORMAL', 'type'),
          reps: this.numberOrNull(payload, 'reps'),
          weight: this.numberOrNull(payload, 'weight'),
          durationSeconds: this.numberOrNull(payload, 'durationSeconds'),
          distanceMeters: this.numberOrNull(payload, 'distanceMeters'),
          rpe: this.numberOrNull(payload, 'rpe'),
          completedAt: this.dateValue(payload, 'completedAt'),
        },
      });
      await recordSyncChange(tx, userId, 'workout-set', created.id, 'UPSERT', created);
      return null;
    }

    const row = await tx.gymWorkoutSet.findFirst({ where: { id: mutation.entityId, deletedAt: null, workoutExercise: { deletedAt: null, workout: { userId, deletedAt: null } } } });
    if (!row) return notFound(mutation, 'workout-set');
    if (kind.endsWith('.delete')) {
      if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'workout-set', row);
      const deleted = await tx.gymWorkoutSet.update({ where: { id: row.id }, data: { deletedAt: new Date(mutation.occurredAt), deletedByDeviceId: mutation.serverDeviceId ?? null, version: { increment: 1 } } });
      await recordSyncChange(tx, userId, 'workout-set', deleted.id, 'DELETE', { id: deleted.id });
      return null;
    }
    if (kind.endsWith('.complete')) {
      if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'workout-set', row);
      const completed = await tx.gymWorkoutSet.update({ where: { id: row.id }, data: { completedAt: this.dateValue(payload, 'completedAt') ?? new Date(mutation.occurredAt), version: { increment: 1 } } });
      await recordSyncChange(tx, userId, 'workout-set', completed.id, 'UPSERT', completed);
      return null;
    }
    const merged = await this.resolveGranularFields(tx, userId, mutation, 'workout-set', row);
    if (merged.resolvedPayload === null) return null;
    return this.updateGranularWorkoutSet(tx, userId, mutation, row, merged.resolvedPayload, merged.updatedClocks);
  }

  private async updateGranularWorkoutSet(tx: Tx, userId: string, mutation: SyncMutation, row: any, payload: Record<string, unknown>, updatedClocks: Array<{ fieldName: string; editedAt: Date }>): Promise<SyncConflict | null> {
    const data: Record<string, unknown> = {};
    if (payload.sortOrder !== undefined) data.sortOrder = this.numberValue(payload, 'sortOrder');
    if (payload.type !== undefined) data.type = enumValue(WorkoutSetType, payload.type, 'type');
    for (const field of ['reps', 'weight', 'durationSeconds', 'distanceMeters', 'rpe']) if (payload[field] !== undefined) data[field] = this.numberOrNull(payload, field);
    if (payload.completedAt !== undefined) data.completedAt = this.dateValue(payload, 'completedAt');
    if (Object.keys(data).length === 0) return null;
    const updated = await tx.gymWorkoutSet.update({ where: { id: row.id }, data: { ...data, version: { increment: 1 } } });
    await this.writeGranularClocks(tx, userId, mutation, 'workout-set', updatedClocks);
    await recordSyncChange(tx, userId, 'workout-set', updated.id, 'UPSERT', updated);
    return null;
  }

  private async resolveGranularFields(tx: Tx, userId: string, mutation: SyncMutation, entityType: string, row: Record<string, unknown>) {
    const fields = Object.keys(mutation.payload).filter((field) => field !== 'id' && field !== 'version');
    const clocks = fields.length === 0 ? [] : await tx.syncFieldClock.findMany({ where: { userId, entityType, entityId: mutation.entityId, fieldName: { in: fields } } });
    const result = this.mergeResolver.resolveMutationFields(mutation, entityType, clocks, row, mutation.serverDeviceId ?? 'server');
    const applied = result.outcome.appliedFields;
    if (applied.length === 0) return { resolvedPayload: null, updatedClocks: [] as Array<{ fieldName: string; editedAt: Date }> };
    return result;
  }

  private async writeGranularClocks(tx: Tx, userId: string, mutation: SyncMutation, entityType: string, clocks: Array<{ fieldName: string; editedAt: Date }>): Promise<void> {
    for (const clock of clocks) {
      await tx.syncFieldClock.upsert({
        where: { userId_entityType_entityId_fieldName: { userId, entityType, entityId: mutation.entityId, fieldName: clock.fieldName } },
        create: { userId, entityType, entityId: mutation.entityId, fieldName: clock.fieldName, editedAt: clock.editedAt, deviceId: mutation.serverDeviceId ?? 'server', mutationId: mutation.id },
        update: { editedAt: clock.editedAt, deviceId: mutation.serverDeviceId ?? 'server', mutationId: mutation.id },
      });
    }
  }

  private dateValue(payload: Record<string, unknown>, key: string): Date | null {
    const value = payload[key];
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string' && !(value instanceof Date)) throw new InvalidSyncMutationException(`${key} must be a date`);
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new InvalidSyncMutationException(`${key} must be a valid date`);
    return date;
  }

  private numberValue(payload: Record<string, unknown>, key: string): number | null {
    const value = payload[key];
    if (value === undefined || value === null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new InvalidSyncMutationException(`${key} must be a number`);
    return value;
  }

  private nullableString(payload: Record<string, unknown>, key: string): string | null {
    const value = payload[key];
    if (value === null) return null;
    if (typeof value !== 'string') throw new InvalidSyncMutationException(`${key} must be a string`);
    return value.trim();
  }


}

