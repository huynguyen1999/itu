import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export function useCreateBudgetTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.createBudgetTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

export function useUpdateBudgetTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateBudgetTransaction(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

export function useDeleteBudgetTransaction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteBudgetTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

export function useCreateBudgetCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.createBudgetCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', 'categories'] });
      queryClient.invalidateQueries({ queryKey: ['budget', 'overview'] });
    },
  });
}

export function useUpdateBudgetCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateBudgetCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', 'categories'] });
      queryClient.invalidateQueries({ queryKey: ['budget', 'overview'] });
    },
  });
}

export function useArchiveBudgetCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveBudgetCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', 'categories'] });
      queryClient.invalidateQueries({ queryKey: ['budget', 'overview'] });
    },
  });
}

export function useReorderBudgetCategories() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryIds: string[]) => api.reorderBudgetCategories({ categoryIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget', 'categories'] });
    },
  });
}

export function useUpdateBudgetPeriodLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ period, overallLimit }: { period: string; overallLimit: number }) =>
      api.updateBudgetPeriod(period, { overallLimit }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['budget', 'period', variables.period] });
      queryClient.invalidateQueries({ queryKey: ['budget', 'overview'] });
    },
  });
}

export function useUpdateBudgetCategoryLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ period, categoryId, limit }: { period: string; categoryId: string; limit: number }) =>
      api.updateBudgetCategoryLimit(period, categoryId, { limit }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['budget', 'period', variables.period] });
      queryClient.invalidateQueries({ queryKey: ['budget', 'overview'] });
    },
  });
}

export function useDeleteBudgetCategoryLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ period, categoryId }: { period: string; categoryId: string }) =>
      api.deleteBudgetCategoryLimit(period, categoryId),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['budget', 'period', variables.period] });
      queryClient.invalidateQueries({ queryKey: ['budget', 'overview'] });
    },
  });
}
