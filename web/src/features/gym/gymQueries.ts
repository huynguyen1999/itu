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
  version?: number;
  isFavorite?: boolean;
  favorite?: boolean;
  archivedAt?: string | null;
  imageUrl?: string | null;
}

interface GymPreviousSet {
  weight?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  rpe?: number | null;
}

export interface GymWorkoutSet {
  id?: string;
  sortOrder: number;
  type?: 'WARM_UP' | 'WARMUP' | 'NORMAL' | 'DROP' | 'FAILURE';
  reps?: number | null;
  weight?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  rpe?: number | null;
  completedAt?: string | null;
  version?: number;
  previous?: GymPreviousSet;
  performedAt?: string | null;
  workoutId?: string;
  workoutTitle?: string | null;
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
  version?: number;
}

export interface GymWorkout {
  id: string;
  title?: string | null;
  status: 'IN_PROGRESS' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  startedAt?: string | null;
  endedAt?: string | null;
  durationMinutes?: number | null;
  exercises?: GymWorkoutExercise[];
  version?: number;
}

export interface GymOverview {
  weeklyWorkoutsCount: number;
  weeklySetsCount: number;
  weeklyVolumeKg: number;
  recentWorkouts: GymWorkout[];
}

interface GymWorkoutUpdate {
  title: string;
  exercises: GymWorkoutExercise[];
}

export interface GymExerciseStats {
  heaviestWeight: number | null;
  bestVolumeSet?: number | null;
  estimated1RM: number | null;
  totalSets: number;
  lastPerformedAt?: string | null;
  recentSets?: GymWorkoutSet[];
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
  return useQuery<GymExerciseStats>({
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
