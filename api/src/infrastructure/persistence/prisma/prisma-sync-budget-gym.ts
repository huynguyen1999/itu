import { ExerciseMetricType, GymWorkoutStatus, PaymentMethod, Prisma, TransactionType, WeightUnit, WorkoutSetType } from '@prisma/client';
import { SyncConflict, SyncMutation } from '@core/application/ports/in/sync-use-case.port';
import { InvalidSyncMutationException } from '@core/domain/exceptions';
import { Tx, recordSyncChange } from './prisma-sync-mutation.shared';
import { assertClientId, enumValue, fieldConflict, notFound, optionalString, requiredString, stale } from './prisma-sync.helpers';
import { createUlid } from './ulid';

const BUDGET_KINDS = ['budgettransaction.create', 'budgettransaction.update', 'budgettransaction.delete', 'budget_transaction.create', 'budget_transaction.update', 'budget_transaction.delete'];
const GYM_KINDS = ['gymworkout.create', 'gymworkout.update', 'gymworkout.delete', 'gym_workout.create', 'gym_workout.update', 'gym_workout.delete'];
const PREFERENCE_KINDS = [
  'budgetpreferences.upsert',
  'budgetpreferences.update',
  'gympreferences.upsert',
  'gympreferences.update',
  'journalpreferences.upsert',
  'journalpreferences.update',
];
const MONEY_GYM_KINDS = [
  'moneycategory.create', 'moneycategory.reorder', 'moneycategory.update', 'moneycategory.delete',
  'moneybudgetperiod.update', 'moneycategorybudget.upsert', 'moneycategorybudget.delete',
  'exercisedefinition.create', 'exercisedefinition.update', 'exercisedefinition.delete',
  'gymworkout.complete', 'gymworkout.abandon',
];
const CATEGORY_ICONS = new Set(['food', 'transport', 'shopping', 'bills', 'health', 'education', 'entertainment', 'fitness', 'travel', 'other']);
const CATEGORY_COLORS = new Set(['EMERALD', 'BLUE', 'VIOLET', 'AMBER', 'ROSE', 'INDIGO', 'TEAL', 'SLATE']);
function validateCategoryVisuals(icon: string | null | undefined, color: string | null | undefined): void {
  if (icon !== undefined && icon !== null && !CATEGORY_ICONS.has(icon)) throw new InvalidSyncMutationException('Unsupported budget category icon');
  if (color !== undefined && color !== null && !CATEGORY_COLORS.has(color.toUpperCase())) throw new InvalidSyncMutationException('Unsupported budget category color');
}

export class PrismaSyncBudgetGym {
  readonly kinds: readonly string[] = [...BUDGET_KINDS, ...GYM_KINDS, ...PREFERENCE_KINDS, ...MONEY_GYM_KINDS];

  async applyMutation(tx: Tx, userId: string, mutation: SyncMutation): Promise<SyncConflict | null | undefined> {
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
        : 'budgetPreferences';
    const value = mutation.payload.preferences ?? mutation.payload.value ?? mutation.payload;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new InvalidSyncMutationException('Preferences payload must be an object');
    const current = await tx.userPreferences.findUnique({ where: { userId } });
    const existing = current?.[key] && typeof current[key] === 'object' && !Array.isArray(current[key]) ? current[key] as Record<string, unknown> : {};
    const merged = { ...existing, ...(value as Record<string, unknown>) };
    const record = await tx.userPreferences.upsert({ where: { userId }, create: { userId, [key]: merged as Prisma.InputJsonValue }, update: { [key]: merged as Prisma.InputJsonValue } });
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
    if (mutation.kind.endsWith('.delete')) { const updated = await tx.exerciseDefinition.update({ where: { id: row.id }, data: { archivedAt: new Date(), version: { increment: 1 } } }); await recordSyncChange(tx, userId, 'exercisedefinition', updated.id, 'DELETE', { id: updated.id }); return null; }
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
    if (mutation.kind.endsWith('.abandon')) { const deleted = await tx.gymWorkout.update({ where: { id: row.id }, data: { deletedAt: new Date(), version: { increment: 1 } } }); await recordSyncChange(tx, userId, 'gymworkout', deleted.id, 'DELETE', { id: deleted.id }); return null; }
    const completed = await tx.gymWorkout.update({ where: { id: row.id }, data: { status: GymWorkoutStatus.COMPLETED, endedAt: mutation.payload.endedAt ? new Date(mutation.payload.endedAt as string) : new Date(), durationMinutes: typeof mutation.payload.durationMinutes === 'number' ? mutation.payload.durationMinutes : row.durationMinutes, version: { increment: 1 } } });
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
    if (mutation.kind.endsWith('.delete')) {
      if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'budgettransaction', row);
      const deleted = await tx.budgetTransaction.update({ where: { id: row.id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
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
      const status = payload.status === 'COMPLETED' ? GymWorkoutStatus.COMPLETED : GymWorkoutStatus.IN_PROGRESS;
      if (status === GymWorkoutStatus.COMPLETED && !payload.endedAt) throw new InvalidSyncMutationException('endedAt is required for completed workouts');
      if (status === GymWorkoutStatus.IN_PROGRESS && await tx.gymWorkout.findFirst({ where: { userId, status, deletedAt: null } })) {
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
          endedAt: payload.endedAt ? new Date(payload.endedAt as string) : null,
          durationMinutes: typeof payload.durationMinutes === 'number' ? payload.durationMinutes : null,
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
    if (mutation.kind.endsWith('.delete')) {
      if (mutation.baseVersion !== undefined && mutation.baseVersion !== row.version) return stale(mutation, 'gymworkout', row);
      const deleted = await tx.gymWorkout.update({ where: { id: row.id }, data: { deletedAt: new Date(), version: { increment: 1 } } });
      await recordSyncChange(tx, userId, 'gymworkout', deleted.id, 'DELETE', { id: deleted.id });
      return null;
    }
    const conflict = fieldConflict(mutation, 'gymworkout', row);
    if (conflict) return conflict;
    const status = payload.status === undefined ? row.status : payload.status === 'COMPLETED' ? GymWorkoutStatus.COMPLETED : GymWorkoutStatus.IN_PROGRESS;
    if (status === GymWorkoutStatus.IN_PROGRESS && row.status !== GymWorkoutStatus.IN_PROGRESS && await tx.gymWorkout.findFirst({ where: { userId, status: GymWorkoutStatus.IN_PROGRESS, deletedAt: null, id: { not: row.id } } })) {
      return { mutationId: mutation.id, entityType: 'gymworkout', entityId: row.id, reason: 'STALE_VERSION', serverData: row, localDraft: payload };
    }
    await tx.gymWorkout.update({
      where: { id: row.id },
      data: {
        title: payload.title === undefined ? row.title : optionalString(payload, 'title'),
        source: payload.source === undefined ? row.source : optionalString(payload, 'source'),
        status,
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
      const definition = await tx.exerciseDefinition.findFirst({ where: { id: requiredString(exercise, 'exerciseId'), userId } });
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
    return tx.gymWorkout.findUniqueOrThrow({ where: { id }, include: { exercises: { include: { exercise: true, sets: { orderBy: { sortOrder: 'asc' } } }, orderBy: { sortOrder: 'asc' } } } });
  }
}
