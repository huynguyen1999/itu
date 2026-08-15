import type { ApiClientContext } from './apiContext';
import { SYNC_KINDS } from '../sync/syncKinds';
import type {
  TrashExpense,
  TrashExerciseDefinition,
  TrashGymWorkout,
  TrashJournalEntry,
  TrashSnapshot,
} from './types';

export type TrashApi = {
  trash(): Promise<TrashSnapshot>;
  restoreTrashJournalEntry(id: string): Promise<TrashJournalEntry>;
  restoreTrashExpense(id: string): Promise<TrashExpense>;
  restoreTrashGymWorkout(id: string): Promise<TrashGymWorkout>;
  restoreTrashGymExercise(id: string): Promise<TrashExerciseDefinition>;
  deleteTrashJournalEntry(id: string): Promise<{ ok: true }>;
  deleteTrashExpense(id: string): Promise<{ ok: true }>;
  deleteTrashGymWorkout(id: string): Promise<{ ok: true }>;
  deleteTrashGymExercise(id: string): Promise<{ ok: true }>;
};

export function createTrashApi(ctx: ApiClientContext): TrashApi {
  return {
    trash() {
      return ctx.request<TrashSnapshot>('/trash');
    },
    restoreTrashJournalEntry(id) {
      return ctx.offlineMutation(
        {
          kind: SYNC_KINDS.journal.restore,
          entityId: id,
          payload: {},
          immediate: true,
          optimistic: { id } as TrashJournalEntry,
        },
        () => ctx.request<TrashJournalEntry>(`/trash/journal-entries/${id}/restore`, { method: 'POST' }),
      );
    },
    restoreTrashExpense(id) {
      return ctx.offlineMutation(
        {
          kind: SYNC_KINDS.expense.restore,
          entityId: id,
          payload: {},
          immediate: true,
          optimistic: { id } as TrashExpense,
        },
        () => ctx.request<TrashExpense>(`/trash/expenses/${id}/restore`, { method: 'POST' }),
      );
    },
    restoreTrashGymWorkout(id) {
      return ctx.offlineMutation(
        {
          kind: SYNC_KINDS.gymWorkout.restore,
          entityId: id,
          payload: {},
          immediate: true,
          optimistic: { id } as TrashGymWorkout,
        },
        () => ctx.request<TrashGymWorkout>(`/trash/gym-workouts/${id}/restore`, { method: 'POST' }),
      );
    },
    restoreTrashGymExercise(id) {
      return ctx.offlineMutation(
        {
          kind: SYNC_KINDS.exerciseDefinition.restore,
          entityId: id,
          payload: {},
          immediate: true,
          optimistic: { id } as TrashExerciseDefinition,
        },
        () => ctx.request<TrashExerciseDefinition>(`/trash/gym-exercises/${id}/restore`, { method: 'POST' }),
      );
    },
    deleteTrashJournalEntry(id) {
      return ctx.request<{ ok: true }>(`/trash/journal-entries/${id}`, { method: 'DELETE' });
    },
    deleteTrashExpense(id) {
      return ctx.request<{ ok: true }>(`/trash/expenses/${id}`, { method: 'DELETE' });
    },
    deleteTrashGymWorkout(id) {
      return ctx.request<{ ok: true }>(`/trash/gym-workouts/${id}`, { method: 'DELETE' });
    },
    deleteTrashGymExercise(id) {
      return ctx.request<{ ok: true }>(`/trash/gym-exercises/${id}`, { method: 'DELETE' });
    },
  };
}
