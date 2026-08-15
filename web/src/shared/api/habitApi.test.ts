import { describe, expect, it, vi } from 'vitest';
import { createFocusProductivityApi } from './focusProductivityApi';

function offlineApi() {
  const mutations: Array<Record<string, unknown>> = [];
  const request = vi.fn().mockResolvedValue({});
  const api = createFocusProductivityApi({
    request,
    stream: async () => new ReadableStream(),
    offlineMutation: async (input) => {
      mutations.push(input as unknown as Record<string, unknown>);
      return input.optimistic;
    },
  });
  return { api, mutations, request };
}

describe('offline-first habit progress', () => {
  it('queues date progress through the sync mutation contract', async () => {
    const { api, mutations, request } = offlineApi();

    await api.progressHabit('habit-1', { localDate: '2026-08-15', value: 10, idempotencyKey: 'progress-1' });

    expect(mutations[0]).toMatchObject({
      kind: 'habitoccurrence.checkin',
      payload: { habitId: 'habit-1', localDate: '2026-08-15', value: 10, idempotencyKey: 'progress-1', source: 'MANUAL' },
      optimistic: { habitId: 'habit-1', localDate: '2026-08-15', value: 10 },
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('queues date actions with the sync server vocabulary', async () => {
    const { api, mutations } = offlineApi();

    await api.habitDateAction('habit-1', { localDate: '2026-08-15', action: 'UNDO', idempotencyKey: 'undo-1' });

    expect(mutations[0]).toMatchObject({
      kind: 'habitoccurrence.action',
      payload: { habitId: 'habit-1', localDate: '2026-08-15', action: 'undo', idempotencyKey: 'undo-1' },
      optimistic: { status: 'PENDING' },
    });
  });
});
