import { describe, expect, it, vi } from 'vitest';
import { createGymApi } from './gymApi';

function offlineApi() {
  const mutations: Array<Record<string, unknown>> = [];
  const api = createGymApi({
    request: vi.fn().mockResolvedValue({}),
    stream: async () => new ReadableStream(),
    offlineMutation: async (input) => {
      mutations.push(input as unknown as Record<string, unknown>);
      return input.optimistic;
    },
  });
  return { api, mutations };
}

describe('offline-first gym mutations', () => {
  it('uses IN_PROGRESS for the start path and COMPLETED with endedAt for direct completion', async () => {
    const { api, mutations } = offlineApi();

    await api.createGymWorkout();
    await api.createGymWorkout({ status: 'COMPLETED', endedAt: '2026-08-10T01:02:03.000Z' });

    expect(mutations[0]).toMatchObject({ kind: 'gymworkout.create', payload: {}, optimistic: { status: 'IN_PROGRESS' } });
    expect(mutations[1]).toMatchObject({
      kind: 'gymworkout.create',
      payload: { status: 'COMPLETED', endedAt: '2026-08-10T01:02:03.000Z' },
      optimistic: { status: 'COMPLETED', endedAt: '2026-08-10T01:02:03.000Z' },
    });
  });

  it('maps finish and abandon to the API-supported update/delete kinds', async () => {
    const { api, mutations } = offlineApi();

    await api.completeGymWorkout('workout-1');
    await api.abandonGymWorkout('workout-1');

    expect(mutations[0]).toMatchObject({ kind: 'gymworkout.update', payload: { status: 'COMPLETED' }, immediate: true });
    expect(mutations[0].payload).toHaveProperty('endedAt');
    expect(mutations[1]).toMatchObject({ kind: 'gymworkout.delete', entityId: 'workout-1', immediate: true });
  });
});
