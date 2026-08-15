export type ExerciseMetricType = 'WEIGHT_REPS' | 'REPS' | 'DURATION' | 'DISTANCE_DURATION';
export type WeightUnit = 'KG' | 'LBS';
/** WARMUP remains accepted for aggregate REST clients; WARM_UP is canonical for sync. */
export type WorkoutSetType = 'WARM_UP' | 'WARMUP' | 'NORMAL' | 'DROP' | 'FAILURE';
export type WorkoutStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ACTIVE';
export type ExerciseOrigin = 'BUILT_IN' | 'CUSTOM';

export type GymPRType =
  | 'HEAVIEST_WEIGHT'
  | 'ESTIMATED_1RM'
  | 'MOST_REPS'
  | 'BEST_SET_VOLUME'
  | 'BEST_SESSION_VOLUME'
  | 'LONGEST_DURATION'
  | 'LONGEST_DISTANCE';

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
  origin?: ExerciseOrigin;
  catalogKey?: string | null;
  catalogVersion?: number | null;
  userNotes?: string | null;
  isFavorite?: boolean;
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
  exerciseName?: string;
  metricType?: ExerciseMetricType;
  weightUnit?: WeightUnit;
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
  routineId?: string | null;
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

export interface GymRoutineExerciseDomain {
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
  deletedAt?: Date | null;
  deletedByDeviceId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  exercise?: ExerciseDomain;
}

export interface GymRoutineDomain {
  id: string;
  userId: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  archivedAt?: Date | null;
  deletedAt?: Date | null;
  deletedByDeviceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  exercises: GymRoutineExerciseDomain[];
}

export interface GymPRRecordDomain {
  type: GymPRType;
  value: number;
  previousValue?: number | null;
  reps?: number | null;
  weight?: number | null;
  achievedAt: Date;
  workoutId?: string;
  exerciseId: string;
  exerciseName: string;
}

export interface GymSetPRDomain {
  exerciseId: string;
  exerciseName: string;
  setId: string;
  prTypes: GymPRType[];
  value: number;
  previousValue?: number | null;
  estimated1RM?: number | null;
  previousEstimated1RM?: number | null;
}

export interface ExerciseStatsDomain {
  heaviestWeight: number | null;
  bestVolumeSet: number | null;
  estimated1RM: number | null;
  totalSets: number;
  lastPerformedAt: Date | null;
  recentSets: WorkoutSetDomain[];
}

export interface GymProgressPointDomain {
  date: Date;
  workoutId: string;
  weight: number | null;
  reps: number | null;
  estimated1RM: number | null;
  volume: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
  isPR?: boolean;
}

export interface GymExerciseProgressDomain {
  exercise: ExerciseDomain;
  records: {
    heaviestWeight: number | null;
    estimated1RM: number | null;
    bestSetVolume: number | null;
    mostReps: number | null;
    longestDurationSeconds: number | null;
    longestDistanceMeters: number | null;
    totalCompletedSets: number;
    lastTrained: Date | null;
  };
  historyPoints: GymProgressPointDomain[];
  recentSets: WorkoutSetDomain[];
}

export interface GymOverviewDomain {
  startDate: Date;
  endDate: Date;
  weeklyWorkoutsCount: number;
  weeklyWorkoutTarget: number | null;
  consistencyStreakWeeks: number;
  weeklySetsCount: number;
  weeklyVolumeKg: number;
  trainingMinutes: number;
  prCount: number;
  muscleSets: Record<string, number>;
  previousWeek: {
    weeklyWorkoutsCount: number;
    weeklySetsCount: number;
    weeklyVolumeKg: number;
    trainingMinutes: number;
    prCount: number;
  };
  recentWorkouts: WorkoutDomain[];
}

export interface GymAnalyticsDomain {
  range: '1M' | '3M' | '6M' | '1Y' | 'ALL' | 'CUSTOM';
  totalWorkouts: number;
  totalWorkingSets: number;
  totalVolumeKg: number;
  totalTrainingMinutes: number;
  totalPRs: number;
  muscleDistribution: Record<string, number>;
  weeklyTrend: Array<{
    weekLabel: string;
    startDate: Date;
    workouts: number;
    sets: number;
    volumeKg: number;
    trainingMinutes: number;
  }>;
}
