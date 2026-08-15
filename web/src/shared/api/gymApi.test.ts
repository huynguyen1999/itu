import { describe, expect, it, vi } from 'vitest';
import { createGymApi } from './gymApi';

function offlineApi() {
  const mutations: Array<Record<string, unknown>> = [];
  const request = vi.fn().mockResolvedValue({});
  const api = createGymApi({
    request,
    stream: async () => new ReadableStream(),
    offlineMutation: async (input) => {
      mutations.push(input as unknown as Record<string, unknown>);
      return input.optimistic;
    },
  });
  return { api, mutations, request };
}

describe('offline-first gym mutations', () => {
  it('requests analytics for an explicit date range', async () => {
    const { api, request } = offlineApi();

    await api.getGymAnalyticsForPeriod('2026-08-01', '2026-08-09');

    expect(request).toHaveBeenCalledWith('/gym/analytics?from=2026-08-01&to=2026-08-09');
  });

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
