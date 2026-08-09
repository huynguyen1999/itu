import { describe, expect, it, vi } from 'vitest';
import { createUsageApi } from './usageApi';

describe('usage API', () => {
  it('requests website detail for the selected date range', async () => {
    const request = vi.fn().mockResolvedValue({ totalActiveSeconds: 0, topHostnames: [], urlDetails: [] });
    const api = createUsageApi({
      request,
      stream: async () => new ReadableStream(),
      offlineMutation: async (_input, fallback) => fallback(),
    });

    await api.websiteUsageSummaries('2026-08-01', '2026-08-09');

    expect(request).toHaveBeenCalledWith('/usage/websites/summaries?from=2026-08-01&to=2026-08-09');
  });
});
