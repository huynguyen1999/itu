import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export function useBudgetOverview(period?: string) {
  return useQuery({
    queryKey: ['budget', 'overview', period],
    queryFn: () => api.getBudgetSummary(period ?? ''),
  });
}

export function useBudgetCategories() {
  return useQuery({
    queryKey: ['budget', 'categories'],
    queryFn: () => api.getBudgetCategories(),
  });
}

export function useBudgetExpenses(filters?: Parameters<typeof api.getBudgetExpenses>[0]) {
  return useQuery({
    queryKey: ['budget', 'expenses', filters],
    queryFn: () => api.getBudgetExpenses(filters),
  });
}

export function useMonthlyBudget(period: string) {
  return useQuery({ queryKey: ['budget', 'month', period], queryFn: () => api.getMonthlyBudget(period) });
}

export function useBudgetReport(period: string) {
  return useQuery({ queryKey: ['budget', 'report', period], queryFn: () => api.getBudgetReport(period) });
}

export function useRecurringExpenses() {
  return useQuery({ queryKey: ['budget', 'recurring'], queryFn: () => api.getRecurringExpenses() });
}
