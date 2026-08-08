import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import {
  IGymRepositoryPort,
  CreateExerciseDto,
  UpdateExerciseDto,
  CreateWorkoutDto,
  UpdateWorkoutDto,
} from '@core/application/ports/out/gym-repository.port';
import {
  ExerciseDomain,
  WorkoutDomain,
  ExerciseStatsDomain,
  GymOverviewDomain,
  WorkoutSetType,
  WorkoutStatus,
  ExerciseMetricType,
  WeightUnit,
} from '@core/domain/gym/gym.domain';
import { createUlid } from './ulid';
import { JournalEntryKind } from '@prisma/client';

@Injectable()
export class PrismaGymRepository implements IGymRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  private mapExercise(e: any): ExerciseDomain {
    return {
      id: e.id,
      userId: e.userId,
      name: e.name,
      normalizedName: e.normalizedName,
      description: e.description || null,
      imageStorageKey: e.imageStorageKey || null,
      imageUrl: e.imageUrl || null,
      metricType: e.metricType as ExerciseMetricType,
      equipment: e.equipment || null,
      primaryMuscleGroup: e.primaryMuscleGroup || null,
      secondaryMuscleGroups: e.secondaryMuscleGroups || [],
      defaultWeightUnit: e.defaultWeightUnit as WeightUnit,
      defaultRestSeconds: e.defaultRestSeconds || null,
      archivedAt: e.archivedAt || null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      version: e.version ?? 1,
    };
  }

  private mapWorkout(w: any): WorkoutDomain {
    const entry = w.entry || {};
    return {
      id: w.entryId || entry.id,
      userId: entry.userId,
      title: w.title || entry.title || 'Workout',
      status: (w.status as WorkoutStatus) || 'COMPLETED',
      startedAt: w.startedAt || entry.entryDate,
      endedAt: w.endedAt || null,
      durationMinutes: w.durationMinutes || null,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      version: entry.version ?? 1,
      exercises: (w.exercises || []).map((ex: any) => ({
        id: ex.id,
        workoutEntryId: ex.workoutEntryId,
        exerciseId: ex.exerciseId,
        sortOrder: ex.sortOrder,
        note: ex.note || null,
        restSeconds: ex.restSeconds || null,
        exercise: ex.exercise ? this.mapExercise(ex.exercise) : undefined,
        sets: (ex.sets || []).map((s: any) => ({
          id: s.id,
          workoutExerciseId: s.workoutExerciseId,
          sortOrder: s.sortOrder,
          type: (s.type as WorkoutSetType) || 'NORMAL',
          reps: s.reps ?? null,
          weight: s.weight != null ? Number(s.weight) : null,
          durationSeconds: s.durationSeconds ?? null,
          distanceMeters: s.distanceMeters ?? null,
          rpe: s.rpe != null ? Number(s.rpe) : null,
          completedAt: s.completedAt || null,
        })),
      })),
    };
  }

  async getExercises(userId: string): Promise<ExerciseDomain[]> {
    const exercises = await this.prisma.exerciseDefinition.findMany({
      where: { userId, archivedAt: null },
      orderBy: { name: 'asc' },
    });
    return exercises.map((e) => this.mapExercise(e));
  }

  async getExerciseById(userId: string, id: string): Promise<ExerciseDomain | null> {
    const ex = await this.prisma.exerciseDefinition.findFirst({
      where: { id, userId, archivedAt: null },
    });
    return ex ? this.mapExercise(ex) : null;
  }

  async createExercise(userId: string, dto: CreateExerciseDto): Promise<ExerciseDomain> {
    const normalizedName = dto.name.trim().toLowerCase();
    const ex = await this.prisma.exerciseDefinition.create({
      data: {
        id: createUlid(),
        userId,
        name: dto.name.trim(),
        normalizedName,
        description: dto.description || null,
        metricType: (dto.metricType as any) || 'WEIGHT_REPS',
        equipment: dto.equipment || null,
        primaryMuscleGroup: dto.primaryMuscleGroup || null,
        secondaryMuscleGroups: dto.secondaryMuscleGroups || [],
        defaultWeightUnit: (dto.defaultWeightUnit as any) || 'KG',
        defaultRestSeconds: dto.defaultRestSeconds || 60,
      },
    });
    return this.mapExercise(ex);
  }

  async updateExercise(userId: string, id: string, dto: UpdateExerciseDto): Promise<ExerciseDomain> {
    const data: any = {};
    if (dto.name !== undefined) {
      data.name = dto.name.trim();
      data.normalizedName = dto.name.trim().toLowerCase();
    }
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.metricType !== undefined) data.metricType = dto.metricType;
    if (dto.equipment !== undefined) data.equipment = dto.equipment;
    if (dto.primaryMuscleGroup !== undefined) data.primaryMuscleGroup = dto.primaryMuscleGroup;
    if (dto.secondaryMuscleGroups !== undefined) data.secondaryMuscleGroups = dto.secondaryMuscleGroups;
    if (dto.defaultWeightUnit !== undefined) data.defaultWeightUnit = dto.defaultWeightUnit;
    if (dto.defaultRestSeconds !== undefined) data.defaultRestSeconds = dto.defaultRestSeconds;
    if (dto.imageStorageKey !== undefined) data.imageStorageKey = dto.imageStorageKey;
    if (dto.imageUrl !== undefined) data.imageUrl = dto.imageUrl;

    const ex = await this.prisma.exerciseDefinition.update({
      where: { id },
      data: {
        ...data,
        version: { increment: 1 },
      },
    });
    return this.mapExercise(ex);
  }

  async archiveExercise(userId: string, id: string): Promise<ExerciseDomain> {
    const ex = await this.prisma.exerciseDefinition.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    return this.mapExercise(ex);
  }

  async updateExerciseImage(userId: string, id: string, storageKey: string, url: string): Promise<ExerciseDomain> {
    const ex = await this.prisma.exerciseDefinition.update({
      where: { id },
      data: { imageStorageKey: storageKey, imageUrl: url },
    });
    return this.mapExercise(ex);
  }

  async deleteExerciseImage(userId: string, id: string): Promise<ExerciseDomain> {
    const ex = await this.prisma.exerciseDefinition.update({
      where: { id },
      data: { imageStorageKey: null, imageUrl: null },
    });
    return this.mapExercise(ex);
  }

  async getExerciseStats(userId: string, id: string): Promise<ExerciseStatsDomain> {
    const exerciseSets = await this.prisma.journalWorkoutSet.findMany({
      where: {
        workoutExercise: {
          exerciseId: id,
          workout: { entry: { userId, deletedAt: null } },
        },
      },
      include: {
        workoutExercise: {
          include: { workout: { include: { entry: true } } },
        },
      },
      orderBy: { workoutExercise: { workout: { startedAt: 'desc' } } },
    });

    let heaviestWeight: number | null = null;
    let bestVolumeSet: number | null = null;
    let estimated1RM: number | null = null;
    let lastPerformedAt: Date | null = null;

    for (const s of exerciseSets) {
      const weight = s.weight ? Number(s.weight) : null;
      const reps = s.reps ?? null;
      const startedAt = s.workoutExercise?.workout?.startedAt || s.workoutExercise?.workout?.entry?.entryDate;

      if (startedAt && (!lastPerformedAt || startedAt > lastPerformedAt)) {
        lastPerformedAt = startedAt;
      }

      if (weight !== null) {
        if (heaviestWeight === null || weight > heaviestWeight) {
          heaviestWeight = weight;
        }
        if (reps !== null) {
          const vol = weight * reps;
          if (bestVolumeSet === null || vol > bestVolumeSet) {
            bestVolumeSet = vol;
          }
          // Epley formula for 1RM: weight * (1 + reps / 30)
          const e1RM = Math.round(weight * (1 + reps / 30) * 10) / 10;
          if (estimated1RM === null || e1RM > estimated1RM) {
            estimated1RM = e1RM;
          }
        }
      }
    }

    const recentSets = exerciseSets.slice(0, 10).map((s) => ({
      id: s.id,
      workoutExerciseId: s.workoutExerciseId,
      sortOrder: s.sortOrder,
      type: (s.type as WorkoutSetType) || 'NORMAL',
      reps: s.reps ?? null,
      weight: s.weight != null ? Number(s.weight) : null,
      durationSeconds: s.durationSeconds ?? null,
      distanceMeters: s.distanceMeters ?? null,
      rpe: s.rpe != null ? Number(s.rpe) : null,
      completedAt: s.completedAt || null,
    }));

    return {
      heaviestWeight,
      bestVolumeSet,
      estimated1RM,
      totalSets: exerciseSets.length,
      lastPerformedAt,
      recentSets,
    };
  }

  async getWorkouts(userId: string, options?: { status?: WorkoutStatus; limit?: number }): Promise<WorkoutDomain[]> {
    const where: any = {
      userId,
      kind: JournalEntryKind.WORKOUT,
      deletedAt: null,
    };

    if (options?.status) {
      where.workout = { status: options.status };
    }

    const entries = await this.prisma.journalEntry.findMany({
      where,
      include: {
        workout: {
          include: {
            exercises: {
              include: { exercise: true, sets: { orderBy: { sortOrder: 'asc' } } },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
      orderBy: { entryDate: 'desc' },
      take: options?.limit,
    });

    return entries.map((e) => this.mapWorkout(e.workout ? { ...e.workout, entry: e } : { entryId: e.id, entry: e, exercises: [] }));
  }

  async getWorkoutById(userId: string, id: string): Promise<WorkoutDomain | null> {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, userId, kind: JournalEntryKind.WORKOUT, deletedAt: null },
      include: {
        workout: {
          include: {
            exercises: {
              include: { exercise: true, sets: { orderBy: { sortOrder: 'asc' } } },
              orderBy: { sortOrder: 'asc' },
            },
          },
        },
      },
    });

    if (!entry) return null;
    return this.mapWorkout(entry.workout ? { ...entry.workout, entry } : { entryId: entry.id, entry, exercises: [] });
  }

  async createWorkout(userId: string, dto: CreateWorkoutDto): Promise<WorkoutDomain> {
    const entryId = createUlid();
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();

    const entry = await this.prisma.journalEntry.create({
      data: {
        id: entryId,
        userId,
        kind: JournalEntryKind.WORKOUT,
        title: dto.title || 'Workout',
        entryDate: startedAt,
        workout: {
          create: {
            title: dto.title || 'Workout',
            status: 'ACTIVE',
            startedAt,
          },
        },
      },
      include: {
        workout: {
          include: {
            exercises: {
              include: { exercise: true, sets: { orderBy: { sortOrder: 'asc' } } },
            },
          },
        },
      },
    });

    return this.mapWorkout({ ...entry.workout, entry });
  }

  async updateWorkout(userId: string, id: string, dto: UpdateWorkoutDto): Promise<WorkoutDomain> {
    const existing = await this.getWorkoutById(userId, id);
    if (!existing) {
      throw new Error(`Workout ${id} not found`);
    }

    const updateEntryData: any = {};
    const updateWorkoutData: any = {};

    if (dto.title !== undefined) {
      updateEntryData.title = dto.title;
      updateWorkoutData.title = dto.title;
    }
    if (dto.startedAt !== undefined) {
      updateEntryData.entryDate = new Date(dto.startedAt);
      updateWorkoutData.startedAt = new Date(dto.startedAt);
    }
    if (dto.endedAt !== undefined) updateWorkoutData.endedAt = new Date(dto.endedAt);
    if (dto.durationMinutes !== undefined) updateWorkoutData.durationMinutes = dto.durationMinutes;
    if (dto.status !== undefined) updateWorkoutData.status = dto.status;

    // Execute update inside a transaction to support exercises/sets replacement/upsert
    await this.prisma.$transaction(async (tx) => {
      await tx.journalEntry.update({
        where: { id },
        data: {
          ...updateEntryData,
          version: { increment: 1 },
          workout: {
            update: updateWorkoutData,
          },
        },
      });

      if (dto.exercises !== undefined) {
        // Simple replace/upsert exercise definitions
        const existingWorkout = await tx.journalWorkout.findUnique({
          where: { entryId: id },
          include: { exercises: true },
        });

        if (existingWorkout) {
          const currentExIds = existingWorkout.exercises.map((ex) => ex.id);
          const incomingExIds = dto.exercises.filter((ex) => ex.id).map((ex) => ex.id!);

          // Delete removed exercises
          const toDelete = currentExIds.filter((exId) => !incomingExIds.includes(exId));
          if (toDelete.length > 0) {
            await tx.journalWorkoutExercise.deleteMany({ where: { id: { in: toDelete } } });
          }

          for (let i = 0; i < dto.exercises.length; i++) {
            const exDto = dto.exercises[i];
            const exId = exDto.id || createUlid();

            await tx.journalWorkoutExercise.upsert({
              where: { id: exId },
              create: {
                id: exId,
                workoutEntryId: id,
                exerciseId: exDto.exerciseId,
                sortOrder: exDto.sortOrder ?? i,
                note: exDto.note || null,
                restSeconds: exDto.restSeconds || null,
              },
              update: {
                exerciseId: exDto.exerciseId,
                sortOrder: exDto.sortOrder ?? i,
                note: exDto.note || null,
                restSeconds: exDto.restSeconds || null,
              },
            });

            if (exDto.sets !== undefined) {
              const existingSets = await tx.journalWorkoutSet.findMany({
                where: { workoutExerciseId: exId },
              });
              const currentSetIds = existingSets.map((s) => s.id);
              const incomingSetIds = exDto.sets.filter((s) => s.id).map((s) => s.id!);

              const setsToDelete = currentSetIds.filter((sId) => !incomingSetIds.includes(sId));
              if (setsToDelete.length > 0) {
                await tx.journalWorkoutSet.deleteMany({ where: { id: { in: setsToDelete } } });
              }

              for (let sIdx = 0; sIdx < exDto.sets.length; sIdx++) {
                const setDto = exDto.sets[sIdx];
                const setUlid = setDto.id || createUlid();

                await tx.journalWorkoutSet.upsert({
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
                    completedAt: setDto.completedAt || new Date(),
                  },
                  update: {
                    sortOrder: setDto.sortOrder ?? sIdx,
                    type: (setDto.type as any) || 'NORMAL',
                    reps: setDto.reps ?? null,
                    weight: setDto.weight ?? null,
                    durationSeconds: setDto.durationSeconds ?? null,
                    distanceMeters: setDto.distanceMeters ?? null,
                    rpe: setDto.rpe ?? null,
                    completedAt: setDto.completedAt,
                  },
                });
              }
            }
          }
        }
      }
    });

    const updated = await this.getWorkoutById(userId, id);
    return updated!;
  }

  async deleteWorkout(userId: string, id: string): Promise<void> {
    await this.prisma.journalEntry.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async completeWorkout(userId: string, id: string): Promise<WorkoutDomain> {
    const workout = await this.getWorkoutById(userId, id);
    if (!workout) throw new Error(`Workout ${id} not found`);

    const endedAt = new Date();
    const startedAt = workout.startedAt ? new Date(workout.startedAt) : endedAt;
    const durationMinutes = Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000));

    return this.updateWorkout(userId, id, {
      status: 'COMPLETED',
      endedAt,
      durationMinutes,
    });
  }

  async abandonWorkout(userId: string, id: string): Promise<WorkoutDomain> {
    return this.updateWorkout(userId, id, {
      status: 'ABANDONED',
      endedAt: new Date(),
    });
  }

  async getOverview(userId: string): Promise<GymOverviewDomain> {
    const now = new Date();
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
    startOfWeek.setHours(0, 0, 0, 0);

    const weeklyWorkouts = await this.prisma.journalEntry.findMany({
      where: {
        userId,
        kind: JournalEntryKind.WORKOUT,
        deletedAt: null,
        entryDate: { gte: startOfWeek },
        workout: { status: 'COMPLETED' },
      },
      include: {
        workout: {
          include: {
            exercises: {
              include: { sets: true },
            },
          },
        },
      },
    });

    let totalSets = 0;
    let totalVolumeKg = 0;

    for (const entry of weeklyWorkouts) {
      const workout = entry.workout;
      if (!workout) continue;
      for (const ex of workout.exercises) {
        for (const s of ex.sets) {
          totalSets++;
          if (s.weight && s.reps) {
            totalVolumeKg += Number(s.weight) * s.reps;
          }
        }
      }
    }

    const recentWorkouts = await this.getWorkouts(userId, { limit: 5 });

    return {
      weeklyWorkoutsCount: weeklyWorkouts.length,
      weeklySetsCount: totalSets,
      weeklyVolumeKg: Math.round(totalVolumeKg),
      recentWorkouts,
    };
  }
}
