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
import { PrismaGymRoutines } from './prisma-gym-routines';

@Injectable()
export class PrismaGymRepository extends PrismaGymRoutines implements IGymRepositoryPort {
  constructor(prisma: PrismaService) {
    super(prisma);
  }

  // ---------------------------------------------------------------------------
  // WORKOUTS
  // ---------------------------------------------------------------------------

  async getWorkouts(
    userId: string,
    options?: { status?: WorkoutStatus; limit?: number; from?: Date; to?: Date },
  ): Promise<WorkoutDomain[]> {
    const where: any = { userId, deletedAt: null };

    if (options?.status) {
      where.status = options.status === 'ACTIVE' || options.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : options.status;
    }
    if (options?.from || options?.to) {
      where.startedAt = {};
      if (options.from) where.startedAt.gte = options.from;
      if (options.to) where.startedAt.lte = options.to;
    }

    const entries = await this.prisma.gymWorkout.findMany({
      where,
      include: {
        exercises: {
          where: { deletedAt: null },
          include: { exercise: true, sets: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: options?.limit,
    });

    return entries.map((e) => this.mapWorkout(e));
  }

  async getWorkoutById(userId: string, id: string): Promise<WorkoutDomain | null> {
    const entry = await this.prisma.gymWorkout.findFirst({
      where: { id, userId, deletedAt: null },
      include: {
        exercises: {
          where: { deletedAt: null },
          include: { exercise: true, sets: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });

    if (!entry) return null;
    return this.mapWorkout(entry);
  }

  async createWorkout(userId: string, dto: CreateWorkoutDto): Promise<WorkoutDomain> {
    const workoutId = dto.id || createUlid();
    const isCompleted = dto.status === 'COMPLETED';
    const status = isCompleted ? PrismaGymWorkoutStatus.COMPLETED : PrismaGymWorkoutStatus.IN_PROGRESS;

    if (!isCompleted) {
      const active = await this.prisma.gymWorkout.findFirst({
        where: { userId, status: PrismaGymWorkoutStatus.IN_PROGRESS, deletedAt: null },
      });
      if (active) throw new Error('An active workout already exists');
    }

    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : isCompleted ? startedAt : null;
    const durationMinutes = dto.durationMinutes ?? (endedAt ? Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)) : null);

    const workout = await this.prisma.gymWorkout.create({
      data: {
        id: workoutId,
        userId,
        routineId: dto.routineId || null,
        title: dto.title || 'Workout',
        status,
        startedAt,
        endedAt,
        durationMinutes,
      },
    });

    if (dto.exercises && dto.exercises.length > 0) {
      await this.updateWorkout(userId, workout.id, {
        exercises: dto.exercises,
      });
    }

    const refreshed = await this.getWorkoutById(userId, workout.id);
    await this.prisma.$transaction(async (tx) => {
      await recordSyncChange(tx, userId, 'gymworkout', workout.id, 'UPSERT', refreshed ?? workout);
    });
    return refreshed!;
  }

  async updateWorkout(userId: string, id: string, dto: UpdateWorkoutDto): Promise<WorkoutDomain> {
    const existing = await this.getWorkoutById(userId, id);
    if (!existing) {
      throw new Error(`Workout ${id} not found`);
    }

    const updateWorkoutData: any = {};

    if (dto.title !== undefined) updateWorkoutData.title = dto.title;
    if (dto.startedAt !== undefined) updateWorkoutData.startedAt = new Date(dto.startedAt);
    if (dto.endedAt !== undefined) updateWorkoutData.endedAt = dto.endedAt ? new Date(dto.endedAt) : null;
    if (dto.durationMinutes !== undefined) updateWorkoutData.durationMinutes = dto.durationMinutes;
    if (dto.routineId !== undefined) updateWorkoutData.routineId = dto.routineId;
    if (dto.status !== undefined) {
      updateWorkoutData.status = dto.status === 'COMPLETED' ? PrismaGymWorkoutStatus.COMPLETED : PrismaGymWorkoutStatus.IN_PROGRESS;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.gymWorkout.update({
        where: { id },
        data: { ...updateWorkoutData, version: { increment: 1 } },
      });

      if (dto.exercises !== undefined) {
        const existingWorkout = await tx.gymWorkout.findUnique({
          where: { id },
          include: { exercises: true },
        });

        if (existingWorkout) {
          const currentExIds = existingWorkout.exercises.map((ex) => ex.id);
          const incomingExIds = dto.exercises.filter((ex) => ex.id).map((ex) => ex.id!);

          const toDelete = currentExIds.filter((exId) => !incomingExIds.includes(exId));
          if (toDelete.length > 0) {
            await tx.gymWorkoutExercise.deleteMany({ where: { id: { in: toDelete } } });
          }

          for (let i = 0; i < dto.exercises.length; i++) {
            const exDto = dto.exercises[i];
            const exId = exDto.id || createUlid();
            const definition = await tx.exerciseDefinition.findFirst({
              where: { id: exDto.exerciseId, userId, deletedAt: null },
            });
            if (!definition) throw new Error(`Exercise ${exDto.exerciseId} not found`);

            await tx.gymWorkoutExercise.upsert({
              where: { id: exId },
              create: {
                id: exId,
                workoutId: id,
                exerciseId: exDto.exerciseId,
                exerciseName: definition.name,
                metricType: definition.metricType,
                weightUnit: definition.defaultWeightUnit,
                sortOrder: exDto.sortOrder ?? i,
                note: exDto.note || null,
                restSeconds: exDto.restSeconds || null,
              },
              update: {
                exerciseId: exDto.exerciseId,
                exerciseName: definition.name,
                metricType: definition.metricType,
                weightUnit: definition.defaultWeightUnit,
                sortOrder: exDto.sortOrder ?? i,
                note: exDto.note || null,
                restSeconds: exDto.restSeconds || null,
              },
            });

            if (exDto.sets !== undefined) {
              const existingSets = await tx.gymWorkoutSet.findMany({
                where: { workoutExerciseId: exId },
              });
              const currentSetIds = existingSets.map((s) => s.id);
              const incomingSetIds = exDto.sets.filter((s) => s.id).map((s) => s.id!);

              const setsToDelete = currentSetIds.filter((sId) => !incomingSetIds.includes(sId));
              if (setsToDelete.length > 0) {
                await tx.gymWorkoutSet.deleteMany({ where: { id: { in: setsToDelete } } });
              }

              for (let sIdx = 0; sIdx < exDto.sets.length; sIdx++) {
                const setDto = exDto.sets[sIdx];
                const setUlid = setDto.id || createUlid();

                await tx.gymWorkoutSet.upsert({
                  where: { id: setUlid },
                  create: {
                    id: setUlid,
                    workoutExerciseId: exId,
                    sortOrder: setDto.sortOrder ?? sIdx,
                    type: (setDto.type as any) || 'NORMAL',
                    reps: setDto.reps ?? null,
                    weight: setDto.weight ?? null,
                    durationSeconds: setDto.durationSeconds ?? null,
                    distanceMeters: setDto.distanceMeters ?? null,
                    rpe: setDto.rpe ?? null,
                    completedAt: setDto.completedAt ? new Date(setDto.completedAt) : null,
                  },
                  update: {
                    sortOrder: setDto.sortOrder ?? sIdx,
                    type: (setDto.type as any) || 'NORMAL',
                    reps: setDto.reps ?? null,
                    weight: setDto.weight ?? null,
                    durationSeconds: setDto.durationSeconds ?? null,
                    distanceMeters: setDto.distanceMeters ?? null,
                    rpe: setDto.rpe ?? null,
                    completedAt: setDto.completedAt === undefined ? undefined : setDto.completedAt ? new Date(setDto.completedAt) : null,
                  },
                });
              }
            }
          }
        }
      }
    });

    const updated = await this.getWorkoutById(userId, id);
    await this.prisma.$transaction(async (tx) => {
      await recordSyncChange(tx, userId, 'gymworkout', id, 'UPSERT', updated ?? { id });
    });
    return updated!;
  }

  async repeatWorkout(userId: string, workoutId: string): Promise<WorkoutDomain> {
    const previous = await this.getWorkoutById(userId, workoutId);
    if (!previous) throw new Error(`Workout ${workoutId} not found`);

    const newWorkoutExercises: any[] = previous.exercises.map((ex, eIdx) => ({
      id: createUlid(),
      exerciseId: ex.exerciseId,
      sortOrder: eIdx,
      note: ex.note || null,
      restSeconds: ex.restSeconds || null,
      sets: ex.sets.map((s, sIdx) => ({
        id: createUlid(),
        sortOrder: sIdx,
        type: s.type || 'NORMAL',
        reps: s.reps ?? null,
        weight: s.weight ?? null,
        durationSeconds: s.durationSeconds ?? null,
        distanceMeters: s.distanceMeters ?? null,
        rpe: null,
        completedAt: null,
      })),
    }));

    return this.createWorkout(userId, {
      title: previous.title || 'Workout',
      routineId: previous.routineId || null,
      exercises: newWorkoutExercises,
    });
  }

  async deleteWorkout(userId: string, id: string): Promise<void> {
    const result = await this.prisma.gymWorkout.updateMany({
      where: { id, userId, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count === 0) throw new Error(`Workout ${id} not found`);
    await this.prisma.$transaction(async (tx) => {
      await recordSyncChange(tx, userId, 'gymworkout', id, 'DELETE', { id });
    });
  }

  async completeWorkout(userId: string, id: string): Promise<WorkoutDomain> {
    const workout = await this.getWorkoutById(userId, id);
    if (!workout) throw new Error(`Workout ${id} not found`);
    if (workout.status === 'COMPLETED') return workout;

    const endedAt = new Date();
    const startedAt = workout.startedAt ? new Date(workout.startedAt) : endedAt;
    const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));
    await this.prisma.$transaction(async (tx) => {
      await tx.gymWorkoutSet.updateMany({
        where: { workoutExercise: { workoutId: id }, completedAt: null, deletedAt: null },
        data: { deletedAt: endedAt, version: { increment: 1 } },
      });
      await tx.gymWorkoutExercise.updateMany({
        where: {
          workoutId: id,
          deletedAt: null,
          sets: { none: { completedAt: { not: null }, deletedAt: null } },
        },
        data: { deletedAt: endedAt, version: { increment: 1 } },
      });
      await tx.gymWorkout.update({
        where: { id },
        data: {
          status: PrismaGymWorkoutStatus.COMPLETED,
          endedAt,
          durationMinutes,
          version: { increment: 1 },
        },
      });
    });

    const completed = await this.getWorkoutById(userId, id);
    if (!completed) throw new Error(`Workout ${id} not found after completion`);
    await this.prisma.$transaction(async (tx) => {
      await recordSyncChange(tx, userId, 'gymworkout', id, 'UPSERT', completed);
    });
    return completed;
  }

  async abandonWorkout(userId: string, id: string): Promise<WorkoutDomain> {
    const workout = await this.getWorkoutById(userId, id);
    if (!workout) throw new Error(`Workout ${id} not found`);
    await this.deleteWorkout(userId, id);
    return { ...workout, deletedAt: new Date() };
  }

  // ---------------------------------------------------------------------------
  // OVERVIEW & ANALYTICS
  // ---------------------------------------------------------------------------

  async getOverview(userId: string): Promise<GymOverviewDomain> {
    const now = new Date();
    const { startOfWeek, endOfWeek } = getWeekBoundaries(now);

    const prevWeekRef = new Date(startOfWeek);
    prevWeekRef.setDate(prevWeekRef.getDate() - 7);
    const { startOfWeek: prevStart, endOfWeek: prevEnd } = getWeekBoundaries(prevWeekRef);

    // Fetch user preferences for weeklyWorkoutTarget
    const userPref = await this.prisma.userPreferences.findUnique({ where: { userId } });
    const gymPref = (userPref?.gymPreferences as any) || {};
    const weeklyWorkoutTarget = typeof gymPref.weeklyWorkoutTarget === 'number' ? gymPref.weeklyWorkoutTarget : null;

    // Fetch all completed workouts for consistency streak & recent list
    const allCompleted = await this.getWorkouts(userId, { status: 'COMPLETED' });

    // Filter workouts for this week
    const thisWeekWorkouts = allCompleted.filter((w) => {
      const d = w.startedAt ? new Date(w.startedAt) : new Date(w.createdAt);
      return d >= startOfWeek && d <= endOfWeek;
    });

    // Filter workouts for previous week
    const prevWeekWorkouts = allCompleted.filter((w) => {
      const d = w.startedAt ? new Date(w.startedAt) : new Date(w.createdAt);
      return d >= prevStart && d <= prevEnd;
    });

    let weeklySetsCount = 0;
    let weeklyVolumeKg = 0;
    let trainingMinutes = 0;

    for (const w of thisWeekWorkouts) {
      trainingMinutes += w.durationMinutes || 0;
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          if (!isWorkingSet(s)) continue;
          weeklySetsCount++;
          if (s.weight && s.reps) {
            weeklyVolumeKg += Number(s.weight) * s.reps;
          }
        }
      }
    }

    let prevSetsCount = 0;
    let prevVolumeKg = 0;
    let prevTrainingMinutes = 0;

    for (const w of prevWeekWorkouts) {
      prevTrainingMinutes += w.durationMinutes || 0;
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          if (!isWorkingSet(s)) continue;
          prevSetsCount++;
          if (s.weight && s.reps) {
            prevVolumeKg += Number(s.weight) * s.reps;
          }
        }
      }
    }

