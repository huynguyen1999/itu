import { describe, expect, it, vi } from 'vitest';
import { createBudgetApi } from './budgetApi';

describe('offline-first budget mutations', () => {
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

    await api.createBudgetTransaction({ amount: 12.5, categoryId: 'category-1' });

    expect(mutations[0]).toMatchObject({
      kind: 'budgettransaction.create',
      payload: { amount: '12.50', currency: 'VND' },
      optimistic: { amount: '12.50', currency: 'VND' },
    });
  });

  it('queues category limits with their stable period/category entity key', async () => {
    const mutations: Array<Record<string, unknown>> = [];
    const api = createBudgetApi({
      request: vi.fn().mockResolvedValue({}),
      stream: async () => new ReadableStream(),
      offlineMutation: async (input) => {
        mutations.push(input as unknown as Record<string, unknown>);
        return input.optimistic;
      },
    });

    await api.updateBudgetCategoryLimit('2026-08', 'category-1', { limit: '1000' });

    expect(mutations[0]).toMatchObject({
      kind: 'moneycategorybudget.upsert',
      entityId: '2026-08:category-1',
      payload: { period: '2026-08', categoryId: 'category-1', limit: '1000.00' },
    });
  });
});
