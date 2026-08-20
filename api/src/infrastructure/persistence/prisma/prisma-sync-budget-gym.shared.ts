import { Prisma } from '@prisma/client';
import { InvalidSyncMutationException } from '@core/domain/exceptions';

export const BUDGET_KINDS = [
  'expense.create', 'expense.update', 'expense.delete', 'expense.restore',
  'recurringexpense.create', 'recurringexpense.update', 'recurringexpense.archive',
  'recurringexpense.confirm', 'recurringexpense.skip',
];
export const GYM_KINDS = ['gymworkout.create', 'gymworkout.update', 'gymworkout.delete', 'gymworkout.restore', 'gym_workout.create', 'gym_workout.update', 'gym_workout.delete', 'gym_workout.restore'];
export const ROUTINE_KINDS = [
  'gymroutine.create', 'gymroutine.update', 'gymroutine.delete', 'gymroutine.archive', 'gymroutine.restore',
  'gymroutineexercise.create', 'gymroutineexercise.update', 'gymroutineexercise.delete',
];
export const GRANULAR_GYM_KINDS = [
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
export const PREFERENCE_KINDS = [
  'budgetpreferences.upsert',
  'budgetpreferences.update',
  'gympreferences.upsert',
  'gympreferences.update',
  'journalpreferences.upsert',
  'journalpreferences.update',
  'calendarpreferences.upsert',
  'calendarpreferences.update',
];
export const MONEY_GYM_KINDS = [
  'expensecategory.create', 'expensecategory.reorder', 'expensecategory.update', 'expensecategory.archive',
  'monthlybudget.update', 'categorybudget.upsert', 'categorybudget.delete',
  'exercisedefinition.create', 'exercisedefinition.update', 'exercisedefinition.delete', 'exercisedefinition.restore',
  'gymworkout.complete', 'gymworkout.abandon',
];
export const CATEGORY_ICONS = new Set(['food', 'transport', 'shopping', 'bills', 'health', 'education', 'entertainment', 'fitness', 'travel', 'other']);
export const CATEGORY_COLORS = new Set(['EMERALD', 'BLUE', 'VIOLET', 'AMBER', 'ROSE', 'INDIGO', 'TEAL', 'SLATE']);
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const PERIOD_PATTERN = /^(\d{4})-(\d{2})$/;
export const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
export function validateCategoryVisuals(icon: string | null | undefined, color: string | null | undefined): void {
  if (icon !== undefined && icon !== null && !CATEGORY_ICONS.has(icon)) throw new InvalidSyncMutationException('Unsupported budget category icon');
  if (color !== undefined && color !== null && !CATEGORY_COLORS.has(color.toUpperCase())) throw new InvalidSyncMutationException('Unsupported budget category color');
}
export function dateOnly(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) throw new InvalidSyncMutationException(field + ' must be a YYYY-MM-DD value');
  const parsed = new Date(value + 'T00:00:00.000Z');
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new InvalidSyncMutationException(field + ' must be a valid calendar date');
  return parsed;
}
export function budgetPeriod(value: unknown): string {
  if (typeof value !== 'string') throw new InvalidSyncMutationException('period must be a valid YYYY-MM value');
  const match = PERIOD_PATTERN.exec(value);
  const month = match ? Number(match[2]) : 0;
  if (!match || month < 1 || month > 12) throw new InvalidSyncMutationException('period must be a valid YYYY-MM value');
  return value;
}
export function money(value: unknown, field: string): Prisma.Decimal {
  if (typeof value !== 'string' || !MONEY_PATTERN.test(value)) throw new InvalidSyncMutationException(`${field} must be a non-negative decimal string`);
  return new Prisma.Decimal(value);
}

export const BUDGET_MONEY_KINDS = MONEY_GYM_KINDS.filter((kind) => kind.startsWith('expensecategory.') || kind.startsWith('monthlybudget.') || kind.startsWith('categorybudget.'));
