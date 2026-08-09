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
});
