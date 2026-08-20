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
import { PrismaGymMappers } from './prisma-gym-mappers';

export class PrismaGymExercises extends PrismaGymMappers {
  async ensureCatalogExercises(userId: string): Promise<void> {
    const existingBuiltInCount = await this.prisma.exerciseDefinition.count({
      where: { userId, origin: 'BUILT_IN', deletedAt: null },
    });

    if (existingBuiltInCount >= BUILT_IN_EXERCISE_CATALOG.length) {
      return;
    }

    const existingExercises = await this.prisma.exerciseDefinition.findMany({
      where: { userId },
      select: { normalizedName: true, catalogKey: true },
    });
    const existingKeys = new Set(existingExercises.map((e) => e.catalogKey).filter(Boolean));
    const existingNames = new Set(existingExercises.map((e) => e.normalizedName));

    const toCreate = BUILT_IN_EXERCISE_CATALOG.filter(
      (cat) => !existingKeys.has(cat.catalogKey) && !existingNames.has(cat.name.trim().toLowerCase()),
    );

    if (toCreate.length === 0) return;

    await this.prisma.$transaction(async (tx) => {
      for (const cat of toCreate) {
        const id = createUlid();
        await tx.exerciseDefinition.create({
          data: {
            id,
            userId,
            name: cat.name,
            normalizedName: cat.name.trim().toLowerCase(),
            description: cat.description || null,
            metricType: cat.metricType as any,
            equipment: cat.equipment,
            primaryMuscleGroup: cat.primaryMuscleGroup,
            secondaryMuscleGroups: cat.secondaryMuscleGroups,
            defaultWeightUnit: cat.defaultWeightUnit as any,
            defaultRestSeconds: cat.defaultRestSeconds,
            origin: 'BUILT_IN',
            catalogKey: cat.catalogKey,
            catalogVersion: 1,
            isFavorite: false,
          },
        });
      }
    });
  }

  async getExercises(
    userId: string,
    options?: { search?: string; muscle?: string; equipment?: string; favoriteOnly?: boolean },
  ): Promise<ExerciseDomain[]> {
    await this.ensureCatalogExercises(userId);

    const where: any = { userId, archivedAt: null, deletedAt: null };
    if (options?.favoriteOnly) {
      where.isFavorite = true;
    }
    if (options?.muscle && options.muscle !== 'All') {
      where.primaryMuscleGroup = { equals: options.muscle, mode: 'insensitive' };
    }
    if (options?.equipment && options.equipment !== 'All') {
      where.equipment = { equals: options.equipment, mode: 'insensitive' };
    }
    if (options?.search && options.search.trim()) {
      const q = options.search.trim();
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { primaryMuscleGroup: { contains: q, mode: 'insensitive' } },
      ];
    }

