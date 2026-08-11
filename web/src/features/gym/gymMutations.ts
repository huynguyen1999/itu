import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { GymWorkoutUpdate } from './gymQueries';
import { enqueueGymExerciseImage } from './exerciseImageQueue';

export function mergeGymWorkoutCache(current: unknown, updated: unknown): unknown {
  if (!updated || typeof updated !== 'object' || Array.isArray(updated)) return current;
  if (!current || typeof current !== 'object' || Array.isArray(current)) return updated;
  const next = { ...(current as Record<string, unknown>) };
  for (const [key, value] of Object.entries(updated as Record<string, unknown>)) {
    if (value !== undefined) next[key] = value;
  }
  return next;
}

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

export function useStartGymWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data?: { title?: string }) => api.createWorkout({ title: data?.title ?? 'Workout' }),
    onSuccess: (workout) => {
      queryClient.setQueryData(['gym', 'workout', workout.id], workout);
      queryClient.invalidateQueries({ queryKey: ['gym', 'overview'] });
    },
  });
}

export function useCreateGymWorkoutExercise() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      workoutId: string;
      exerciseId: string;
      sortOrder?: number;
      note?: string | null;
      restSeconds?: number | null;
    }) => api.createWorkoutExercise(data),
    onSuccess: (exercise, variables) => {
      queryClient.setQueryData(['gym', 'workout', variables.workoutId], (current: any) =>
        current ? { ...current, exercises: [...(current.exercises ?? []), exercise] } : current,
      );
    },
  });
}

export function useUpdateGymWorkoutExercise() {
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Record<string, unknown> & { version?: number; baseValues?: Record<string, unknown> };
    }) => api.updateWorkoutExercise(id, data),
  });
}

export function useDeleteGymWorkoutExercise() {
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version?: number }) => api.deleteWorkoutExercise(id, version),
  });
}

export function useCreateGymWorkoutSet() {
  return useMutation({
    mutationFn: (data: {
      workoutExerciseId: string;
      sortOrder?: number;
      type?: 'WARM_UP' | 'NORMAL' | 'DROP' | 'FAILURE';
      reps?: number | null;
      weight?: number | null;
      durationSeconds?: number | null;
      distanceMeters?: number | null;
      rpe?: number | null;
    }) => api.createWorkoutSet(data),
  });
}

export function useUpdateGymWorkoutSet() {
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: Record<string, unknown> & { version?: number; baseValues?: Record<string, unknown> };
    }) => api.updateWorkoutSet(id, data),
  });
}

export function useCompleteGymWorkoutSet() {
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version?: number }) => api.completeWorkoutSet(id, undefined, version),
  });
}

export function useDeleteGymWorkoutSet() {
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version?: number }) => api.deleteWorkoutSet(id, version),
  });
}

export function useFinishGymWorkout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, durationMinutes }: { id: string; version?: number; durationMinutes?: number }) =>
      api.finishWorkout(id, { version, durationMinutes }),
    onSuccess: (_workout, variables) => {
      queryClient.setQueryData(['gym', 'workout', variables.id], (current: any) =>
        current ? { ...current, status: 'COMPLETED', endedAt: new Date().toISOString() } : current,
      );
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
        queryClient.setQueryData(['gym', 'workout', variables.id], (current: unknown) =>
          mergeGymWorkoutCache(current, updated),
        );
      }
      queryClient.invalidateQueries({ queryKey: ['gym', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['gym', 'workouts'] });
    },
  });
}

export function useUpdateGymWorkoutTitle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      title,
      version,
      baseValues,
    }: {
      id: string;
      title: string;
      version?: number;
      baseValues?: Record<string, unknown>;
    }) => api.updateWorkout(id, { title, version, baseValues }),
    onSuccess: (updated, variables) => {
      queryClient.setQueryData(['gym', 'workout', variables.id], (current: unknown) =>
        mergeGymWorkoutCache(current, updated),
      );
      queryClient.invalidateQueries({ queryKey: ['gym', 'overview'] });
      queryClient.invalidateQueries({ queryKey: ['gym', 'workouts'] });
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
