import { describe, expect, it, vi } from 'vitest';
import { createUsageApi } from './usageApi';

describe('usage API', () => {
  it('requests website statistics for the selected date range', async () => {
    const request = vi.fn().mockResolvedValue({
      from: '2026-08-01',
      to: '2026-08-09',
      totalActiveSeconds: 0,
      hostnames: [],
      topHostnames: [],
      urlDetails: [],
      daily: [],
      sessions: [],
    });
    const api = createUsageApi({
      request,
      stream: async () => new ReadableStream(),
      offlineMutation: async (_input, fallback) => fallback(),
    });

    await api.websiteUsageStatistics('2026-08-01', '2026-08-09');

    expect(request).toHaveBeenCalledWith('/usage/websites/statistics?from=2026-08-01&to=2026-08-09');
  });
});
