import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from './httpClient';

describe('HttpClient error responses', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves structured sync error details for targeted queue recovery', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            statusCode: 400,
            code: 'INVALID_SYNC_MUTATION',
            message: 'Mutation ID was reused with a different operation',
            details: {
              reason: 'MUTATION_ID_REUSED',
              mutationId: 'mutation-1',
            },
          }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          },
        ),
      ),
    );

    const request = new HttpClient().request('/sync');

    await expect(request).rejects.toMatchObject({
      status: 400,
      code: 'INVALID_SYNC_MUTATION',
      details: {
        reason: 'MUTATION_ID_REUSED',
        mutationId: 'mutation-1',
      },
    });
  });
});
