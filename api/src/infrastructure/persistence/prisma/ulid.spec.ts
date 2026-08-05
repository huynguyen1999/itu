import { createUlid } from './ulid';

describe('createUlid', () => {
  it('creates a canonical 26-character Crockford Base32 ULID', () => {
    expect(createUlid()).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('preserves timestamp order in the encoded prefix', () => {
    const earlier = createUlid(new Date('2026-01-01T00:00:00.000Z'));
    const later = createUlid(new Date('2026-01-01T00:00:00.001Z'));

    expect(earlier.slice(0, 10).localeCompare(later.slice(0, 10))).toBeLessThan(0);
  });
});
