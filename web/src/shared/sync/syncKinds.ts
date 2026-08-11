/** Canonical mutation/entity names shared by the offline Budget and Gym paths. */
export const SYNC_KINDS = {
  budgetCategory: {
    create: 'moneycategory.create',
    update: 'moneycategory.update',
    delete: 'moneycategory.delete',
    reorder: 'moneycategory.reorder',
  },
  budgetPeriod: { update: 'moneybudgetperiod.update' },
  budgetCategoryLimit: {
    upsert: 'moneycategorybudget.upsert',
    delete: 'moneycategorybudget.delete',
  },
  budgetTransaction: {
    create: 'budgettransaction.create',
    update: 'budgettransaction.update',
    delete: 'budgettransaction.delete',
    restore: 'budgettransaction.restore',
  },
  budgetPreferences: { update: 'budgetpreferences.update' },
  exerciseDefinition: {
    create: 'exercisedefinition.create',
    update: 'exercisedefinition.update',
    delete: 'exercisedefinition.delete',
    restore: 'exercisedefinition.restore',
  },
  gymWorkout: {
    create: 'gymworkout.create',
    update: 'gymworkout.update',
    delete: 'gymworkout.delete',
    restore: 'gymworkout.restore',
  },
  /** Stable-ID Gym logger mutations. Keep semantic transitions as distinct kinds. */
  workout: {
    create: 'workout.create',
    update: 'workout.update',
    finish: 'workout.finish',
    delete: 'workout.delete',
  },
  workoutExercise: {
    create: 'workout-exercise.create',
    update: 'workout-exercise.update',
    delete: 'workout-exercise.delete',
  },
  workoutSet: {
    create: 'workout-set.create',
    update: 'workout-set.update',
    complete: 'workout-set.complete',
    delete: 'workout-set.delete',
  },
  journal: { restore: 'journal.restore' },
  gymPreferences: { update: 'gympreferences.update' },
} as const;
