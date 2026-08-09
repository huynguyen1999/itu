import type { ApiClientContext } from './apiContext';
import { createUlid } from '../sync/syncIdentity';
import { SYNC_KINDS } from '../sync/syncKinds';

export type GymApi = {
  getGymOverview(): Promise<any>;
  getGymExercises(): Promise<any[]>;
  createGymExercise(data: { name: string; description?: string; metricType?: string; equipment?: string; primaryMuscleGroup?: string; secondaryMuscleGroups?: string[]; defaultWeightUnit?: 'KG' | 'LBS'; defaultRestSeconds?: number }): Promise<any>;
  getGymExerciseById(id: string): Promise<any>;
  updateGymExercise(id: string, data: Partial<{ name: string; description: string; metricType: string; equipment: string; primaryMuscleGroup: string; secondaryMuscleGroups: string[]; defaultWeightUnit: 'KG' | 'LBS'; defaultRestSeconds: number; version: number }>): Promise<any>;
  archiveGymExercise(id: string): Promise<any>;
  uploadGymExerciseImage(id: string, file: File): Promise<any>;
  getGymExerciseStats(id: string): Promise<any>;
  getGymWorkouts(options?: { status?: string; limit?: number }): Promise<any[]>;
  createGymWorkout(data?: { title?: string; startedAt?: string; endedAt?: string; status?: 'IN_PROGRESS' | 'ACTIVE' | 'COMPLETED'; exercises?: any[] }): Promise<any>;
  getGymWorkoutById(id: string): Promise<any>;
  updateGymWorkout(id: string, data: Partial<{ title: string; startedAt: string; endedAt: string; status: 'IN_PROGRESS' | 'ACTIVE' | 'COMPLETED'; exercises: any[] }>): Promise<any>;
  deleteGymWorkout(id: string): Promise<any>;
  completeGymWorkout(id: string): Promise<any>;
  abandonGymWorkout(id: string): Promise<any>;
};

export function createGymApi(ctx: ApiClientContext): GymApi {
  return {
    getGymOverview() {
      return ctx.request('/gym/overview');
    },
    getGymExercises() {
      return ctx.request('/gym/exercises');
    },
    createGymExercise(data) {
      const id = createUlid();
      const optimistic = {
        id,
        ...data,
        metricType: data.metricType ?? 'WEIGHT_REPS',
        defaultWeightUnit: data.defaultWeightUnit ?? 'KG',
        secondaryMuscleGroups: data.secondaryMuscleGroups ?? [],
        archivedAt: null,
        version: 1,
      };
      return ctx.offlineMutation({ kind: SYNC_KINDS.exerciseDefinition.create, entityId: id, payload: data, optimistic }, () =>
        ctx.request('/gym/exercises', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }),
      );
    },
    getGymExerciseById(id) {
      return ctx.request(`/gym/exercises/${id}`);
    },
    updateGymExercise(id, data) {
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.exerciseDefinition.update, entityId: id, payload: data, baseVersion: data.version, optimistic: { id, ...data } },
        () =>
          ctx.request(`/gym/exercises/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          }),
      );
    },
    archiveGymExercise(id) {
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.exerciseDefinition.delete, entityId: id, payload: {}, immediate: true, optimistic: { id, archivedAt: new Date().toISOString() } },
        () => ctx.request(`/gym/exercises/${id}`, { method: 'DELETE' }),
      );
    },
    uploadGymExerciseImage(id, file) {
      const formData = new FormData();
      formData.append('file', file);
      return ctx.request(`/gym/exercises/${id}/image`, {
        method: 'POST',
        body: formData,
      });
    },
    getGymExerciseStats(id) {
      return ctx.request(`/gym/exercises/${id}/stats`);
    },
    getGymWorkouts(options) {
      const params = new URLSearchParams();
      if (options?.status) params.append('status', options.status);
      if (options?.limit) params.append('limit', String(options.limit));
      const q = params.toString() ? `?${params.toString()}` : '';
      return ctx.request(`/gym/workouts${q}`);
    },
    createGymWorkout(data) {
      const id = createUlid();
      const payload = data || {};
      // The API persists an active workout as IN_PROGRESS. Keep ACTIVE as a
      // read-time compatibility alias, but never create one over the wire.
      const status = payload.status === 'COMPLETED' ? 'COMPLETED' : 'IN_PROGRESS';
      const optimistic = {
        id,
        ...payload,
        status,
        startedAt: payload.startedAt ?? new Date().toISOString(),
        endedAt: payload.endedAt ?? (status === 'COMPLETED' ? new Date().toISOString() : null),
        exercises: payload.exercises ?? [],
        version: 1,
      };
      return ctx.offlineMutation({ kind: SYNC_KINDS.gymWorkout.create, entityId: id, payload, optimistic }, () =>
        ctx.request('/gym/workouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data || {}),
        }),
      );
    },
    getGymWorkoutById(id) {
      return ctx.request(`/gym/workouts/${id}`);
    },
    updateGymWorkout(id, data) {
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.gymWorkout.update, entityId: id, payload: data, baseVersion: (data as { version?: number }).version, optimistic: { id, ...data } },
        () =>
          ctx.request(`/gym/workouts/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          }),
      );
    },
    deleteGymWorkout(id) {
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.gymWorkout.delete, entityId: id, payload: {}, immediate: true, optimistic: { id, deletedAt: new Date().toISOString() } },
        () => ctx.request(`/gym/workouts/${id}`, { method: 'DELETE' }),
      );
    },
    completeGymWorkout(id) {
      const endedAt = new Date().toISOString();
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.gymWorkout.update, entityId: id, payload: { status: 'COMPLETED', endedAt }, immediate: true, optimistic: { id, status: 'COMPLETED', endedAt } },
        () => ctx.request(`/gym/workouts/${id}/complete`, { method: 'POST' }),
      );
    },
    abandonGymWorkout(id) {
      return ctx.offlineMutation(
        { kind: SYNC_KINDS.gymWorkout.delete, entityId: id, payload: {}, immediate: true, optimistic: undefined },
        () => ctx.request(`/gym/workouts/${id}/abandon`, { method: 'POST' }),
      );
    },
  };
}
