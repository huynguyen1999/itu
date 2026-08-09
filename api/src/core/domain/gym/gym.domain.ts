export type ExerciseMetricType = 'WEIGHT_REPS' | 'REPS' | 'DURATION' | 'DISTANCE_DURATION';
export type WeightUnit = 'KG' | 'LBS';
export type WorkoutSetType = 'WARMUP' | 'NORMAL' | 'DROP' | 'FAILURE';
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
