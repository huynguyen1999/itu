import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/api/client';

export type ExerciseMetricType = 'WEIGHT_REPS' | 'REPS' | 'DURATION' | 'DISTANCE_DURATION';
export type GymWeightUnit = 'KG' | 'LBS';
export type GymSetType = 'WARM_UP' | 'WARMUP' | 'NORMAL' | 'DROP' | 'FAILURE';

export type GymPRType =
  | 'HEAVIEST_WEIGHT'
  | 'ESTIMATED_1RM'
  | 'MOST_REPS'
  | 'BEST_SET_VOLUME'
  | 'BEST_SESSION_VOLUME'
  | 'LONGEST_DURATION'
  | 'LONGEST_DISTANCE';

export interface GymExercise {
  id: string;
  name: string;
  description?: string | null;
  metricType?: ExerciseMetricType;
  equipment?: string | null;
  primaryMuscleGroup?: string | null;
  secondaryMuscleGroups?: string[];
  defaultWeightUnit?: GymWeightUnit;
  defaultRestSeconds?: number | null;
  origin?: 'BUILT_IN' | 'CUSTOM';
  catalogKey?: string | null;
  catalogVersion?: number | null;
  userNotes?: string | null;
  isFavorite?: boolean;
  favorite?: boolean;
  archivedAt?: string | null;
  imageUrl?: string | null;
  version?: number;
}

export interface GymRoutineExercise {
  id: string;
  routineId: string;
  exerciseId: string;
  sortOrder: number;
  setCount: number;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetDurationSeconds?: number | null;
  targetDistanceMeters?: number | null;
  restSeconds?: number | null;
  note?: string | null;
  version?: number;
  exercise?: GymExercise | null;
}

export interface GymRoutine {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  archivedAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  exercises: GymRoutineExercise[];
}

export interface GymPreviousSet {
  weight?: number | null;
  reps?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  rpe?: number | null;
}

export interface GymWorkoutSet {
  id?: string;
  workoutExerciseId?: string;
  sortOrder: number;
  type?: GymSetType;
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
  prs?: GymPRType[];
}

export interface GymWorkoutExercise {
  id?: string;
  workoutId?: string;
  workoutEntryId?: string;
  exerciseId: string;
  exerciseName?: string;
  metricType?: ExerciseMetricType;
  weightUnit?: GymWeightUnit;
  sortOrder: number;
  note?: string | null;
  restSeconds?: number | null;
  exercise?: GymExercise | null;
  sets: GymWorkoutSet[];
  version?: number;
}

export interface GymWorkout {
  id: string;
  routineId?: string | null;
  title?: string | null;
  status: 'IN_PROGRESS' | 'ACTIVE' | 'COMPLETED' | 'ABANDONED';
  startedAt?: string | null;
  endedAt?: string | null;
  durationMinutes?: number | null;
  exercises?: GymWorkoutExercise[];
  version?: number;
}

export interface GymOverview {
  startDate?: string;
  endDate?: string;
  weeklyWorkoutsCount: number;
  weeklyWorkoutTarget?: number | null;
  consistencyStreakWeeks?: number;
  weeklySetsCount: number;
  weeklyVolumeKg: number;
  trainingMinutes?: number;
  prCount?: number;
  muscleSets?: Record<string, number>;
  previousWeek?: {
    weeklyWorkoutsCount: number;
    weeklySetsCount: number;
    weeklyVolumeKg: number;
    trainingMinutes: number;
    prCount: number;
  };
  recentWorkouts: GymWorkout[];
}

export interface GymProgressPoint {
  date: string;
  workoutId: string;
  weight: number | null;
  reps: number | null;
  estimated1RM: number | null;
  volume: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  isPR?: boolean;
}

export interface GymExerciseProgress {
  exercise: GymExercise;
  records: {
    heaviestWeight: number | null;
    estimated1RM: number | null;
    bestSetVolume: number | null;
    mostReps: number | null;
    longestDurationSeconds: number | null;
    longestDistanceMeters: number | null;
    totalCompletedSets: number;
    lastTrained: string | null;
  };
  historyPoints: GymProgressPoint[];
  recentSets: GymWorkoutSet[];
}

export function useGymOverview() {
  return useQuery<GymOverview>({
    queryKey: ['gym', 'overview'],
    queryFn: () => api.getGymOverview(),
  });
}

export function useGymExercises(options?: { search?: string; muscle?: string; equipment?: string; favoriteOnly?: boolean }) {
  return useQuery<GymExercise[]>({
    queryKey: ['gym', 'exercises', options],
    queryFn: () => api.getGymExercises(options),
  });
}

export function useGymExerciseProgress(id: string, range: string = 'ALL') {
  return useQuery<GymExerciseProgress>({
    queryKey: ['gym', 'exercise-progress', id, range],
    queryFn: () => api.getGymExerciseProgress(id, range),
    enabled: Boolean(id),
  });
}

export function useGymRoutines() {
  return useQuery<GymRoutine[]>({
    queryKey: ['gym', 'routines'],
    queryFn: () => api.getGymRoutines(),
  });
}

export function useGymWorkouts(options?: { status?: string; limit?: number; from?: string; to?: string }) {
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
