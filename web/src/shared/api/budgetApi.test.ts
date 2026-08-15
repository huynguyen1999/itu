import { describe, expect, it, vi } from 'vitest';
import { createBudgetApi } from './budgetApi';

describe('offline-first budget mutations', () => {
  it('requests aggregate statistics for an explicit date range', async () => {
    const request = vi.fn().mockResolvedValue({});
    const api = createBudgetApi({ request, stream: async () => new ReadableStream(), offlineMutation: vi.fn() });

    await api.getBudgetStatistics('2026-08-01', '2026-08-09');

    expect(request).toHaveBeenCalledWith('/budget/statistics?from=2026-08-01&to=2026-08-09');
  });

  it('canonicalizes VND amounts as decimal strings in the queued payload', async () => {
    const mutations: Array<Record<string, unknown>> = [];
    const api = createBudgetApi({
      request: vi.fn().mockResolvedValue({}),
      stream: async () => new ReadableStream(),
      offlineMutation: async (input) => {
        mutations.push(input as unknown as Record<string, unknown>);
        return input.optimistic;
      },
    });

    await api.createBudgetExpense({ amount: 12.5, categoryId: 'category-1', expenseDate: '2026-08-15' });

    expect(mutations[0]).toMatchObject({
      kind: 'expense.create',
      payload: { amount: '12.50', categoryId: 'category-1', expenseDate: '2026-08-15', paymentMethod: 'CASH' },
      optimistic: { amount: '12.50', categoryId: 'category-1' },
    });
  });

  it('queues category limits with the v2 mutation contract', async () => {
    const mutations: Array<Record<string, unknown>> = [];
    const api = createBudgetApi({
      request: vi.fn().mockResolvedValue({}),
      stream: async () => new ReadableStream(),
      offlineMutation: async (input) => {
        mutations.push(input as unknown as Record<string, unknown>);
        return input.optimistic;
      },
    });

    await api.updateBudgetCategoryLimit('2026-08', 'category-1', '1000');

    expect(mutations[0]).toMatchObject({
      kind: 'categorybudget.upsert',
      payload: { period: '2026-08', categoryId: 'category-1', limit: '1000.00' },
    });
  });
});
