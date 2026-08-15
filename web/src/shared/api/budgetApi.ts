import type { ApiClientContext } from './apiContext';
import { createUlid } from '../sync/syncIdentity';
import { SYNC_KINDS } from '../sync/syncKinds';

export type MoneyAmount = string | number;
export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'CARD' | 'E_WALLET' | 'OTHER';
export type RecurringFrequency = 'WEEKLY' | 'MONTHLY' | 'YEARLY';

export interface BudgetCategory {
  id: string;
  userId?: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  sortOrder: number;
  archivedAt?: string | null;
  version?: number;
}

export interface Expense {
  id: string;
  userId?: string;
  amount: string;
  category: string;
  categoryId: string;
  merchant?: string | null;
  paymentMethod: PaymentMethod;
  expenseDate: string;
  note?: string | null;
  recurringExpenseId?: string | null;
  recurringOccurrenceDate?: string | null;
  version?: number;
  createdAt?: string | null;
  updatedAt?: string | null;
  deletedAt?: string | null;
}

export interface CategoryBudgetLimit {
  id: string;
  monthlyBudgetId: string;
  categoryId: string;
  limit: string;
  version?: number;
}

export interface MonthlyBudget {
  id: string;
  userId?: string;
  period: string;
  overallLimit: string | null;
  categoryLimits: CategoryBudgetLimit[];
  version?: number;
}

export interface RecurringExpense {
  id: string;
  userId?: string;
  name?: string | null;
  category: string;
  categoryId: string;
  amount: string;
  merchant?: string | null;
  paymentMethod: PaymentMethod;
  note?: string | null;
  frequency: RecurringFrequency;
  startDate: string;
  nextDueDate: string;
  isActive: boolean;
  archivedAt?: string | null;
  version?: number;
}

export interface BudgetSummary {
  period: string;
  spent: string;
  overallLimit: string | null;
  remaining: string | null;
  previousSpent: string;
  changeAmount: string;
  changePercentage: number | null;
  categories: Array<{
    category: BudgetCategory;
    limit: string | null;
    spent: string;
    remaining: string | null;
    percentage: number | null;
  }>;
  recentExpenses: Expense[];
  dueRecurring: RecurringExpense[];
}

export interface BudgetReport {
  period: string;
  spendingOverTime: Array<{ date: string; amount: string; cumulative: string }>;
  categoryBreakdown: Array<{ categoryId: string; category: string; amount: string; percentage: number }>;
  monthlyOutflow: Array<{ bucket: string; amount: string }>;
  previousMonthComparison: { current: string; previous: string; difference: string; percentage: number | null };
  topMerchants: Array<{ merchant: string; amount: string; count: number }>;
  topCategories: Array<{ categoryId: string; category: string; amount: string; count: number }>;
}

export interface BudgetStatistics {
  from: string;
  to: string;
  spent: string;
  expenseCount: number;
  previousSpent: string;
  changeAmount: string;
  trend: Array<{ date: string; amount: string }>;
}

export interface ExpenseFilters {
  period?: string;
  from?: string;
  to?: string;
  categoryId?: string;
  paymentMethod?: PaymentMethod;
  merchant?: string;
  search?: string;
}

