import type { ApiClientContext } from './apiContext';
import { createUlid } from '../sync/syncIdentity';
import { SYNC_KINDS } from '../sync/syncKinds';

export type GymMetricType = 'WEIGHT_REPS' | 'REPS' | 'DURATION' | 'DISTANCE_DURATION';
export type GymWeightUnit = 'KG' | 'LBS';
export type GymSetType = 'WARM_UP' | 'NORMAL' | 'DROP' | 'FAILURE';

export interface GymVersionedPatch {
  version?: number;
  baseValues?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GymWorkoutCreate {
  title?: string;
}

export interface GymWorkoutExerciseCreate {
  workoutId: string;
  exerciseId: string;
  sortOrder?: number;
  note?: string | null;
  restSeconds?: number | null;
}

export interface GymWorkoutSetCreate {
  workoutExerciseId: string;
  sortOrder?: number;
  type?: GymSetType;
  reps?: number | null;
  weight?: number | null;
  durationSeconds?: number | null;
  distanceMeters?: number | null;
  rpe?: number | null;
  completedAt?: string | null;
}

export type GymApi = {
  getGymOverview(): Promise<any>;
  getGymAnalytics(range?: string): Promise<any>;
  getGymAnalyticsForPeriod(from: string, to: string): Promise<any>;
  getGymExercises(options?: { search?: string; muscle?: string; equipment?: string; favoriteOnly?: boolean }): Promise<any[]>;
  createGymExercise(data: {
    name: string;
    description?: string;
    metricType?: string;
    equipment?: string;
    primaryMuscleGroup?: string;
    secondaryMuscleGroups?: string[];
    defaultWeightUnit?: GymWeightUnit;
    defaultRestSeconds?: number;
    userNotes?: string;
    isFavorite?: boolean;
  }): Promise<any>;
  getGymExerciseById(id: string): Promise<any>;
  updateGymExercise(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      metricType: string;
      equipment: string;
      primaryMuscleGroup: string;
      secondaryMuscleGroups: string[];
      defaultWeightUnit: GymWeightUnit;
      defaultRestSeconds: number;
      userNotes: string | null;
      isFavorite: boolean;
      version: number;
    }>,
  ): Promise<any>;
  toggleFavoriteExercise(id: string): Promise<any>;
  archiveGymExercise(id: string): Promise<any>;
  uploadGymExerciseImage(id: string, file: File): Promise<any>;
  getGymExerciseStats(id: string): Promise<any>;
  getGymExerciseProgress(id: string, range?: string): Promise<any>;

  getGymRoutines(): Promise<any[]>;
  getGymRoutineById(id: string): Promise<any>;
  createGymRoutine(data: {
    name: string;
    description?: string;
    sortOrder?: number;
    exercises?: any[];
  }): Promise<any>;
  updateGymRoutine(
    id: string,
    data: Partial<{
      name: string;
      description: string;
      sortOrder: number;
      exercises: any[];
      version: number;
    }>,
  ): Promise<any>;
  deleteGymRoutine(id: string): Promise<any>;
  archiveGymRoutine(id: string): Promise<any>;
  startWorkoutFromRoutine(routineId: string): Promise<any>;
  createRoutineFromWorkout(workoutId: string, name?: string): Promise<any>;
  updateRoutineFromWorkout(routineId: string, workoutId: string): Promise<any>;

  getGymWorkouts(options?: { status?: string; limit?: number; from?: string; to?: string }): Promise<any[]>;
  getGymWorkoutById(id: string): Promise<any>;
  updateGymWorkout(
    id: string,
    data: Partial<{
      title: string;
      routineId: string | null;
      startedAt: string;
      endedAt: string;
      durationMinutes: number;
      status: string;
      exercises: any[];
    }>,
  ): Promise<any>;
  repeatWorkout(workoutId: string): Promise<any>;
  deleteGymWorkout(id: string): Promise<any>;
  abandonGymWorkout(id: string): Promise<any>;

