import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { GymWorkoutUpdate } from './gymQueries';
import { enqueueGymExerciseImage } from './exerciseImageQueue';

export function useCreateGymExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.createGymExercise(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym', 'exercises'] });
    },
  });
}

export function useUpdateGymExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.updateGymExercise(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym', 'exercises'] });
    },
  });
}

export function useArchiveGymExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveGymExercise(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym', 'exercises'] });
    },
  });
}

export function useUploadGymExerciseImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => enqueueGymExerciseImage(id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym', 'exercises'] });
    },
  });
}

export function useCreateGymWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data?: any) => api.createGymWorkout(data || {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym'] });
    },
  });
}

export function useUpdateGymWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: GymWorkoutUpdate }) => api.updateGymWorkout(id, data),
    onSuccess: (updated, variables) => {
      if (updated) {
        queryClient.setQueryData(['gym', 'workout', variables.id], updated);
      }
      queryClient.invalidateQueries({ queryKey: ['gym', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['gym', 'workouts'] });
    },
  });
}

export function useCompleteGymWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.completeGymWorkout(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym'] });
    },
  });
}

export function useAbandonGymWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.abandonGymWorkout(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym'] });
    },
  });
}

export function useDeleteGymWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteGymWorkout(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gym'] });
    },
  });
}
