import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export function useCreateBudgetExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof api.createBudgetExpense>[0]) => api.createBudgetExpense(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'], refetchType: 'none' });
    },
  });
}

export function useUpdateBudgetExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateBudgetExpense>[1] }) => api.updateBudgetExpense(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'], refetchType: 'none' });
    },
  });
}

export function useDeleteBudgetExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteBudgetExpense(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'], refetchType: 'none' });
    },
  });
}

export function useCreateBudgetCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.createBudgetCategory(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

export function useUpdateBudgetCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateBudgetCategory(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

export function useArchiveBudgetCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveBudgetCategory(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

export function useUpdateBudgetPeriodLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ period, overallLimit }: { period: string; overallLimit: string | number | null }) =>
      api.updateMonthlyBudget(period, overallLimit),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

export function useUpdateBudgetCategoryLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ period, categoryId, limit }: { period: string; categoryId: string; limit: string | number }) =>
      api.updateBudgetCategoryLimit(period, categoryId, limit),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['budget'] });
    },
  });
}

export function useDeleteBudgetCategoryLimit() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ period, categoryId }: { period: string; categoryId: string }) => api.deleteBudgetCategoryLimit(period, categoryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget'] }),
  });
}

export function useConfirmRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.confirmRecurringExpense(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget'] }),
  });
}

export function useSkipRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.skipRecurringExpense(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget'] }),
  });
}

export function useCreateRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof api.createRecurringExpense>[0]) => api.createRecurringExpense(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget'] }),
  });
}

export function useUpdateRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof api.updateRecurringExpense>[1] }) => api.updateRecurringExpense(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget'] }),
  });
}

export function useArchiveRecurringExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveRecurringExpense(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['budget'] }),
  });
}
