import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export function useBudgetOverview(period?: string) {
  return useQuery({
    queryKey: ['budget', 'overview', period],
    queryFn: () => api.getBudgetOverview(period),
  });
}

export function useBudgetCategories() {
  return useQuery({
    queryKey: ['budget', 'categories'],
    queryFn: () => api.getBudgetCategories(),
  });
}

export function useBudgetPeriod(period: string) {
  return useQuery({
    queryKey: ['budget', 'period', period],
    queryFn: () => api.getBudgetPeriod(period),
  });
}

export function useBudgetTransactions(filters?: { period?: string; categoryId?: string; type?: 'EXPENSE' | 'INCOME' }) {
  return useQuery({
    queryKey: ['budget', 'transactions', filters],
    queryFn: () => api.getBudgetTransactions(filters),
  });
}
