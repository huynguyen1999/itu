import { describe, expect, it } from 'vitest';
import { createUlid } from './syncIdentity';

describe('createUlid', () => {
  it('creates sortable client IDs accepted by the sync API', () => {
    const first = createUlid(1_000);
    const second = createUlid(2_000);

    expect(first).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(second).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    expect(first < second).toBe(true);
  });
});
