export type ExerciseMetricType = 'WEIGHT_REPS' | 'REPS' | 'DURATION' | 'DISTANCE_DURATION';
export type WeightUnit = 'KG' | 'LBS';
/** WARMUP remains accepted for aggregate REST clients; WARM_UP is canonical for sync. */
export type WorkoutSetType = 'WARM_UP' | 'WARMUP' | 'NORMAL' | 'DROP' | 'FAILURE';
export type WorkoutStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ACTIVE';

export interface ExerciseDomain {
  id: string;
  userId: string;
  name: string;
  normalizedName: string;
  description?: string | null;
  imageStorageKey?: string | null;
  imageUrl?: string | null;
  metricType: ExerciseMetricType;
  equipment?: string | null;
  primaryMuscleGroup?: string | null;
  secondaryMuscleGroups: string[];
  defaultWeightUnit: WeightUnit;
  defaultRestSeconds?: number | null;
  archivedAt?: Date | null;
  deletedAt?: Date | null;
  deletedByDeviceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export interface WorkoutSetDomain {
  id: string;
  workoutExerciseId: string;
  sortOrder: number;
  type: WorkoutSetType;
  reps?: number | null;
  weight?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  rpe?: number | null;
  completedAt?: Date | null;
  /** Workout context included by exercise-history/statistics responses. */
  performedAt?: Date | null;
  workoutId?: string;
  workoutTitle?: string | null;
  version?: number;
  deletedAt?: Date | null;
}

export interface WorkoutExerciseDomain {
  id: string;
  workoutId: string;
  /** @deprecated retained for REST compatibility during Journal cutover. */
  workoutEntryId?: string;
  exerciseId: string;
  sortOrder: number;
  note?: string | null;
  restSeconds?: number | null;
  version?: number;
  deletedAt?: Date | null;
  exercise?: ExerciseDomain;
  sets: WorkoutSetDomain[];
}

export interface WorkoutDomain {
  id: string;
  userId: string;
  title?: string | null;
  status: WorkoutStatus;
  startedAt?: Date | null;
  endedAt?: Date | null;
  durationMinutes?: number | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  deletedAt?: Date | null;
  deletedByDeviceId?: string | null;
  exercises: WorkoutExerciseDomain[];
}

export interface ExerciseStatsDomain {
  heaviestWeight: number | null;
  bestVolumeSet: number | null;
  estimated1RM: number | null;
  totalSets: number;
  lastPerformedAt: Date | null;
  recentSets: WorkoutSetDomain[];
}

export interface GymOverviewDomain {
  weeklyWorkoutsCount: number;
  weeklySetsCount: number;
  weeklyVolumeKg: number;
  recentWorkouts: WorkoutDomain[];
}
