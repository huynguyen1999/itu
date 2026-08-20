import {
  CreateExerciseDto,
  UpdateExerciseDto,
  CreateRoutineDto,
  UpdateRoutineDto,
  CreateWorkoutDto,
  UpdateWorkoutDto,
} from '../ports/out/gym-repository.port';
import type { IGymRepositoryPort } from '../ports/out/gym-repository.port';
import {
  ExerciseDomain,
  WorkoutDomain,
  ExerciseStatsDomain,
  GymOverviewDomain,
  GymExerciseProgressDomain,
  GymAnalyticsDomain,
  GymRoutineDomain,
  WorkoutStatus,
} from '../../domain/gym/gym.domain';

export class GymService {
  constructor(
    private readonly gymRepo: IGymRepositoryPort,
  ) {}

  async getExercises(
    userId: string,
    options?: { search?: string; muscle?: string; equipment?: string; favoriteOnly?: boolean },
  ): Promise<ExerciseDomain[]> {
    return this.gymRepo.getExercises(userId, options);
  }

  async getExerciseById(userId: string, id: string): Promise<ExerciseDomain | null> {
    return this.gymRepo.getExerciseById(userId, id);
  }

  async createExercise(userId: string, dto: CreateExerciseDto): Promise<ExerciseDomain> {
    return this.gymRepo.createExercise(userId, dto);
  }

  async updateExercise(userId: string, id: string, dto: UpdateExerciseDto): Promise<ExerciseDomain> {
    return this.gymRepo.updateExercise(userId, id, dto);
  }

  async toggleFavoriteExercise(userId: string, id: string): Promise<ExerciseDomain> {
    return this.gymRepo.toggleFavoriteExercise(userId, id);
  }

  async archiveExercise(userId: string, id: string): Promise<ExerciseDomain> {
    return this.gymRepo.archiveExercise(userId, id);
  }

  async updateExerciseImage(userId: string, id: string, storageKey: string, url: string): Promise<ExerciseDomain> {
    return this.gymRepo.updateExerciseImage(userId, id, storageKey, url);
  }

  async deleteExerciseImage(userId: string, id: string): Promise<ExerciseDomain> {
    return this.gymRepo.deleteExerciseImage(userId, id);
  }

  async getExerciseStats(userId: string, id: string): Promise<ExerciseStatsDomain> {
    return this.gymRepo.getExerciseStats(userId, id);
  }

  async getExerciseProgress(
    userId: string,
    id: string,
    range?: '1M' | '3M' | '6M' | '1Y' | 'ALL',
  ): Promise<GymExerciseProgressDomain> {
    return this.gymRepo.getExerciseProgress(userId, id, range);
  }

  async getRoutines(userId: string): Promise<GymRoutineDomain[]> {
    return this.gymRepo.getRoutines(userId);
  }

  async getRoutineById(userId: string, id: string): Promise<GymRoutineDomain | null> {
    return this.gymRepo.getRoutineById(userId, id);
  }

  async createRoutine(userId: string, dto: CreateRoutineDto): Promise<GymRoutineDomain> {
    return this.gymRepo.createRoutine(userId, dto);
  }

  async updateRoutine(userId: string, id: string, dto: UpdateRoutineDto): Promise<GymRoutineDomain> {
    return this.gymRepo.updateRoutine(userId, id, dto);
  }

  async archiveRoutine(userId: string, id: string): Promise<GymRoutineDomain> {
    return this.gymRepo.archiveRoutine(userId, id);
  }

  async deleteRoutine(userId: string, id: string): Promise<void> {
    return this.gymRepo.deleteRoutine(userId, id);
  }

  async startWorkoutFromRoutine(userId: string, routineId: string): Promise<WorkoutDomain> {
    return this.gymRepo.startWorkoutFromRoutine(userId, routineId);
  }

  async createRoutineFromWorkout(userId: string, workoutId: string, name?: string): Promise<GymRoutineDomain> {
    return this.gymRepo.createRoutineFromWorkout(userId, workoutId, name);
  }

  async updateRoutineFromWorkout(userId: string, routineId: string, workoutId: string): Promise<GymRoutineDomain> {
    return this.gymRepo.updateRoutineFromWorkout(userId, routineId, workoutId);
  }

  async getWorkouts(
    userId: string,
    options?: { status?: WorkoutStatus; limit?: number; from?: Date; to?: Date },
  ): Promise<WorkoutDomain[]> {
    return this.gymRepo.getWorkouts(userId, options);
  }

  async getWorkoutById(userId: string, id: string): Promise<WorkoutDomain | null> {
    return this.gymRepo.getWorkoutById(userId, id);
  }

  async createWorkout(userId: string, dto: CreateWorkoutDto): Promise<WorkoutDomain> {
    return this.gymRepo.createWorkout(userId, dto);
  }

  async updateWorkout(userId: string, id: string, dto: UpdateWorkoutDto): Promise<WorkoutDomain> {
    return this.gymRepo.updateWorkout(userId, id, dto);
  }

  async repeatWorkout(userId: string, workoutId: string): Promise<WorkoutDomain> {
    return this.gymRepo.repeatWorkout(userId, workoutId);
  }

  async deleteWorkout(userId: string, id: string): Promise<void> {
    return this.gymRepo.deleteWorkout(userId, id);
  }

  async completeWorkout(userId: string, id: string): Promise<WorkoutDomain> {
    return this.gymRepo.completeWorkout(userId, id);
  }

  async abandonWorkout(userId: string, id: string): Promise<WorkoutDomain> {
    return this.gymRepo.abandonWorkout(userId, id);
  }

  async getOverview(userId: string): Promise<GymOverviewDomain> {
    return this.gymRepo.getOverview(userId);
  }

  async getAnalytics(userId: string, range?: '1M' | '3M' | '6M' | '1Y' | 'ALL' | 'CUSTOM', from?: Date, to?: Date): Promise<GymAnalyticsDomain> {
    return this.gymRepo.getAnalytics(userId, range, from, to);
  }
}