export type BudgetApi = {
  getBudgetSummary(period: string): Promise<BudgetSummary>;
  getBudgetReport(period: string): Promise<BudgetReport>;
  getBudgetStatistics(from: string, to: string): Promise<BudgetStatistics>;
  getBudgetCategories(): Promise<BudgetCategory[]>;
  createBudgetCategory(data: { name: string; icon?: string; color?: string; sortOrder?: number }): Promise<BudgetCategory>;
  reorderBudgetCategories(data: { categoryIds: string[] }): Promise<BudgetCategory[]>;
  updateBudgetCategory(id: string, data: Partial<{ name: string; icon: string; color: string; sortOrder: number }>): Promise<BudgetCategory>;
  archiveBudgetCategory(id: string): Promise<BudgetCategory>;
  getMonthlyBudget(period: string): Promise<MonthlyBudget>;
  updateMonthlyBudget(period: string, overallLimit: MoneyAmount | null): Promise<MonthlyBudget>;
  updateBudgetCategoryLimit(period: string, categoryId: string, limit: MoneyAmount): Promise<CategoryBudgetLimit>;
  deleteBudgetCategoryLimit(period: string, categoryId: string): Promise<void>;
  getBudgetExpenses(filters?: ExpenseFilters): Promise<Expense[]>;
  getBudgetExpenseById(id: string): Promise<Expense>;
  createBudgetExpense(data: {
    amount: MoneyAmount;
    categoryId: string;
    merchant?: string;
    paymentMethod?: PaymentMethod;
    expenseDate: string;
    note?: string;
  }): Promise<Expense>;
  updateBudgetExpense(id: string, data: Partial<{
    amount: MoneyAmount;
    categoryId: string;
    merchant: string | null;
    paymentMethod: PaymentMethod;
    expenseDate: string;
    note: string | null;
  }>): Promise<Expense>;
  deleteBudgetExpense(id: string): Promise<void>;
  getRecurringExpenses(): Promise<RecurringExpense[]>;
  createRecurringExpense(data: {
    name?: string;
    categoryId: string;
    amount: MoneyAmount;
    merchant?: string;
    paymentMethod?: PaymentMethod;
    note?: string;
    frequency: RecurringFrequency;
    startDate: string;
  }): Promise<RecurringExpense>;
  updateRecurringExpense(id: string, data: Partial<{
    name: string | null;
    categoryId: string;
    amount: MoneyAmount;
    merchant: string | null;
    paymentMethod: PaymentMethod;
    note: string | null;
    frequency: RecurringFrequency;
    startDate: string;
    nextDueDate: string;
    isActive: boolean;
  }>): Promise<RecurringExpense>;
  archiveRecurringExpense(id: string): Promise<RecurringExpense>;
  confirmRecurringExpense(id: string, occurrenceDate?: string): Promise<void>;
  skipRecurringExpense(id: string, occurrenceDate?: string): Promise<void>;
};