    const exercises = await this.prisma.exerciseDefinition.findMany({
      where,
      orderBy: [{ isFavorite: 'desc' }, { name: 'asc' }],
    });
    return exercises.map((e) => this.mapExercise(e));
  }

  async getExerciseById(userId: string, id: string): Promise<ExerciseDomain | null> {
    const ex = await this.prisma.exerciseDefinition.findFirst({
      where: { id, userId, archivedAt: null, deletedAt: null },
    });
    return ex ? this.mapExercise(ex) : null;
  }

  async createExercise(userId: string, dto: CreateExerciseDto): Promise<ExerciseDomain> {
    const normalizedName = dto.name.trim().toLowerCase();
    const id = createUlid();
    const ex = await this.prisma.exerciseDefinition.create({
      data: {
        id,
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
        origin: 'CUSTOM',
        userNotes: dto.userNotes || null,
        isFavorite: Boolean(dto.isFavorite),
      },
    });
    await this.prisma.$transaction(async (tx) => {
      await recordSyncChange(tx, userId, 'exercisedefinition', ex.id, 'UPSERT', ex);
    });
    return this.mapExercise(ex);
  }

  async updateExercise(userId: string, id: string, dto: UpdateExerciseDto): Promise<ExerciseDomain> {
    const existing = await this.prisma.exerciseDefinition.findFirst({ where: { id, userId, archivedAt: null, deletedAt: null } });
    if (!existing) {
      throw new Error(`Exercise ${id} not found`);
    }

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
    if (dto.userNotes !== undefined) data.userNotes = dto.userNotes;
    if (dto.isFavorite !== undefined) data.isFavorite = dto.isFavorite;

    const ex = await this.prisma.exerciseDefinition.update({
      where: { id },
      data: {
        ...data,
        version: { increment: 1 },
      },
    });
    await this.prisma.$transaction(async (tx) => {
      await recordSyncChange(tx, userId, 'exercisedefinition', ex.id, 'UPSERT', ex);
    });
    return this.mapExercise(ex);
  }

  async toggleFavoriteExercise(userId: string, id: string): Promise<ExerciseDomain> {
    const existing = await this.prisma.exerciseDefinition.findFirst({ where: { id, userId, archivedAt: null, deletedAt: null } });
    if (!existing) throw new Error(`Exercise ${id} not found`);
    const ex = await this.prisma.exerciseDefinition.update({
      where: { id },
      data: { isFavorite: !existing.isFavorite, version: { increment: 1 } },
    });
    await this.prisma.$transaction(async (tx) => {
      await recordSyncChange(tx, userId, 'exercisedefinition', ex.id, 'UPSERT', ex);
    });
    return this.mapExercise(ex);
  }

  async archiveExercise(userId: string, id: string): Promise<ExerciseDomain> {
    const existing = await this.prisma.exerciseDefinition.findFirst({ where: { id, userId, archivedAt: null, deletedAt: null } });
    if (!existing) {
      throw new Error(`Exercise ${id} not found`);
    }

    const ex = await this.prisma.exerciseDefinition.update({
      where: { id },
      data: { archivedAt: new Date(), version: { increment: 1 } },
    });
    await this.prisma.$transaction(async (tx) => {
      await recordSyncChange(tx, userId, 'exercisedefinition', ex.id, 'DELETE', { id: ex.id });
    });
    return this.mapExercise(ex);
  }

  async updateExerciseImage(userId: string, id: string, storageKey: string, url: string): Promise<ExerciseDomain> {
    const existing = await this.prisma.exerciseDefinition.findFirst({ where: { id, userId, deletedAt: null } });
    if (!existing) {
      throw new Error(`Exercise ${id} not found`);
    }

    const ex = await this.prisma.exerciseDefinition.update({
      where: { id },
      data: { imageStorageKey: storageKey, imageUrl: url, version: { increment: 1 } },
    });
    return this.mapExercise(ex);
  }

  async deleteExerciseImage(userId: string, id: string): Promise<ExerciseDomain> {
    const existing = await this.prisma.exerciseDefinition.findFirst({ where: { id, userId, deletedAt: null } });
    if (!existing) {
      throw new Error(`Exercise ${id} not found`);
    }

    const ex = await this.prisma.exerciseDefinition.update({
      where: { id },
      data: { imageStorageKey: null, imageUrl: null, version: { increment: 1 } },
    });
    return this.mapExercise(ex);
  }

  async getExerciseStats(userId: string, id: string): Promise<ExerciseStatsDomain> {
    const progress = await this.getExerciseProgress(userId, id, 'ALL');
    return {
      heaviestWeight: progress.records.heaviestWeight,
      bestVolumeSet: progress.records.bestSetVolume,
      estimated1RM: progress.records.estimated1RM,
      totalSets: progress.records.totalCompletedSets,
      lastPerformedAt: progress.records.lastTrained,
      recentSets: progress.recentSets.slice(0, 10),
    };
  }

  async getExerciseProgress(
    userId: string,
    id: string,
    range: '1M' | '3M' | '6M' | '1Y' | 'ALL' = 'ALL',
  ): Promise<GymExerciseProgressDomain> {
    const exercise = await this.prisma.exerciseDefinition.findFirst({
      where: { id, userId, archivedAt: null, deletedAt: null },
    });
    if (!exercise) throw new Error(`Exercise ${id} not found`);

    const exerciseSets = await this.prisma.gymWorkoutSet.findMany({
      where: {
        workoutExercise: {
          exerciseId: id,
          deletedAt: null,
          workout: { userId, deletedAt: null, status: PrismaGymWorkoutStatus.COMPLETED },
        },
        completedAt: { not: null },
        deletedAt: null,
      },
      include: {
        workoutExercise: {
          include: { workout: true },
        },
      },
      orderBy: { workoutExercise: { workout: { startedAt: 'desc' } } },
    });

    const mappedSets: WorkoutSetDomain[] = exerciseSets.map((s) => ({
      id: s.id,
      workoutExerciseId: s.workoutExerciseId,
      workoutId: s.workoutExercise?.workout?.id,
      workoutTitle: s.workoutExercise?.workout?.title || null,
      performedAt: s.completedAt || s.workoutExercise?.workout?.startedAt || s.workoutExercise?.workout?.createdAt || null,
      sortOrder: s.sortOrder,
      type: (s.type as WorkoutSetType) || 'NORMAL',
      reps: s.reps ?? null,
      weight: s.weight != null ? Number(s.weight) : null,
      durationSeconds: s.durationSeconds ?? null,
      distanceMeters: s.distanceMeters ?? null,
      rpe: s.rpe != null ? Number(s.rpe) : null,
      completedAt: s.completedAt || null,
      version: s.version ?? 1,
      deletedAt: s.deletedAt || null,
    }));

    return buildExerciseProgress(this.mapExercise(exercise), mappedSets, range, new Date());
  }

}
