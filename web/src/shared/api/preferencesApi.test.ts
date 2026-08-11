import { describe, expect, it } from 'vitest';
import { createPreferencesApi } from './preferencesApi';

describe('usage preferences', () => {
  it('keeps tracking opt-in when the preferences request is unavailable', async () => {
    const api = createPreferencesApi({
      request: async () => {
        throw new Error('offline');
      },
      stream: async () => new ReadableStream(),
      offlineMutation: async (_input, fallback) => fallback(),
    });

    await expect(api.getPreferences()).resolves.toMatchObject({
      usage: { trackingEnabled: false, retentionDays: 90 },
    });
  });

  it('queues gym favorites through the existing preferences seam', async () => {
    let queued: Record<string, unknown> | undefined;
    const api = createPreferencesApi({
      request: async () => {
        throw new Error('offline');
      },
      stream: async () => new ReadableStream(),
      offlineMutation: async (input) => {
        queued = input as unknown as Record<string, unknown>;
        return input.optimistic;
      },
    });

    await expect(api.updateGymPreferences({ favoriteExerciseIds: ['exercise-1'] })).resolves.toMatchObject({
      favoriteExerciseIds: ['exercise-1'],
    });
    expect(queued).toMatchObject({ kind: 'gympreferences.update', payload: { favoriteExerciseIds: ['exercise-1'] } });
  });
});