    const muscleSets = calculateMuscleDistribution(thisWeekWorkouts);
    const consistencyStreakWeeks = calculateWeeklyConsistencyStreak(allCompleted, weeklyWorkoutTarget, now);

    // PR detection for this week
    let prCount = 0;
    for (const w of thisWeekWorkouts) {
      const prs = detectWorkoutPRs(w, allCompleted);
      prCount += prs.length;
    }

    let prevPrCount = 0;
    for (const w of prevWeekWorkouts) {
      const prs = detectWorkoutPRs(w, allCompleted);
      prevPrCount += prs.length;
    }

    const recentWorkouts = await this.getWorkouts(userId, { limit: 5 });

    return {
      startDate: startOfWeek,
      endDate: endOfWeek,
      weeklyWorkoutsCount: thisWeekWorkouts.length,
      weeklyWorkoutTarget,
      consistencyStreakWeeks,
      weeklySetsCount,
      weeklyVolumeKg: Math.round(weeklyVolumeKg),
      trainingMinutes,
      prCount,
      muscleSets,
      previousWeek: {
        weeklyWorkoutsCount: prevWeekWorkouts.length,
        weeklySetsCount: prevSetsCount,
        weeklyVolumeKg: Math.round(prevVolumeKg),
        trainingMinutes: prevTrainingMinutes,
        prCount: prevPrCount,
      },
      recentWorkouts,
    };
  }

  async getAnalytics(userId: string, range: '1M' | '3M' | '6M' | '1Y' | 'ALL' | 'CUSTOM' = '3M', from?: Date, to?: Date): Promise<GymAnalyticsDomain> {
    const now = new Date();
    let fromDate = from;
    if (range !== 'CUSTOM' && range !== 'ALL') {
      fromDate = new Date(now);
      if (range === '1M') fromDate.setMonth(fromDate.getMonth() - 1);
      else if (range === '3M') fromDate.setMonth(fromDate.getMonth() - 3);
      else if (range === '6M') fromDate.setMonth(fromDate.getMonth() - 6);
      else if (range === '1Y') fromDate.setFullYear(fromDate.getFullYear() - 1);
    }
    const filtered = await this.getWorkouts(userId, { status: 'COMPLETED', from: fromDate, to });
    // ponytail: PR history is intentionally scoped to the selected range; loading all
    // workouts just to compute an overview defeats the aggregate endpoint's bound.
    const allCompleted = filtered;

    let totalWorkingSets = 0;
    let totalVolumeKg = 0;
    let totalTrainingMinutes = 0;
    let totalPRs = 0;

    for (const w of filtered) {
      totalTrainingMinutes += w.durationMinutes || 0;
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          if (!isWorkingSet(s)) continue;
          totalWorkingSets++;
          if (s.weight && s.reps) totalVolumeKg += Number(s.weight) * s.reps;
        }
      }
      const prs = detectWorkoutPRs(w, allCompleted);
      totalPRs += prs.length;
    }

    const muscleDistribution = calculateMuscleDistribution(filtered);

    // Build weekly trend
    const weeksMap = new Map<string, { weekLabel: string; startDate: Date; workouts: number; sets: number; volumeKg: number; trainingMinutes: number }>();
    for (const w of filtered) {
      const date = w.startedAt ? new Date(w.startedAt) : new Date(w.createdAt);
      const { startOfWeek } = getWeekBoundaries(date);
      const weekKey = startOfWeek.toISOString().slice(0, 10);

      const entry = weeksMap.get(weekKey) || {
        weekLabel: `${startOfWeek.getMonth() + 1}/${startOfWeek.getDate()}`,
        startDate: startOfWeek,
        workouts: 0,
        sets: 0,
        volumeKg: 0,
        trainingMinutes: 0,
      };

      entry.workouts++;
      entry.trainingMinutes += w.durationMinutes || 0;
      for (const ex of w.exercises) {
        for (const s of ex.sets) {
          if (!isWorkingSet(s)) continue;
          entry.sets++;
          if (s.weight && s.reps) entry.volumeKg += Number(s.weight) * s.reps;
        }
      }
      weeksMap.set(weekKey, entry);
    }

    const weeklyTrend = Array.from(weeksMap.values()).sort(
      (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

    return {
      range,
      totalWorkouts: filtered.length,
      totalWorkingSets,
      totalVolumeKg: Math.round(totalVolumeKg),
      totalTrainingMinutes,
      totalPRs,
      muscleDistribution,
      weeklyTrend,
    };
  }
}