  /** Granular logger API. Every mutation uses a stable client-generated ID. */
  createWorkout(data?: GymWorkoutCreate & { routineId?: string }): Promise<any>;
  updateWorkout(id: string, data: GymVersionedPatch): Promise<any>;
  createWorkoutExercise(data: GymWorkoutExerciseCreate): Promise<any>;
  updateWorkoutExercise(id: string, data: GymVersionedPatch): Promise<any>;
  deleteWorkoutExercise(id: string, version?: number): Promise<any>;
  createWorkoutSet(data: GymWorkoutSetCreate): Promise<any>;
  updateWorkoutSet(id: string, data: GymVersionedPatch): Promise<any>;
  completeWorkoutSet(id: string, completedAt?: string, version?: number): Promise<any>;
  deleteWorkoutSet(id: string, version?: number): Promise<any>;
  finishWorkout(id: string, data?: { endedAt?: string; durationMinutes?: number; version?: number }): Promise<any>;
  deleteWorkout(id: string, version?: number): Promise<any>;
};

function now(): string {
  return new Date().toISOString();
}

function editablePatch(data: GymVersionedPatch): {
  patch: Record<string, unknown>;
  version?: number;
  baseValues?: Record<string, unknown>;
  fieldEditedAt: Record<string, string>;
} {
  const { version, baseValues, ...patch } = data;
  const editedAt = now();
  return {
    patch,
    version,
    baseValues,
    fieldEditedAt: Object.fromEntries(Object.keys(patch).map((field) => [field, editedAt])),
  };
}

function granularInput<T>(
  kind: string,
  entityId: string,
  payload: Record<string, unknown>,
  optimistic: T,
  options: {
    version?: number;
    baseValues?: Record<string, unknown>;
    fieldEditedAt?: Record<string, string>;
    immediate?: boolean;
  } = {},
) {
  return {
    kind,
    entityId,
    payload,
    optimistic,
    baseVersion: options.version,
    baseValues: options.baseValues,
    fieldEditedAt: options.fieldEditedAt,
    immediate: options.immediate,
  };
}

