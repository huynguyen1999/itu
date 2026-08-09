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
  },
  budgetPreferences: { update: 'budgetpreferences.update' },
  exerciseDefinition: {
    create: 'exercisedefinition.create',
    update: 'exercisedefinition.update',
    delete: 'exercisedefinition.delete',
  },
  gymWorkout: {
    create: 'gymworkout.create',
    update: 'gymworkout.update',
    delete: 'gymworkout.delete',
  },
  gymPreferences: { update: 'gympreferences.update' },
} as const;
