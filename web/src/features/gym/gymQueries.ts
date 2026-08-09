import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export type ExerciseMetricType = 'WEIGHT_REPS' | 'REPS' | 'DURATION' | 'DISTANCE_DURATION';

export interface GymExercise {
  id: string;
  name: string;
  description?: string | null;
  metricType?: ExerciseMetricType;
  equipment?: string | null;
  primaryMuscleGroup?: string | null;
  defaultWeightUnit?: 'KG' | 'LBS';
  defaultRestSeconds?: number | null;
}

export interface GymWorkoutSet {
  id?: string;
  sortOrder: number;
  type?: 'WARMUP' | 'NORMAL' | 'DROP' | 'FAILURE';
  reps?: number | null;
  weight?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  rpe?: number | null;
  completedAt?: string | null;
}

export interface GymWorkoutExercise {
  id?: string;
  workoutEntryId?: string;
  exerciseId: string;
  sortOrder: number;
  note?: string | null;
  restSeconds?: number | null;
  exercise?: GymExercise | null;
  sets: GymWorkoutSet[];
}

export interface GymWorkout {
  id: string;
  title?: string | null;
  status: 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  startedAt?: string | null;
  endedAt?: string | null;
  durationMinutes?: number | null;
  exercises?: GymWorkoutExercise[];
}

export interface GymOverview {
  weeklyWorkoutsCount: number;
  weeklySetsCount: number;
  weeklyVolumeKg: number;
  recentWorkouts: GymWorkout[];
}

export interface GymWorkoutUpdate {
  title: string;
  exercises: GymWorkoutExercise[];
}

export function useGymOverview() {
  return useQuery<GymOverview>({
    queryKey: ['gym', 'overview'],
    queryFn: () => api.getGymOverview(),
  });
}

export function useGymExercises() {
  return useQuery<GymExercise[]>({
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
  return useQuery<GymWorkout[]>({
    queryKey: ['gym', 'workouts', options],
    queryFn: () => api.getGymWorkouts(options),
  });
}

export function useGymWorkout(id: string) {
  return useQuery<GymWorkout>({
    queryKey: ['gym', 'workout', id],
    queryFn: () => api.getGymWorkoutById(id),
    enabled: Boolean(id),
  });
}
