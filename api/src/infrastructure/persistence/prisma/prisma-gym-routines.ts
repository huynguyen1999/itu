import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  IGymRepositoryPort,
  CreateExerciseDto,
  UpdateExerciseDto,
  CreateRoutineDto,
  UpdateRoutineDto,
  CreateRoutineExerciseDto,
  CreateWorkoutDto,
  UpdateWorkoutDto,
} from '@core/application/ports/out/gym-repository.port';
import {
  ExerciseDomain,
  WorkoutDomain,
  WorkoutSetDomain,
  ExerciseStatsDomain,
  GymOverviewDomain,
  GymExerciseProgressDomain,
  GymAnalyticsDomain,
  GymRoutineDomain,
  GymRoutineExerciseDomain,
  WorkoutSetType,
  WorkoutStatus,
  ExerciseMetricType,
  WeightUnit,
} from '@core/domain/gym/gym.domain';
import { createUlid } from './ulid';
import { GymWorkoutStatus as PrismaGymWorkoutStatus } from '@prisma/client';
import { recordSyncChange } from './prisma-sync-mutation.shared';
import { BUILT_IN_EXERCISE_CATALOG } from '@core/application/constants/gym-exercise-catalog';
import {
  buildExerciseProgress,
  calculateMuscleDistribution,
  calculateWeeklyConsistencyStreak,
  detectWorkoutPRs,
  getWeekBoundaries,
  isWorkingSet,
} from '@core/domain/gym/gym-calculations';
import { PrismaGymExercises } from './prisma-gym-exercises';

export abstract class PrismaGymRoutines extends PrismaGymExercises {
  protected abstract createWorkout(userId: string, dto: CreateWorkoutDto): Promise<WorkoutDomain>;
  protected abstract getWorkoutById(userId: string, id: string): Promise<WorkoutDomain | null>;

  // ---------------------------------------------------------------------------
  // ROUTINES
  // ---------------------------------------------------------------------------

