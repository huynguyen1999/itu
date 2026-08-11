import { describe, expect, it, vi } from 'vitest';
import { createTrashApi } from './trashApi';

describe('trash API', () => {
  it('queues restores with the canonical sync kinds and direct routes', async () => {
    const mutations: Array<Record<string, unknown>> = [];
    const request = vi.fn().mockResolvedValue({});
    const api = createTrashApi({
      request,
      stream: async () => new ReadableStream(),
      offlineMutation: async (input) => {
        mutations.push(input as unknown as Record<string, unknown>);
        return input.optimistic;
      },
    });

    await api.restoreTrashJournalEntry('entry-1');
    await api.restoreTrashBudgetTransaction('transaction-1');
    await api.restoreTrashGymWorkout('workout-1');
    await api.restoreTrashGymExercise('exercise-1');

    expect(mutations.map((mutation) => mutation.kind)).toEqual([
      'journal.restore',
      'budgettransaction.restore',
      'gymworkout.restore',
      'exercisedefinition.restore',
    ]);
    expect(request).not.toHaveBeenCalled();
  });

  it('keeps permanent deletion as an explicit online action', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    const api = createTrashApi({ request, stream: async () => new ReadableStream(), offlineMutation: vi.fn() });

    await api.deleteTrashBudgetTransaction('transaction-1');

    expect(request).toHaveBeenCalledWith('/trash/budget-transactions/transaction-1', { method: 'DELETE' });
  });
});
