import { ExerciseMetricType, GymWorkoutStatus, PaymentMethod, Prisma, TransactionType, WeightUnit, WorkoutSetType } from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { Tx, recordSyncChange } from './prisma-sync-mutation.shared';
import { assertClientId, enumValue, fieldConflict, notFound, optionalString, requiredString, stale } from './prisma-sync.helpers';
import { createUlid } from './ulid';
import { SyncMergeResolver } from './sync-merge-resolver';
import { validateCalendarPreferences } from '@core/application/use-cases/preferences.service';

const BUDGET_KINDS = ['budgettransaction.create', 'budgettransaction.update', 'budgettransaction.delete', 'budgettransaction.restore', 'budget_transaction.create', 'budget_transaction.update', 'budget_transaction.delete', 'budget_transaction.restore'];
const GYM_KINDS = ['gymworkout.create', 'gymworkout.update', 'gymworkout.delete', 'gymworkout.restore', 'gym_workout.create', 'gym_workout.update', 'gym_workout.delete', 'gym_workout.restore'];
const GRANULAR_GYM_KINDS = [
  'workout.create', 'workout.update', 'workout.finish', 'workout.complete', 'workout.delete',
  'workout-exercise.create', 'workout-exercise.update', 'workout-exercise.delete',
  'workout_exercise.create', 'workout_exercise.update', 'workout_exercise.delete',
  'workoutexercise.create', 'workoutexercise.update', 'workoutexercise.delete',
  'workout_set.create', 'workout_set.update', 'workout_set.complete', 'workout_set.delete',
  'workout-set.create', 'workout-set.update', 'workout-set.complete', 'workout-set.delete',
  'workoutset.create', 'workoutset.update', 'workoutset.complete', 'workoutset.delete',
  'gymworkout.finish', 'gymworkoutexercise.create', 'gymworkoutexercise.update', 'gymworkoutexercise.delete',
  'gymworkoutset.create', 'gymworkoutset.update', 'gymworkoutset.complete', 'gymworkoutset.delete',
];
const PREFERENCE_KINDS = [
  'budgetpreferences.upsert',
  'budgetpreferences.update',
  'gympreferences.upsert',
  'gympreferences.update',
  'journalpreferences.upsert',
  'journalpreferences.update',
  'calendarpreferences.upsert',
  'calendarpreferences.update',
];
const MONEY_GYM_KINDS = [
  'moneycategory.create', 'moneycategory.reorder', 'moneycategory.update', 'moneycategory.delete',
  'moneybudgetperiod.update', 'moneycategorybudget.upsert', 'moneycategorybudget.delete',
  'exercisedefinition.create', 'exercisedefinition.update', 'exercisedefinition.delete', 'exercisedefinition.restore',
  'gymworkout.complete', 'gymworkout.abandon',
];
const CATEGORY_ICONS = new Set(['food', 'transport', 'shopping', 'bills', 'health', 'education', 'entertainment', 'fitness', 'travel', 'other']);
const CATEGORY_COLORS = new Set(['EMERALD', 'BLUE', 'VIOLET', 'AMBER', 'ROSE', 'INDIGO', 'TEAL', 'SLATE']);
function validateCategoryVisuals(icon: string | null | undefined, color: string | null | undefined): void {
  if (icon !== undefined && icon !== null && !CATEGORY_ICONS.has(icon)) throw new InvalidSyncMutationException('Unsupported budget category icon');
  if (color !== undefined && color !== null && !CATEGORY_COLORS.has(color.toUpperCase())) throw new InvalidSyncMutationException('Unsupported budget category color');
}

export class PrismaSyncBudgetGym {
  readonly kinds: readonly string[] = [...BUDGET_KINDS, ...GYM_KINDS, ...GRANULAR_GYM_KINDS, ...PREFERENCE_KINDS, ...MONEY_GYM_KINDS];
  private readonly mergeResolver = new SyncMergeResolver();

