import type { ApiClientContext } from './apiContext';

export type GymApi = {
  getGymOverview(): Promise<any>;
  getGymExercises(): Promise<any[]>;
  createGymExercise(data: { name: string; description?: string; metricType?: string; equipment?: string; primaryMuscleGroup?: string }): Promise<any>;
  getGymExerciseById(id: string): Promise<any>;
  updateGymExercise(id: string, data: Partial<{ name: string; description: string; metricType: string; equipment: string; primaryMuscleGroup: string }>): Promise<any>;
  archiveGymExercise(id: string): Promise<any>;
  uploadGymExerciseImage(id: string, file: File): Promise<any>;
  getGymExerciseStats(id: string): Promise<any>;
  getGymWorkouts(options?: { status?: string; limit?: number }): Promise<any[]>;
  createGymWorkout(data?: { title?: string; startedAt?: string }): Promise<any>;
  getGymWorkoutById(id: string): Promise<any>;
  updateGymWorkout(id: string, data: Partial<{ title: string; startedAt: string; endedAt: string; exercises: any[] }>): Promise<any>;
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
      return ctx.request('/gym/exercises', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    getGymExerciseById(id) {
      return ctx.request(`/gym/exercises/${id}`);
    },
    updateGymExercise(id, data) {
      return ctx.request(`/gym/exercises/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    archiveGymExercise(id) {
      return ctx.request(`/gym/exercises/${id}`, { method: 'DELETE' });
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
      return ctx.request('/gym/workouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data || {}),
      });
    },
    getGymWorkoutById(id) {
      return ctx.request(`/gym/workouts/${id}`);
    },
    updateGymWorkout(id, data) {
      return ctx.request(`/gym/workouts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    },
    deleteGymWorkout(id) {
      return ctx.request(`/gym/workouts/${id}`, { method: 'DELETE' });
    },
    completeGymWorkout(id) {
      return ctx.request(`/gym/workouts/${id}/complete`, { method: 'POST' });
    },
    abandonGymWorkout(id) {
      return ctx.request(`/gym/workouts/${id}/abandon`, { method: 'POST' });
    },
  };
}
