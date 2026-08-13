import { Inject, Injectable } from '@nestjs/common';
import {
  GYM_REPOSITORY_PORT,
  CreateExerciseDto,
  UpdateExerciseDto,
  CreateWorkoutDto,
  UpdateWorkoutDto,
} from '../ports/out/gym-repository.port';
import type { IGymRepositoryPort } from '../ports/out/gym-repository.port';
import {
  ExerciseDomain,
  WorkoutDomain,
  ExerciseStatsDomain,
  GymOverviewDomain,
  WorkoutStatus,
} from '../../domain/gym/gym.domain';

@Injectable()
export class GymService {
  constructor(
    @Inject(GYM_REPOSITORY_PORT)
    private readonly gymRepo: IGymRepositoryPort,
  ) {}

  async getExercises(userId: string): Promise<ExerciseDomain[]> {
    return this.gymRepo.getExercises(userId);
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

  async getWorkouts(userId: string, options?: { status?: WorkoutStatus; limit?: number }): Promise<WorkoutDomain[]> {
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
}
