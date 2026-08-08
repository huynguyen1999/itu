import type { ApiClientContext } from './apiContext';

export interface BudgetApi {
  getBudgetOverview(period?: string): Promise<any>;
  getBudgetCategories(): Promise<any[]>;
  createBudgetCategory(data: { name: string; type?: 'EXPENSE' | 'INCOME'; icon?: string; color?: string }): Promise<any>;
  reorderBudgetCategories(data: { categoryIds: string[] }): Promise<any>;
  updateBudgetCategory(id: string, data: Partial<{ name: string; type: 'EXPENSE' | 'INCOME'; icon: string; color: string }>): Promise<any>;
  archiveBudgetCategory(id: string): Promise<any>;
  getBudgetPeriod(period: string): Promise<any>;
  updateBudgetPeriod(period: string, data: { overallLimit: number }): Promise<any>;
  updateBudgetCategoryLimit(period: string, categoryId: string, data: { limit: number }): Promise<any>;
  deleteBudgetCategoryLimit(period: string, categoryId: string): Promise<any>;
  getBudgetTransactions(filters?: { period?: string; categoryId?: string; type?: 'EXPENSE' | 'INCOME' }): Promise<any[]>;
  getBudgetTransactionById(id: string): Promise<any>;
  createBudgetTransaction(data: {
    amount: number;
    currency?: string;
    type?: 'EXPENSE' | 'INCOME';
    categoryId: string;
    merchant?: string;
    paymentMethod?: string;
    transactionAt?: string;
    note?: string;
  }): Promise<any>;
  updateBudgetTransaction(id: string, data: Partial<{
    amount: number;
    currency: string;
    type: 'EXPENSE' | 'INCOME';
    categoryId: string;
    merchant: string;
    paymentMethod: string;
    transactionAt: string;
    note: string;
  }>): Promise<any>;
  deleteBudgetTransaction(id: string): Promise<any>;
}

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
      return ctx.request('/budget/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    reorderBudgetCategories(data) {
      return ctx.request('/budget/categories/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    updateBudgetCategory(id, data) {
      return ctx.request(`/budget/categories/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    archiveBudgetCategory(id) {
      return ctx.request(`/budget/categories/${id}`, { method: 'DELETE' });
    },
    getBudgetPeriod(period) {
      return ctx.request(`/budget/periods/${period}`);
    },
    updateBudgetPeriod(period, data) {
      return ctx.request(`/budget/periods/${period}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    updateBudgetCategoryLimit(period, categoryId, data) {
      return ctx.request(`/budget/periods/${period}/categories/${categoryId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    deleteBudgetCategoryLimit(period, categoryId) {
      return ctx.request(`/budget/periods/${period}/categories/${categoryId}`, { method: 'DELETE' });
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
      return ctx.request('/budget/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    updateBudgetTransaction(id, data) {
      return ctx.request(`/budget/transactions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    deleteBudgetTransaction(id) {
      return ctx.request(`/budget/transactions/${id}`, { method: 'DELETE' });
    },
  };
}
