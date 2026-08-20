import { PrismaService } from './prisma.service';
import { ExerciseDomain, ExerciseMetricType, GymRoutineDomain, GymRoutineExerciseDomain, WeightUnit, WorkoutDomain, WorkoutSetType, WorkoutStatus } from '@core/domain/gym/gym.domain';

export class PrismaGymMappers {
  constructor(protected readonly prisma: PrismaService) {}

  protected mapExercise(e: any): ExerciseDomain {
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

  protected mapRoutineExercise(re: any): GymRoutineExerciseDomain {
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

  protected mapRoutine(r: any): GymRoutineDomain {
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

  protected mapWorkout(w: any): WorkoutDomain {
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
}
