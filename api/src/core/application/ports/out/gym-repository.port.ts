import {
  ExerciseDomain,
  WorkoutDomain,
  ExerciseStatsDomain,
  GymOverviewDomain,
  GymExerciseProgressDomain,
  GymAnalyticsDomain,
  GymRoutineDomain,
  ExerciseMetricType,
  WeightUnit,
  WorkoutSetType,
  WorkoutStatus,
} from '../../../domain/gym/gym.domain';

export interface CreateExerciseDto {
  name: string;
  description?: string;
  metricType?: ExerciseMetricType;
  equipment?: string;
  primaryMuscleGroup?: string;
  secondaryMuscleGroups?: string[];
  defaultWeightUnit?: WeightUnit;
  defaultRestSeconds?: number;
  userNotes?: string;
  isFavorite?: boolean;
}

export interface UpdateExerciseDto {
  name?: string;
  description?: string;
  metricType?: ExerciseMetricType;
  equipment?: string;
  primaryMuscleGroup?: string;
  secondaryMuscleGroups?: string[];
  defaultWeightUnit?: WeightUnit;
  defaultRestSeconds?: number;
  imageStorageKey?: string;
  imageUrl?: string;
  userNotes?: string | null;
  isFavorite?: boolean;
}

export interface CreateRoutineExerciseDto {
  id?: string;
  exerciseId: string;
  sortOrder?: number;
  setCount?: number;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetDurationSeconds?: number | null;
  targetDistanceMeters?: number | null;
  restSeconds?: number | null;
  note?: string | null;
}

export interface CreateRoutineDto {
  id?: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  exercises?: CreateRoutineExerciseDto[];
}

export interface UpdateRoutineDto {
  name?: string;
  description?: string | null;
  sortOrder?: number;
  exercises?: CreateRoutineExerciseDto[];
}

export interface CreateWorkoutDto {
  id?: string;
  routineId?: string | null;
  title?: string;
  startedAt?: Date;
  endedAt?: Date;
  durationMinutes?: number;
  status?: WorkoutStatus;
  exercises?: UpdateWorkoutExerciseDto[];
}

export interface UpdateWorkoutSetDto {
  id?: string;
  sortOrder?: number;
  type?: WorkoutSetType;
  reps?: number | null;
  weight?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  rpe?: number | null;
  completedAt?: Date | null;
}

export interface UpdateWorkoutExerciseDto {
  id?: string;
  exerciseId: string;
  sortOrder?: number;
  note?: string | null;
  restSeconds?: number | null;
  sets?: UpdateWorkoutSetDto[];
}

export interface UpdateWorkoutDto {
  title?: string;
  startedAt?: Date;
  endedAt?: Date;
  durationMinutes?: number | null;
  status?: WorkoutStatus;
  routineId?: string | null;
  exercises?: UpdateWorkoutExerciseDto[];
}

export const GYM_REPOSITORY_PORT = Symbol('GYM_REPOSITORY_PORT');

export interface IGymRepositoryPort {
  ensureCatalogExercises(userId: string): Promise<void>;
  getExercises(userId: string, options?: { search?: string; muscle?: string; equipment?: string; favoriteOnly?: boolean }): Promise<ExerciseDomain[]>;
  getExerciseById(userId: string, id: string): Promise<ExerciseDomain | null>;
  createExercise(userId: string, dto: CreateExerciseDto): Promise<ExerciseDomain>;
  updateExercise(userId: string, id: string, dto: UpdateExerciseDto): Promise<ExerciseDomain>;
  archiveExercise(userId: string, id: string): Promise<ExerciseDomain>;
  toggleFavoriteExercise(userId: string, id: string): Promise<ExerciseDomain>;
  updateExerciseImage(userId: string, id: string, storageKey: string, url: string): Promise<ExerciseDomain>;
  deleteExerciseImage(userId: string, id: string): Promise<ExerciseDomain>;

  getExerciseStats(userId: string, id: string): Promise<ExerciseStatsDomain>;
  getExerciseProgress(userId: string, id: string, range?: '1M' | '3M' | '6M' | '1Y' | 'ALL'): Promise<GymExerciseProgressDomain>;

  getRoutines(userId: string): Promise<GymRoutineDomain[]>;
  getRoutineById(userId: string, id: string): Promise<GymRoutineDomain | null>;
  createRoutine(userId: string, dto: CreateRoutineDto): Promise<GymRoutineDomain>;
  updateRoutine(userId: string, id: string, dto: UpdateRoutineDto): Promise<GymRoutineDomain>;
  archiveRoutine(userId: string, id: string): Promise<GymRoutineDomain>;
  deleteRoutine(userId: string, id: string): Promise<void>;
  startWorkoutFromRoutine(userId: string, routineId: string): Promise<WorkoutDomain>;
  createRoutineFromWorkout(userId: string, workoutId: string, name?: string): Promise<GymRoutineDomain>;
  updateRoutineFromWorkout(userId: string, routineId: string, workoutId: string): Promise<GymRoutineDomain>;

  getWorkouts(userId: string, options?: { status?: WorkoutStatus; limit?: number; from?: Date; to?: Date }): Promise<WorkoutDomain[]>;
  getWorkoutById(userId: string, id: string): Promise<WorkoutDomain | null>;
  createWorkout(userId: string, dto: CreateWorkoutDto): Promise<WorkoutDomain>;
  updateWorkout(userId: string, id: string, dto: UpdateWorkoutDto): Promise<WorkoutDomain>;
  repeatWorkout(userId: string, workoutId: string): Promise<WorkoutDomain>;
  deleteWorkout(userId: string, id: string): Promise<void>;

  completeWorkout(userId: string, id: string): Promise<WorkoutDomain>;
  abandonWorkout(userId: string, id: string): Promise<WorkoutDomain>;

  getOverview(userId: string): Promise<GymOverviewDomain>;
  getAnalytics(userId: string, range?: '1M' | '3M' | '6M' | '1Y' | 'ALL' | 'CUSTOM', from?: Date, to?: Date): Promise<GymAnalyticsDomain>;
}
