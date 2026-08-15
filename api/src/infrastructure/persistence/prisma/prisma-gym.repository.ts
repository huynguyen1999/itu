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
      origin: (e.origin === 'BUILT_IN' ? 'BUILT_IN' : 'CUSTOM'),
      catalogKey: e.catalogKey || null,
      catalogVersion: e.catalogVersion ?? null,
      userNotes: e.userNotes || null,
      isFavorite: Boolean(e.isFavorite),
      archivedAt: e.archivedAt || null,
      deletedAt: e.deletedAt || null,
      deletedByDeviceId: e.deletedByDeviceId || null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
      version: e.version ?? 1,
    };
  }

  private mapRoutineExercise(re: any): GymRoutineExerciseDomain {
    return {
      id: re.id,
      routineId: re.routineId,
      exerciseId: re.exerciseId,
      sortOrder: re.sortOrder ?? 0,
      setCount: re.setCount ?? 3,
      targetRepsMin: re.targetRepsMin ?? null,
      targetRepsMax: re.targetRepsMax ?? null,
      targetDurationSeconds: re.targetDurationSeconds ?? null,
      targetDistanceMeters: re.targetDistanceMeters ?? null,
      restSeconds: re.restSeconds ?? null,
      note: re.note ?? null,
      version: re.version ?? 1,
      deletedAt: re.deletedAt || null,
      deletedByDeviceId: re.deletedByDeviceId || null,
      createdAt: re.createdAt,
      updatedAt: re.updatedAt,
      exercise: re.exercise ? this.mapExercise(re.exercise) : undefined,
    };
  }

  private mapRoutine(r: any): GymRoutineDomain {
    return {
      id: r.id,
      userId: r.userId,
      name: r.name,
      description: r.description || null,
      sortOrder: r.sortOrder ?? 0,
      archivedAt: r.archivedAt || null,
      deletedAt: r.deletedAt || null,
      deletedByDeviceId: r.deletedByDeviceId || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      version: r.version ?? 1,
      exercises: (r.exercises || []).map((re: any) => this.mapRoutineExercise(re)),
    };
  }

  private mapWorkout(w: any): WorkoutDomain {
    return {
      id: w.id,
      userId: w.userId,
      routineId: w.routineId || null,
      title: w.title || 'Workout',
      status: (w.status === 'IN_PROGRESS' ? 'IN_PROGRESS' : 'COMPLETED') as WorkoutStatus,
      startedAt: w.startedAt || w.createdAt,
      endedAt: w.endedAt || null,
      durationMinutes: w.durationMinutes || null,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
      version: w.version ?? 1,
      deletedAt: w.deletedAt || null,
      deletedByDeviceId: w.deletedByDeviceId || null,
      exercises: (w.exercises || []).map((ex: any) => ({
        id: ex.id,
        workoutId: ex.workoutId,
        workoutEntryId: ex.workoutId,
        exerciseId: ex.exerciseId,
        exerciseName: ex.exerciseName || ex.exercise?.name || 'Exercise',
        metricType: ex.metricType || ex.exercise?.metricType || 'WEIGHT_REPS',
        weightUnit: ex.weightUnit || ex.exercise?.defaultWeightUnit || 'KG',
        sortOrder: ex.sortOrder ?? 0,
        note: ex.note || null,
        restSeconds: ex.restSeconds || null,
        version: ex.version ?? 1,
        deletedAt: ex.deletedAt || null,
        exercise: ex.exercise ? this.mapExercise(ex.exercise) : undefined,
        sets: (ex.sets || []).map((s: any) => ({
          id: s.id,
          workoutExerciseId: s.workoutExerciseId,
          sortOrder: s.sortOrder ?? 0,
          type: (s.type as WorkoutSetType) || 'NORMAL',
          reps: s.reps ?? null,
          weight: s.weight != null ? Number(s.weight) : null,
          durationSeconds: s.durationSeconds ?? null,
          distanceMeters: s.distanceMeters ?? null,
          rpe: s.rpe != null ? Number(s.rpe) : null,
          completedAt: s.completedAt || null,
          version: s.version ?? 1,
          deletedAt: s.deletedAt || null,
        })),
      })),
    };
  }

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
