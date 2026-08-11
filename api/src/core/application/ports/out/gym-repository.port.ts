import {
  ExerciseDomain,
  WorkoutDomain,
  ExerciseStatsDomain,
  GymOverviewDomain,
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
}

export interface CreateWorkoutDto {
  id?: string;
  title?: string;
  exercises?: UpdateWorkoutExerciseDto[];
}

export interface UpdateWorkoutSetDto {
  id?: string;
  sortOrder?: number;
  type?: WorkoutSetType;
  reps?: number;
  weight?: number;
  durationSeconds?: number;
  distanceMeters?: number;
  rpe?: number;
  completedAt?: Date | null;
}

export interface UpdateWorkoutExerciseDto {
  id?: string;
  exerciseId: string;
  sortOrder?: number;
  note?: string;
  restSeconds?: number;
  sets?: UpdateWorkoutSetDto[];
}

export interface UpdateWorkoutDto {
  title?: string;
  startedAt?: Date;
  endedAt?: Date;
  durationMinutes?: number;
  exercises?: UpdateWorkoutExerciseDto[];
}

export const GYM_REPOSITORY_PORT = Symbol('GYM_REPOSITORY_PORT');

export interface IGymRepositoryPort {
  getExercises(userId: string): Promise<ExerciseDomain[]>;
  getExerciseById(userId: string, id: string): Promise<ExerciseDomain | null>;
  createExercise(userId: string, dto: CreateExerciseDto): Promise<ExerciseDomain>;
  updateExercise(userId: string, id: string, dto: UpdateExerciseDto): Promise<ExerciseDomain>;
  archiveExercise(userId: string, id: string): Promise<ExerciseDomain>;
  updateExerciseImage(userId: string, id: string, storageKey: string, url: string): Promise<ExerciseDomain>;
  deleteExerciseImage(userId: string, id: string): Promise<ExerciseDomain>;

  getExerciseStats(userId: string, id: string): Promise<ExerciseStatsDomain>;

  getWorkouts(userId: string, options?: { status?: WorkoutStatus; limit?: number }): Promise<WorkoutDomain[]>;
  getWorkoutById(userId: string, id: string): Promise<WorkoutDomain | null>;
  createWorkout(userId: string, dto: CreateWorkoutDto): Promise<WorkoutDomain>;
  updateWorkout(userId: string, id: string, dto: UpdateWorkoutDto): Promise<WorkoutDomain>;
  deleteWorkout(userId: string, id: string): Promise<void>;

  completeWorkout(userId: string, id: string): Promise<WorkoutDomain>;
  abandonWorkout(userId: string, id: string): Promise<WorkoutDomain>;

  getOverview(userId: string): Promise<GymOverviewDomain>;
}