  async getRoutines(userId: string): Promise<GymRoutineDomain[]> {
    const routines = await this.prisma.gymRoutine.findMany({
      where: { userId, archivedAt: null, deletedAt: null },
      include: {
        exercises: {
          where: { deletedAt: null },
          include: { exercise: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });
    return routines.map((r) => this.mapRoutine(r));
  }

  async getRoutineById(userId: string, id: string): Promise<GymRoutineDomain | null> {
    const routine = await this.prisma.gymRoutine.findFirst({
      where: { id, userId, deletedAt: null },
      include: {
        exercises: {
          where: { deletedAt: null },
          include: { exercise: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    return routine ? this.mapRoutine(routine) : null;
  }

  async createRoutine(userId: string, dto: CreateRoutineDto): Promise<GymRoutineDomain> {
    const routineId = dto.id || createUlid();
    const count = await this.prisma.gymRoutine.count({ where: { userId, deletedAt: null } });

    await this.prisma.$transaction(async (tx) => {
      await tx.gymRoutine.create({
        data: {
          id: routineId,
          userId,
          name: dto.name.trim(),
          description: dto.description || null,
          sortOrder: dto.sortOrder ?? count,
        },
      });

      if (dto.exercises && dto.exercises.length > 0) {
        for (let i = 0; i < dto.exercises.length; i++) {
          const exDto = dto.exercises[i];
          const exUlid = exDto.id || createUlid();
          await tx.gymRoutineExercise.create({
            data: {
              id: exUlid,
              routineId,
              exerciseId: exDto.exerciseId,
              sortOrder: exDto.sortOrder ?? i,
              setCount: exDto.setCount ?? 3,
              targetRepsMin: exDto.targetRepsMin ?? null,
              targetRepsMax: exDto.targetRepsMax ?? null,
              targetDurationSeconds: exDto.targetDurationSeconds ?? null,
              targetDistanceMeters: exDto.targetDistanceMeters ?? null,
              restSeconds: exDto.restSeconds ?? null,
              note: exDto.note || null,
            },
          });
        }
      }
    });

    const full = await this.getRoutineById(userId, routineId);
    await this.prisma.$transaction(async (tx) => {
      await recordSyncChange(tx, userId, 'gymroutine', routineId, 'UPSERT', full ?? { id: routineId });
    });
    return full!;
  }

  async updateRoutine(userId: string, id: string, dto: UpdateRoutineDto): Promise<GymRoutineDomain> {
    const existing = await this.getRoutineById(userId, id);
    if (!existing) throw new Error(`Routine ${id} not found`);

    await this.prisma.$transaction(async (tx) => {
      const data: any = { version: { increment: 1 } };
      if (dto.name !== undefined) data.name = dto.name.trim();
      if (dto.description !== undefined) data.description = dto.description;
      if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

      await tx.gymRoutine.update({
        where: { id },
        data,
      });

      if (dto.exercises !== undefined) {
        const currentExercises = await tx.gymRoutineExercise.findMany({ where: { routineId: id } });
        const incomingIds = dto.exercises.filter((ex) => ex.id).map((ex) => ex.id!);
        const toDelete = currentExercises.map((e) => e.id).filter((eId) => !incomingIds.includes(eId));

        if (toDelete.length > 0) {
          await tx.gymRoutineExercise.deleteMany({ where: { id: { in: toDelete } } });
        }

        for (let i = 0; i < dto.exercises.length; i++) {
          const exDto = dto.exercises[i];
          const exId = exDto.id || createUlid();

          await tx.gymRoutineExercise.upsert({
            where: { id: exId },
            create: {
              id: exId,
              routineId: id,
              exerciseId: exDto.exerciseId,
              sortOrder: exDto.sortOrder ?? i,
              setCount: exDto.setCount ?? 3,
              targetRepsMin: exDto.targetRepsMin ?? null,
              targetRepsMax: exDto.targetRepsMax ?? null,
              targetDurationSeconds: exDto.targetDurationSeconds ?? null,
              targetDistanceMeters: exDto.targetDistanceMeters ?? null,
              restSeconds: exDto.restSeconds ?? null,
              note: exDto.note || null,
            },
            update: {
              exerciseId: exDto.exerciseId,
              sortOrder: exDto.sortOrder ?? i,
              setCount: exDto.setCount ?? 3,
              targetRepsMin: exDto.targetRepsMin ?? null,
              targetRepsMax: exDto.targetRepsMax ?? null,
              targetDurationSeconds: exDto.targetDurationSeconds ?? null,
              targetDistanceMeters: exDto.targetDistanceMeters ?? null,
              restSeconds: exDto.restSeconds ?? null,
              note: exDto.note || null,
              version: { increment: 1 },
            },
          });
        }
      }
    });

    const full = await this.getRoutineById(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await recordSyncChange(tx, userId, 'gymroutine', id, 'UPSERT', full ?? { id });
    });
    return full!;
  }

  async archiveRoutine(userId: string, id: string): Promise<GymRoutineDomain> {
    const existing = await this.getRoutineById(userId, id);
    if (!existing) throw new Error(`Routine ${id} not found`);

    const updated = await this.prisma.gymRoutine.update({
      where: { id },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });
    await this.prisma.$transaction(async (tx) => {
      await recordSyncChange(tx, userId, 'gymroutine', id, 'DELETE', { id });
    });
    return this.mapRoutine(updated);
  }

  async deleteRoutine(userId: string, id: string): Promise<void> {
    const existing = await this.getRoutineById(userId, id);
    if (!existing) throw new Error(`Routine ${id} not found`);

    await this.prisma.gymRoutine.update({
      where: { id },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await this.prisma.$transaction(async (tx) => {
      await recordSyncChange(tx, userId, 'gymroutine', id, 'DELETE', { id });
    });
  }

  async startWorkoutFromRoutine(userId: string, routineId: string): Promise<WorkoutDomain> {
    const routine = await this.getRoutineById(userId, routineId);
    if (!routine) throw new Error(`Routine ${routineId} not found`);

    const active = await this.prisma.gymWorkout.findFirst({
      where: { userId, status: PrismaGymWorkoutStatus.IN_PROGRESS, deletedAt: null },
    });
    if (active) throw new Error('An active workout already exists');

    const workoutExercises: any[] = [];
    for (let i = 0; i < routine.exercises.length; i++) {
      const re = routine.exercises[i];
      const sets: any[] = [];
      const count = Math.max(1, re.setCount || 3);
      for (let sIdx = 0; sIdx < count; sIdx++) {
        sets.push({
          id: createUlid(),
          sortOrder: sIdx,
          type: 'NORMAL',
          reps: re.targetRepsMin ?? null,
          weight: null,
          durationSeconds: re.targetDurationSeconds ?? null,
          distanceMeters: re.targetDistanceMeters ?? null,
          completedAt: null,
        });
      }
      workoutExercises.push({
        id: createUlid(),
        exerciseId: re.exerciseId,
        sortOrder: i,
        note: re.note || null,
        restSeconds: re.restSeconds || null,
        sets,
      });
    }

    return this.createWorkout(userId, {
      title: routine.name,
      routineId: routine.id,
      exercises: workoutExercises,
    });
  }

  async createRoutineFromWorkout(userId: string, workoutId: string, name?: string): Promise<GymRoutineDomain> {
    const workout = await this.getWorkoutById(userId, workoutId);
    if (!workout) throw new Error(`Workout ${workoutId} not found`);

    const routineExercises: CreateRoutineExerciseDto[] = workout.exercises.map((ex, idx) => ({
      exerciseId: ex.exerciseId,
      sortOrder: idx,
      setCount: ex.sets.length > 0 ? ex.sets.length : 3,
      restSeconds: ex.restSeconds || null,
      note: ex.note || null,
    }));

    return this.createRoutine(userId, {
      name: name || workout.title || 'New Routine',
      exercises: routineExercises,
    });
  }

  async updateRoutineFromWorkout(userId: string, routineId: string, workoutId: string): Promise<GymRoutineDomain> {
    const workout = await this.getWorkoutById(userId, workoutId);
    if (!workout) throw new Error(`Workout ${workoutId} not found`);

    const routineExercises: CreateRoutineExerciseDto[] = workout.exercises.map((ex, idx) => ({
      exerciseId: ex.exerciseId,
      sortOrder: idx,
      setCount: ex.sets.length > 0 ? ex.sets.length : 3,
      restSeconds: ex.restSeconds || null,
      note: ex.note || null,
    }));

    return this.updateRoutine(userId, routineId, {
      exercises: routineExercises,
    });
  }

}
