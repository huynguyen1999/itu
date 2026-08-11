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
  it('creates only an in-progress workout through the start path', async () => {
    const { api, mutations } = offlineApi();

    await api.createWorkout({ title: 'Morning' });

    expect(mutations[0]).toMatchObject({
      kind: 'workout.create',
      payload: { title: 'Morning', startedAt: expect.any(String) },
      optimistic: { status: 'IN_PROGRESS', endedAt: null },
    });
  });

  it('maps abandon to the API-supported delete kind', async () => {
    const { api, mutations } = offlineApi();

    await api.abandonGymWorkout('workout-1');

    expect(mutations[0]).toMatchObject({
      kind: 'gymworkout.delete',
      entityId: 'workout-1',
      immediate: true,
    });
  });

  it('queues a granular title patch with a field clock and base version', async () => {
    const { api, mutations } = offlineApi();

    await api.updateWorkout('workout-1', { title: 'Heavy day', version: 4, baseValues: { title: 'Workout' } });

    expect(mutations[0]).toMatchObject({
      kind: 'workout.update',
      entityId: 'workout-1',
      payload: { title: 'Heavy day' },
      baseVersion: 4,
      baseValues: { title: 'Workout' },
    });
    expect(mutations[0].fieldEditedAt).toEqual({ title: expect.any(String) });
  });
});
