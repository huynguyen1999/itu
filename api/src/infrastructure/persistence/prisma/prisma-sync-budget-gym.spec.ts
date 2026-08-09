import { PrismaSyncBudgetGym } from './prisma-sync-budget-gym';

describe('PrismaSyncBudgetGym', () => {
  it('registers canonical and compatibility mutation names', () => {
    const handler = new PrismaSyncBudgetGym();
    expect(handler.kinds).toEqual(expect.arrayContaining([
      'budgettransaction.create',
      'gymworkout.create',
      'budgetpreferences.upsert',
      'moneycategory.create',
      'moneycategory.reorder',
      'moneycategory.update',
      'moneycategory.delete',
      'moneybudgetperiod.update',
      'moneycategorybudget.upsert',
      'moneycategorybudget.delete',
      'exercisedefinition.create',
      'exercisedefinition.update',
      'exercisedefinition.delete',
      'gymworkout.complete',
      'gymworkout.abandon',
    ]));
  });

  it('merges preference patches with the stored object', async () => {
    const handler = new PrismaSyncBudgetGym();
    const upsert = jest.fn().mockResolvedValue({ userId: 'u1', budgetPreferences: { theme: 'dark', currency: 'VND' } });
    const tx = {
      userPreferences: { findUnique: jest.fn().mockResolvedValue({ userId: 'u1', budgetPreferences: { theme: 'dark' } }), upsert },
      syncChange: { create: jest.fn() },
    } as any;
    await handler.applyMutation(tx, 'u1', { id: 'm1', kind: 'budgetpreferences.upsert', entityId: 'u1', payload: { preferences: { currency: 'VND' } } } as any);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { budgetPreferences: { theme: 'dark', currency: 'VND' } } }));
  });
});