function decimalString(value: MoneyAmount): string {
  const text = String(value).trim();
  if (/^\d+(?:\.\d{1,2})?$/.test(text)) {
    const [whole, fraction = ''] = text.split('.');
    return `${whole}.${fraction.padEnd(2, '0')}`;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(2) : '0.00';
}

function json(body: unknown): RequestInit {
  return { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export function createBudgetApi(ctx: ApiClientContext): BudgetApi {
  return {
    getBudgetSummary(period) { return ctx.request(`/budget/summary?period=${encodeURIComponent(period)}`); },
    getBudgetReport(period) { return ctx.request(`/budget/reports?period=${encodeURIComponent(period)}`); },
    getBudgetStatistics(from, to) {
      const query = new URLSearchParams({ from, to });
      return ctx.request(`/budget/statistics?${query}`);
    },
    getBudgetCategories() { return ctx.request('/budget/categories'); },
    createBudgetCategory(data) {
      const id = createUlid();
      const optimistic: BudgetCategory = { id, ...data, sortOrder: data.sortOrder ?? 0, archivedAt: null, version: 1 };
      return ctx.offlineMutation({ kind: SYNC_KINDS.budgetCategory.create, entityId: id, payload: data, optimistic }, () => ctx.request('/budget/categories', { method: 'POST', ...json(data) }));
    },
    reorderBudgetCategories(data) {
      return ctx.offlineMutation({ kind: SYNC_KINDS.budgetCategory.reorder, entityId: createUlid(), payload: data, optimistic: [] }, () => ctx.request('/budget/categories/reorder', { method: 'PATCH', ...json(data) }));
    },
    updateBudgetCategory(id, data) {
      return ctx.offlineMutation({ kind: SYNC_KINDS.budgetCategory.update, entityId: id, payload: data, optimistic: { id, ...data } as BudgetCategory }, () => ctx.request(`/budget/categories/${id}`, { method: 'PATCH', ...json(data) }));
    },
    archiveBudgetCategory(id) {
      return ctx.offlineMutation({ kind: SYNC_KINDS.budgetCategory.archive, entityId: id, payload: {}, immediate: true, optimistic: { id, archivedAt: new Date().toISOString() } as BudgetCategory }, () => ctx.request(`/budget/categories/${id}`, { method: 'DELETE' }));
    },
    getMonthlyBudget(period) { return ctx.request(`/budget/months/${period}`); },
    updateMonthlyBudget(period, overallLimit) {
      const payload = { period, overallLimit: overallLimit === null ? null : decimalString(overallLimit) };
      return ctx.offlineMutation({ kind: SYNC_KINDS.monthlyBudget.update, entityId: createUlid(), payload, optimistic: { id: payload.period, ...payload, categoryLimits: [] } as MonthlyBudget }, () => ctx.request(`/budget/months/${period}`, { method: 'PUT', ...json(payload) }));
    },
    updateBudgetCategoryLimit(period, categoryId, limit) {
      const payload = { period, categoryId, limit: decimalString(limit) };
      return ctx.offlineMutation({ kind: SYNC_KINDS.categoryBudget.upsert, entityId: createUlid(), payload, optimistic: { id: `${period}:${categoryId}`, monthlyBudgetId: period, categoryId, limit: payload.limit } }, () => ctx.request(`/budget/months/${period}/categories/${categoryId}`, { method: 'PUT', ...json(payload) }));
    },
    deleteBudgetCategoryLimit(period, categoryId) {
      return ctx.offlineMutation({ kind: SYNC_KINDS.categoryBudget.delete, entityId: `${period}:${categoryId}`, payload: { period, categoryId }, immediate: true, optimistic: undefined }, () => ctx.request(`/budget/months/${period}/categories/${categoryId}`, { method: 'DELETE' }));
    },
    getBudgetExpenses(filters) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters ?? {})) if (value) params.set(key, value);
      const query = params.toString() ? `?${params.toString()}` : '';
      return ctx.request(`/budget/expenses${query}`);
    },
    getBudgetExpenseById(id) { return ctx.request(`/budget/expenses/${id}`); },
    createBudgetExpense(data) {
      const id = createUlid();
      const payload = { ...data, amount: decimalString(data.amount), paymentMethod: data.paymentMethod ?? 'CASH' };
      const optimistic: Expense = { id, ...payload, category: '', version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      return ctx.offlineMutation({ kind: SYNC_KINDS.expense.create, entityId: id, payload, optimistic }, () => ctx.request('/budget/expenses', { method: 'POST', ...json(payload) }));
    },
    updateBudgetExpense(id, data) {
      const payload = { ...data, ...(data.amount === undefined ? {} : { amount: decimalString(data.amount) }) };
      return ctx.offlineMutation({ kind: SYNC_KINDS.expense.update, entityId: id, payload, optimistic: { id, ...payload } as Expense }, () => ctx.request(`/budget/expenses/${id}`, { method: 'PATCH', ...json(payload) }));
    },
    deleteBudgetExpense(id) {
      return ctx.offlineMutation({ kind: SYNC_KINDS.expense.delete, entityId: id, payload: {}, immediate: true, optimistic: undefined }, () => ctx.request(`/budget/expenses/${id}`, { method: 'DELETE' }));
    },
    getRecurringExpenses() { return ctx.request('/budget/recurring'); },
    createRecurringExpense(data) {
      const id = createUlid();
      const payload = { ...data, amount: decimalString(data.amount), paymentMethod: data.paymentMethod ?? 'CASH' };
      const optimistic: RecurringExpense = { id, ...payload, category: '', nextDueDate: payload.startDate, isActive: true, archivedAt: null, version: 1 };
      return ctx.offlineMutation({ kind: SYNC_KINDS.recurringExpense.create, entityId: id, payload, optimistic }, () => ctx.request('/budget/recurring', { method: 'POST', ...json(payload) }));
    },
    updateRecurringExpense(id, data) {
      const payload = { ...data, ...(data.amount === undefined ? {} : { amount: decimalString(data.amount) }) };
      return ctx.offlineMutation({ kind: SYNC_KINDS.recurringExpense.update, entityId: id, payload, optimistic: { id, ...payload } as RecurringExpense }, () => ctx.request(`/budget/recurring/${id}`, { method: 'PATCH', ...json(payload) }));
    },
    archiveRecurringExpense(id) {
      return ctx.offlineMutation({ kind: SYNC_KINDS.recurringExpense.archive, entityId: id, payload: {}, immediate: true, optimistic: { id, archivedAt: new Date().toISOString(), isActive: false } as RecurringExpense }, () => ctx.request(`/budget/recurring/${id}`, { method: 'DELETE' }));
    },
    confirmRecurringExpense(id, occurrenceDate) {
      const expenseId = createUlid();
      const payload = { ...(occurrenceDate ? { occurrenceDate } : {}), expenseId };
      return ctx.offlineMutation({ kind: SYNC_KINDS.recurringExpense.confirm, entityId: id, payload, immediate: true, optimistic: undefined }, () => ctx.request(`/budget/recurring/${id}/confirm`, { method: 'POST', ...json(payload) }));
    },
    skipRecurringExpense(id, occurrenceDate) {
      const payload = occurrenceDate ? { occurrenceDate } : {};
      return ctx.offlineMutation({ kind: SYNC_KINDS.recurringExpense.skip, entityId: id, payload, immediate: true, optimistic: undefined }, () => ctx.request(`/budget/recurring/${id}/skip`, { method: 'POST', ...json(payload) }));
    },
  };
}
