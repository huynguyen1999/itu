import type { ApiClientContext } from './apiContext';
import { createUlid } from '../sync/syncIdentity';
import { SYNC_KINDS } from '../sync/syncKinds';

type MoneyAmount = string | number;

function decimalString(value: MoneyAmount): string {
  const text = String(value).trim();
  if (/^\d+(?:\.\d{1,2})?$/.test(text)) {
    const [whole, fraction = ''] = text.split('.');
    return `${whole}.${fraction.padEnd(2, '0')}`;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

export type BudgetApi = {
  getBudgetOverview(period?: string): Promise<any>;
  getBudgetCategories(): Promise<any[]>;
  createBudgetCategory(data: { name: string; type?: 'EXPENSE' | 'INCOME'; icon?: string; color?: string }): Promise<any>;
  reorderBudgetCategories(data: { categoryIds: string[] }): Promise<any>;
  updateBudgetCategory(id: string, data: Partial<{ name: string; type: 'EXPENSE' | 'INCOME'; icon: string; color: string }>): Promise<any>;
  archiveBudgetCategory(id: string): Promise<any>;
  getBudgetPeriod(period: string): Promise<any>;
  updateBudgetPeriod(period: string, data: { overallLimit: MoneyAmount }): Promise<any>;
  updateBudgetCategoryLimit(period: string, categoryId: string, data: { limit: MoneyAmount }): Promise<any>;
  deleteBudgetCategoryLimit(period: string, categoryId: string): Promise<any>;
  getBudgetTransactions(filters?: { period?: string; categoryId?: string; type?: 'EXPENSE' | 'INCOME' }): Promise<any[]>;
  getBudgetTransactionById(id: string): Promise<any>;
  createBudgetTransaction(data: {
    amount: MoneyAmount;
    currency?: string;
    type?: 'EXPENSE' | 'INCOME';
    categoryId: string;
    merchant?: string;
    paymentMethod?: string;
    transactionAt?: string;
    note?: string;
  }): Promise<any>;
  updateBudgetTransaction(id: string, data: Partial<{
    amount: MoneyAmount;
    currency: string;
    type: 'EXPENSE' | 'INCOME';
    categoryId: string;
    merchant: string;
    paymentMethod: string;
    transactionAt: string;
    note: string;
  }>): Promise<any>;
  deleteBudgetTransaction(id: string): Promise<any>;
};

export function createBudgetApi(ctx: ApiClientContext): BudgetApi {
  return {
    getBudgetOverview(period?: string) {
      const q = period ? `?period=${encodeURIComponent(period)}` : '';
      return ctx.request(`/budget/overview${q}`);
    },
    getBudgetCategories() {
      return ctx.request('/budget/categories');
    },
    createBudgetCategory(data) {
      const id = createUlid();
      const optimistic = {
        id,
        ...data,
        type: data.type ?? 'EXPENSE',
        icon: data.icon ?? 'other',
        color: data.color ?? 'TEAL',
        sortOrder: 0,
        archivedAt: null,
        version: 1,
      };
      return ctx.offlineMutation({ kind: SYNC_KINDS.budgetCategory.create, entityId: id, payload: data, optimistic }, () =>
        ctx.request('/budget/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      );
    },
    reorderBudgetCategories(data) {
      const id = createUlid();
      return ctx.offlineMutation({ kind: SYNC_KINDS.budgetCategory.reorder, entityId: id, payload: data, optimistic: undefined }, () =>
        ctx.request('/budget/categories/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      );
    },
    updateBudgetCategory(id, data) {
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.budgetCategory.update, entityId: id, payload: data, baseVersion: (data as { version?: number }).version, optimistic: { id, ...data } },
        () =>
          ctx.request(`/budget/categories/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          }),
      );
    },
    archiveBudgetCategory(id) {
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.budgetCategory.delete, entityId: id, payload: {}, immediate: true, optimistic: { id, archivedAt: new Date().toISOString() } },
        () => ctx.request(`/budget/categories/${id}`, { method: 'DELETE' }),
      );
    },
    getBudgetPeriod(period) {
      return ctx.request(`/budget/periods/${period}`);
    },
    updateBudgetPeriod(period, data) {
      const payload = { period, overallLimit: decimalString(data.overallLimit) };
      return ctx.offlineMutation({ kind: SYNC_KINDS.budgetPeriod.update, entityId: period, payload, optimistic: { id: period, ...payload } }, () =>
        ctx.request(`/budget/periods/${period}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
    },
    updateBudgetCategoryLimit(period, categoryId, data) {
      const payload = { period, categoryId, limit: decimalString(data.limit) };
      return ctx.offlineMutation({ kind: SYNC_KINDS.budgetCategoryLimit.upsert, entityId: `${period}:${categoryId}`, payload, optimistic: { id: `${period}:${categoryId}`, ...payload } }, () =>
        ctx.request(`/budget/periods/${period}/categories/${categoryId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
    },
    deleteBudgetCategoryLimit(period, categoryId) {
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.budgetCategoryLimit.delete, entityId: `${period}:${categoryId}`, payload: { period, categoryId }, immediate: true, optimistic: { id: `${period}:${categoryId}`, deletedAt: new Date().toISOString() } },
        () => ctx.request(`/budget/periods/${period}/categories/${categoryId}`, { method: 'DELETE' }),
      );
    },
    getBudgetTransactions(filters) {
      const params = new URLSearchParams();
      if (filters?.period) params.append('period', filters.period);
      if (filters?.categoryId) params.append('categoryId', filters.categoryId);
      if (filters?.type) params.append('type', filters.type);
      const q = params.toString() ? `?${params.toString()}` : '';
      return ctx.request(`/budget/transactions${q}`);
    },
    getBudgetTransactionById(id) {
      return ctx.request(`/budget/transactions/${id}`);
    },
    createBudgetTransaction(data) {
      const id = createUlid();
      const payload = { ...data, amount: decimalString(data.amount), currency: data.currency ?? 'VND' };
      const optimistic = { id, ...payload, version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      return ctx.offlineMutation({ kind: SYNC_KINDS.budgetTransaction.create, entityId: id, payload, optimistic }, () =>
        ctx.request('/budget/transactions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
      );
    },
    updateBudgetTransaction(id, data) {
      const payload = { ...data, ...(data.amount === undefined ? {} : { amount: decimalString(data.amount) }) };
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.budgetTransaction.update, entityId: id, payload, baseVersion: (data as { version?: number }).version, optimistic: { id, ...payload } },
        () =>
          ctx.request(`/budget/transactions/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          }),
      );
    },
    deleteBudgetTransaction(id) {
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.budgetTransaction.delete, entityId: id, payload: {}, immediate: true, optimistic: { id, deletedAt: new Date().toISOString() } },
        () => ctx.request(`/budget/transactions/${id}`, { method: 'DELETE' }),
      );
    },
  };
}
