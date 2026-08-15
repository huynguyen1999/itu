/** Canonical mutation/entity names shared by the offline Budget and Gym paths. */
export const SYNC_KINDS = {
  budgetCategory: {
    create: 'expensecategory.create',
    update: 'expensecategory.update',
    archive: 'expensecategory.archive',
    reorder: 'expensecategory.reorder',
  },
  monthlyBudget: { update: 'monthlybudget.update' },
  categoryBudget: {
    upsert: 'categorybudget.upsert',
    delete: 'categorybudget.delete',
  },
  expense: {
    create: 'expense.create',
    update: 'expense.update',
    delete: 'expense.delete',
    restore: 'expense.restore',
  },
  recurringExpense: {
    create: 'recurringexpense.create',
    update: 'recurringexpense.update',
    archive: 'recurringexpense.archive',
    confirm: 'recurringexpense.confirm',
    skip: 'recurringexpense.skip',
  },
  budgetPreferences: { update: 'budgetpreferences.update' },
  calendarPreferences: { update: 'calendarpreferences.update' },
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
  gymRoutine: {
    create: 'gymroutine.create',
    update: 'gymroutine.update',
    delete: 'gymroutine.delete',
    archive: 'gymroutine.archive',
    restore: 'gymroutine.restore',
  },
  gymRoutineExercise: {
    create: 'gymroutineexercise.create',
    update: 'gymroutineexercise.update',
    delete: 'gymroutineexercise.delete',
  },
  journal: { restore: 'journal.restore' },
  gymPreferences: { update: 'gympreferences.update' },
  habit: {
    checkIn: 'habitoccurrence.checkin',
    action: 'habitoccurrence.action',
    checklist: 'habitoccurrence.checklist',
  },
} as const;
