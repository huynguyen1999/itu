import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export function useGymOverview() {
  return useQuery({
    queryKey: ['gym', 'overview'],
    queryFn: () => api.getGymOverview(),
  });
}

export function useGymExercises() {
  return useQuery({
    queryKey: ['gym', 'exercises'],
    queryFn: () => api.getGymExercises(),
  });
}

export function useGymExerciseStats(id: string) {
  return useQuery({
    queryKey: ['gym', 'exercise-stats', id],
    queryFn: () => api.getGymExerciseStats(id),
    enabled: Boolean(id),
  });
}

export function useGymWorkouts(options?: { status?: string; limit?: number }) {
  return useQuery({
    queryKey: ['gym', 'workouts', options],
    queryFn: () => api.getGymWorkouts(options),
  });
}

export function useGymWorkout(id: string) {
  return useQuery({
    queryKey: ['gym', 'workout', id],
    queryFn: () => api.getGymWorkoutById(id),
    enabled: Boolean(id),
  });
}