  async applyMutation(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null | undefined> {
    if (GRANULAR_GYM_KINDS.includes(mutation.kind)) return this.applyGranularGym(tx, userId, mutation);
    if (BUDGET_KINDS.includes(mutation.kind)) return this.applyBudget(tx, userId, mutation);
    if (GYM_KINDS.includes(mutation.kind)) return this.applyGym(tx, userId, mutation);
    if (PREFERENCE_KINDS.includes(mutation.kind)) return this.applyPreferences(tx, userId, mutation);
    if (MONEY_GYM_KINDS.includes(mutation.kind)) return this.applyMoneyGym(tx, userId, mutation);
    return undefined;
  }

  private async applyPreferences(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const key = mutation.kind.startsWith('gym')
      ? 'gymPreferences'
      : mutation.kind.startsWith('journal')
        ? 'journalPreferences'
        : mutation.kind.startsWith('calendar')
          ? 'calendarPreferences'
          : 'budgetPreferences';
    const value = mutation.payload.preferences ?? mutation.payload.value ?? mutation.payload;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new InvalidSyncMutationException('Preferences payload must be an object');
    const current = await tx.userPreferences.findUnique({ where: { userId } });
    const existing = current?.[key] && typeof current[key] === 'object' && !Array.isArray(current[key]) ? current[key] as Record<string, unknown> : {};
    const merged = { ...existing, ...(value as Record<string, unknown>) };
    let normalized: object = merged;
    if (key === 'calendarPreferences') {
      try {
        normalized = validateCalendarPreferences(merged as any);
      } catch (error) {
        throw new InvalidSyncMutationException(error instanceof Error ? error.message : 'Invalid calendar preferences');
      }
    }
    const record = await tx.userPreferences.upsert({ where: { userId }, create: { userId, [key]: normalized as Prisma.InputJsonValue }, update: { [key]: normalized as Prisma.InputJsonValue } });
    await recordSyncChange(tx, userId, key.toLowerCase(), userId, 'UPSERT', record);
    return null;
  }

  private async applyMoneyGym(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    if (mutation.kind.startsWith('moneycategory.')) {
      if (mutation.kind === 'moneycategory.reorder') {
        const ids = Array.isArray(payload.categoryIds) ? payload.categoryIds.filter((id): id is string => typeof id === 'string') : [];
        for (const [sortOrder, id] of ids.entries()) {
          const row = await tx.budgetCategory.findFirst({ where: { id, userId } });
          if (!row) continue;
          const updated = await tx.budgetCategory.update({ where: { id }, data: { sortOrder, version: { increment: 1 } } });
          await recordSyncChange(tx, userId, 'moneycategory', updated.id, 'UPSERT', updated);
        }
        return null;
      }
      if (mutation.kind.endsWith('.create')) {
        assertClientId(mutation.entityId);
        validateCategoryVisuals(optionalString(payload, 'icon'), optionalString(payload, 'color'));
        const row = await tx.budgetCategory.upsert({ where: { id: mutation.entityId }, create: { id: mutation.entityId, userId, name: requiredString(payload, 'name'), type: enumValue(TransactionType, payload.type ?? 'EXPENSE', 'type'), icon: optionalString(payload, 'icon'), color: optionalString(payload, 'color')?.toUpperCase(), sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : 0 }, update: {} });
        await recordSyncChange(tx, userId, 'moneycategory', row.id, 'UPSERT', row);
        return null;
      }
      const row = await tx.budgetCategory.findFirst({ where: { id: mutation.entityId, userId } });
      if (!row) return notFound(mutation, 'moneycategory');
      if (mutation.kind.endsWith('.delete')) {
        const updated = await tx.budgetCategory.update({ where: { id: row.id }, data: { archivedAt: new Date(), version: { increment: 1 } } });
        await recordSyncChange(tx, userId, 'moneycategory', updated.id, 'DELETE', { id: updated.id });
        return null;
      }
      const conflict = fieldConflict(mutation, 'moneycategory', row);
      if (conflict) return conflict;
      validateCategoryVisuals(payload.icon === undefined ? row.icon : optionalString(payload, 'icon'), payload.color === undefined ? row.color : optionalString(payload, 'color'));
      const updated = await tx.budgetCategory.update({ where: { id: row.id }, data: { name: payload.name === undefined ? row.name : requiredString(payload, 'name'), type: payload.type === undefined ? row.type : enumValue(TransactionType, payload.type, 'type'), icon: payload.icon === undefined ? row.icon : optionalString(payload, 'icon'), color: payload.color === undefined ? row.color : optionalString(payload, 'color')?.toUpperCase(), sortOrder: typeof payload.sortOrder === 'number' ? payload.sortOrder : row.sortOrder, version: { increment: 1 } } });
      await recordSyncChange(tx, userId, 'moneycategory', updated.id, 'UPSERT', updated);
      return null;
    }
    if (mutation.kind === 'moneybudgetperiod.update') {
      const period = requiredString(payload, 'period');
      const existing = await tx.budgetPeriod.findFirst({ where: { userId, period } });
      const row = existing ? await tx.budgetPeriod.update({ where: { id: existing.id }, data: { period: payload.period === undefined ? existing.period : period, currency: payload.currency === undefined ? existing.currency : requiredString(payload, 'currency'), overallLimit: payload.overallLimit === undefined ? existing.overallLimit : new Prisma.Decimal(String(payload.overallLimit)), version: { increment: 1 } } }) : await tx.budgetPeriod.create({ data: { id: createUlid(), userId, period, currency: optionalString(payload, 'currency') ?? 'VND', overallLimit: new Prisma.Decimal(String(payload.overallLimit ?? '0')) } });
      await recordSyncChange(tx, userId, 'moneybudgetperiod', row.id, 'UPSERT', row);
      return null;
    }
    if (mutation.kind.startsWith('moneycategorybudget.')) {
      const categoryId = requiredString(payload, 'categoryId');
      const period = payload.period === undefined ? undefined : requiredString(payload, 'period');
      const periodRow = await tx.budgetPeriod.findFirst({ where: { userId, ...(payload.budgetPeriodId ? { id: requiredString(payload, 'budgetPeriodId') } : { period }) } });
      if (!periodRow || !(await tx.budgetCategory.findFirst({ where: { id: categoryId, userId } }))) return notFound(mutation, 'moneycategorybudget');
      if (mutation.kind.endsWith('.delete')) {
        await tx.budgetCategoryLimit.deleteMany({ where: { budgetPeriodId: periodRow.id, categoryId } });
        await recordSyncChange(tx, userId, 'moneycategorybudget', `${periodRow.id}:${categoryId}`, 'DELETE', { budgetPeriodId: periodRow.id, categoryId });
      } else {
        const row = await tx.budgetCategoryLimit.upsert({ where: { budgetPeriodId_categoryId: { budgetPeriodId: periodRow.id, categoryId } }, create: { id: mutation.entityId || createUlid(), budgetPeriodId: periodRow.id, categoryId, limit: new Prisma.Decimal(String(payload.limit ?? '0')) }, update: { limit: new Prisma.Decimal(String(payload.limit ?? '0')) } });
        await recordSyncChange(tx, userId, 'moneycategorybudget', row.id, 'UPSERT', row);
      }
      return null;
    }
    if (mutation.kind.startsWith('exercisedefinition.')) return this.applyExerciseDefinition(tx, userId, mutation);
    if (mutation.kind === 'gymworkout.complete' || mutation.kind === 'gymworkout.abandon') return this.applyGymLifecycle(tx, userId, mutation);
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

  private numberOrNull(payload: Record<string, unknown>, key: string): number | null | undefined {
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

  private nullableString(payload: Record<string, unknown>, key: string): string | null {
    const value = payload[key];
    if (value === null) return null;
    if (typeof value !== 'string') throw new InvalidSyncMutationException(`${key} must be a string`);
    return value.trim();
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

  private async applyBudget(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null> {
    const payload = mutation.payload;
    if (mutation.kind.endsWith('.create')) {
      assertClientId(mutation.entityId);
      const categoryId = requiredString(payload, 'categoryId');
      const category = await tx.budgetCategory.findFirst({ where: { id: categoryId, userId } });
      if (!category) return notFound(mutation, 'moneycategory');
      const row = await tx.budgetTransaction.upsert({
        where: { id: mutation.entityId },
        create: {
          id: mutation.entityId,
          userId,
          type: enumValue(TransactionType, payload.type ?? 'EXPENSE', 'type'),
          amount: new Prisma.Decimal(String(payload.amount ?? '0')),
          currency: optionalString(payload, 'currency') ?? 'VND',
          categoryId,
          merchant: optionalString(payload, 'merchant'),
          paymentMethod: enumValue(PaymentMethod, payload.paymentMethod ?? 'CASH', 'paymentMethod'),
          accountId: optionalString(payload, 'accountId'),
          transactionAt: payload.transactionAt ? new Date(payload.transactionAt as string) : new Date(),
          note: optionalString(payload, 'note'),
        },
        update: {},
        include: { categoryRel: true },
      });
      await recordSyncChange(tx, userId, 'budgettransaction', row.id, 'UPSERT', row);
      return null;
    }
    const row = await tx.budgetTransaction.findFirst({ where: { id: mutation.entityId, userId }, include: { categoryRel: true } });
    if (!row) return notFound(mutation, 'budgettransaction');
    if (mutation.kind.endsWith('.restore')) {
      if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'budgettransaction', row);
      const restored = await tx.budgetTransaction.update({ where: { id: row.id }, data: { deletedAt: null, deletedByDeviceId: null, version: { increment: 1 } }, include: { categoryRel: true } });
      await recordSyncChange(tx, userId, 'budgettransaction', restored.id, 'UPSERT', restored);
      return null;
    }
    if (mutation.kind.endsWith('.delete')) {
      if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'budgettransaction', row);
      const deleted = await tx.budgetTransaction.update({ where: { id: row.id }, data: { deletedAt: new Date(), deletedByDeviceId: (mutation as any).serverDeviceId, version: { increment: 1 } } });
      await recordSyncChange(tx, userId, 'budgettransaction', deleted.id, 'DELETE', { id: deleted.id });
      return null;
    }
    const conflict = fieldConflict(mutation, 'budgettransaction', row);
    if (conflict) return conflict;
    const categoryId = payload.categoryId === undefined ? row.categoryId : requiredString(payload, 'categoryId');
    if (payload.categoryId !== undefined && !(await tx.budgetCategory.findFirst({ where: { id: categoryId, userId } }))) return notFound(mutation, 'moneycategory');
    const updated = await tx.budgetTransaction.update({
      where: { id: row.id },
      data: {
        type: payload.type === undefined ? row.type : enumValue(TransactionType, payload.type, 'type'),
        amount: payload.amount === undefined ? row.amount : new Prisma.Decimal(String(payload.amount)),
        currency: payload.currency === undefined ? row.currency : requiredString(payload, 'currency'),
        categoryId,
        merchant: payload.merchant === undefined ? row.merchant : optionalString(payload, 'merchant'),
        paymentMethod: payload.paymentMethod === undefined ? row.paymentMethod : enumValue(PaymentMethod, payload.paymentMethod, 'paymentMethod'),
        accountId: payload.accountId === undefined ? row.accountId : optionalString(payload, 'accountId'),
        transactionAt: payload.transactionAt === undefined ? row.transactionAt : new Date(payload.transactionAt as string),
        note: payload.note === undefined ? row.note : optionalString(payload, 'note'),
        version: { increment: 1 },
      },
      include: { categoryRel: true },
    });
    await recordSyncChange(tx, userId, 'budgettransaction', updated.id, 'UPSERT', updated);
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

  private async replaceExercises(tx: Tx, userId: string, workoutId: string, raw: unknown) {
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

  private fullWorkout(tx: Tx, id: string) {
    return tx.gymWorkout.findUniqueOrThrow({ where: { id }, include: { exercises: { where: { deletedAt: null }, include: { exercise: true, sets: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } } } });
  }
}