export function createGymApi(ctx: ApiClientContext): GymApi {
  const requestJson = <T>(path: string, method: string, body: unknown) =>
    ctx.request<T>(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  return {
    getGymOverview: () => ctx.request('/gym/overview'),
    getGymAnalytics: (range = '3M') => ctx.request(`/gym/analytics?range=${encodeURIComponent(range)}`),
    getGymAnalyticsForPeriod: (from, to) => {
      const query = new URLSearchParams({ from, to });
      return ctx.request(`/gym/analytics?${query}`);
    },
    getGymExercises: (options) => {
      const params = new URLSearchParams();
      if (options?.search) params.set('search', options.search);
      if (options?.muscle) params.set('muscle', options.muscle);
      if (options?.equipment) params.set('equipment', options.equipment);
      if (options?.favoriteOnly) params.set('favoriteOnly', 'true');
      const query = params.toString() ? `?${params}` : '';
      return ctx.request(`/gym/exercises${query}`);
    },
    createGymExercise(data) {
      const id = createUlid();
      const optimistic = {
        id,
        ...data,
        metricType: data.metricType ?? 'WEIGHT_REPS',
        defaultWeightUnit: data.defaultWeightUnit ?? 'KG',
        secondaryMuscleGroups: data.secondaryMuscleGroups ?? [],
        isFavorite: Boolean(data.isFavorite),
        archivedAt: null,
        version: 1,
      };
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.exerciseDefinition.create, entityId: id, payload: data, optimistic },
        () => requestJson('/gym/exercises', 'POST', data),
      );
    },
    getGymExerciseById: (id) => ctx.request(`/gym/exercises/${id}`),
    updateGymExercise(id, data) {
      const { version, ...payload } = data;
      return ctx.offlineMutation(
        {
          kind: SYNC_KINDS.exerciseDefinition.update,
          entityId: id,
          payload,
          baseVersion: version,
          optimistic: { id, ...payload },
        },
        () => requestJson(`/gym/exercises/${id}`, 'PATCH', payload),
      );
    },
    toggleFavoriteExercise: (id) => requestJson(`/gym/exercises/${id}/favorite`, 'POST', {}),
    archiveGymExercise(id) {
      return ctx.offlineMutation(
        {
          kind: SYNC_KINDS.exerciseDefinition.delete,
          entityId: id,
          payload: {},
          immediate: true,
          optimistic: { id, archivedAt: now() },
        },
        () => ctx.request(`/gym/exercises/${id}`, { method: 'DELETE' }),
      );
    },
    uploadGymExerciseImage(id, file) {
      const formData = new FormData();
      formData.append('file', file);
      return ctx.request(`/gym/exercises/${id}/image`, { method: 'POST', body: formData });
    },
    getGymExerciseStats: (id) => ctx.request(`/gym/exercises/${id}/stats`),
    getGymExerciseProgress: (id, range = 'ALL') => ctx.request(`/gym/exercises/${id}/progress?range=${encodeURIComponent(range)}`),

    getGymRoutines: () => ctx.request('/gym/routines'),
    getGymRoutineById: (id) => ctx.request(`/gym/routines/${id}`),
    createGymRoutine(data) {
      const id = createUlid();
      const optimistic = {
        id,
        ...data,
        exercises: (data.exercises || []).map((ex: any, idx: number) => ({
          id: createUlid(),
          routineId: id,
          ...ex,
          sortOrder: ex.sortOrder ?? idx,
          version: 1,
        })),
        version: 1,
      };
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.gymRoutine.create, entityId: id, payload: data, optimistic },
        () => requestJson('/gym/routines', 'POST', { id, ...data }),
      );
    },
    updateGymRoutine(id, data) {
      const { version, ...payload } = data;
      return ctx.offlineMutation(
        {
          kind: SYNC_KINDS.gymRoutine.update,
          entityId: id,
          payload,
          baseVersion: version,
          optimistic: { id, ...payload },
        },
        () => requestJson(`/gym/routines/${id}`, 'PATCH', payload),
      );
    },
    deleteGymRoutine(id) {
      return ctx.offlineMutation(
        {
          kind: SYNC_KINDS.gymRoutine.delete,
          entityId: id,
          payload: {},
          immediate: true,
          optimistic: { id, deletedAt: now() },
        },
        () => ctx.request(`/gym/routines/${id}`, { method: 'DELETE' }),
      );
    },
    archiveGymRoutine(id) {
      return ctx.offlineMutation(
        {
          kind: SYNC_KINDS.gymRoutine.archive,
          entityId: id,
          payload: {},
          immediate: true,
          optimistic: { id, archivedAt: now() },
        },
        () => requestJson(`/gym/routines/${id}/archive`, 'POST', {}),
      );
    },
    startWorkoutFromRoutine: (routineId) => requestJson(`/gym/routines/${routineId}/start`, 'POST', {}),
    createRoutineFromWorkout: (workoutId, name) => requestJson('/gym/routines/create-from-workout', 'POST', { workoutId, name }),
    updateRoutineFromWorkout: (routineId, workoutId) => requestJson(`/gym/routines/${routineId}/update-from-workout`, 'POST', { workoutId }),

    getGymWorkouts(options) {
      const params = new URLSearchParams();
      if (options?.status) params.set('status', options.status);
      if (options?.limit) params.set('limit', String(options.limit));
      if (options?.from) params.set('from', options.from);
      if (options?.to) params.set('to', options.to);
      const query = params.toString() ? `?${params}` : '';
      return ctx.request(`/gym/workouts${query}`);
    },
    getGymWorkoutById: (id) => ctx.request(`/gym/workouts/${id}`),
    updateGymWorkout(id, data) {
      return ctx.offlineMutation(
        {
          kind: SYNC_KINDS.gymWorkout.update,
          entityId: id,
          payload: data,
          baseVersion: (data as { version?: number }).version,
          optimistic: { id, ...data },
        },
        () => requestJson(`/gym/workouts/${id}`, 'PATCH', data),
      );
    },
    repeatWorkout: (workoutId) => requestJson(`/gym/workouts/${workoutId}/repeat`, 'POST', {}),
    deleteGymWorkout(id) {
      return ctx.offlineMutation(
        {
          kind: SYNC_KINDS.gymWorkout.delete,
          entityId: id,
          payload: {},
          immediate: true,
          optimistic: { id, deletedAt: now() },
        },
        () => ctx.request(`/gym/workouts/${id}`, { method: 'DELETE' }),
      );
    },
    abandonGymWorkout(id) {
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.gymWorkout.delete, entityId: id, payload: {}, immediate: true, optimistic: undefined },
        () => ctx.request(`/gym/workouts/${id}/abandon`, { method: 'POST' }),
      );
    },

    createWorkout(data = {}) {
      const id = createUlid();
      const startedAt = now();
      const payload = { ...data, startedAt };
      const optimistic = { id, ...data, status: 'IN_PROGRESS', startedAt, endedAt: null, durationMinutes: null, exercises: [], version: 1 };
      return ctx.offlineMutation(granularInput(SYNC_KINDS.workout.create, id, payload, optimistic), () =>
        requestJson('/gym/workouts', 'POST', { title: data.title, id }),
      );
    },
    updateWorkout(id, data) {
      const { patch, version, baseValues, fieldEditedAt } = editablePatch(data);
      return ctx.offlineMutation(
        granularInput(SYNC_KINDS.workout.update, id, patch, { id, ...patch }, { version, baseValues, fieldEditedAt }),
        () => Promise.resolve({ id, ...patch }),
      );
    },
    createWorkoutExercise(data) {
      const id = createUlid();
      const optimistic = { id, ...data, version: 1, sets: [] };
      return ctx.offlineMutation(
        granularInput(SYNC_KINDS.workoutExercise.create, id, data as unknown as Record<string, unknown>, optimistic),
        () => Promise.resolve(optimistic),
      );
    },
    updateWorkoutExercise(id, data) {
      const { patch, version, baseValues, fieldEditedAt } = editablePatch(data);
      return ctx.offlineMutation(
        granularInput(
          SYNC_KINDS.workoutExercise.update,
          id,
          patch,
          { id, ...patch },
          { version, baseValues, fieldEditedAt },
        ),
        () => Promise.resolve({ id, ...patch }),
      );
    },
    deleteWorkoutExercise(id, version) {
      return ctx.offlineMutation(
        granularInput(
          SYNC_KINDS.workoutExercise.delete,
          id,
          {},
          { id, deletedAt: now() },
          { version, immediate: true },
        ),
        () => Promise.resolve({ id }),
      );
    },
    createWorkoutSet(data) {
      const id = createUlid();
      const payload = { ...data, type: (data.type as string) === 'WARMUP' ? 'WARM_UP' : (data.type ?? 'NORMAL') };
      const optimistic = { id, ...payload, version: 1 };
      return ctx.offlineMutation(
        granularInput(SYNC_KINDS.workoutSet.create, id, payload as unknown as Record<string, unknown>, optimistic),
        () => Promise.resolve(optimistic),
      );
    },
    updateWorkoutSet(id, data) {
      const { patch, version, baseValues, fieldEditedAt } = editablePatch(data);
      const normalizedPatch = (patch.type as string) === 'WARMUP' ? { ...patch, type: 'WARM_UP' } : patch;
      return ctx.offlineMutation(
        granularInput(
          SYNC_KINDS.workoutSet.update,
          id,
          normalizedPatch,
          { id, ...normalizedPatch },
          { version, baseValues, fieldEditedAt },
        ),
        () => Promise.resolve({ id, ...normalizedPatch }),
      );
    },
    completeWorkoutSet(id, completedAt = now(), version) {
      return ctx.offlineMutation(
        granularInput(
          SYNC_KINDS.workoutSet.complete,
          id,
          { completedAt },
          { id, completedAt },
          { version, immediate: true },
        ),
        () => Promise.resolve({ id, completedAt }),
      );
    },
    deleteWorkoutSet(id, version) {
      return ctx.offlineMutation(
        granularInput(SYNC_KINDS.workoutSet.delete, id, {}, { id, deletedAt: now() }, { version, immediate: true }),
        () => Promise.resolve({ id }),
      );
    },
    finishWorkout(id, data = {}) {
      const endedAt = data.endedAt ?? now();
      const payload = {
        endedAt,
        ...(data.durationMinutes === undefined ? {} : { durationMinutes: data.durationMinutes }),
      };
      return ctx.offlineMutation(
        granularInput(
          SYNC_KINDS.workout.finish,
          id,
          payload,
          { id, status: 'COMPLETED', ...payload },
          { version: data.version, immediate: true },
        ),
        () => Promise.resolve({ id, status: 'COMPLETED', ...payload }),
      );
    },
    deleteWorkout(id, version) {
      return ctx.offlineMutation(
        granularInput(SYNC_KINDS.workout.delete, id, {}, { id, deletedAt: now() }, { version, immediate: true }),
        () => Promise.resolve({ id }),
      );
    },
  };
}
