import { normalizeCursorOptions, toCursorPage } from './cursor-pagination';

describe('cursor pagination', () => {
  it('clamps limits to the supported range', () => {
    expect(normalizeCursorOptions({ limit: 0 }).limit).toBe(1);
    expect(normalizeCursorOptions({ limit: 500 }).limit).toBe(500);
    expect(normalizeCursorOptions().limit).toBe(200);
  });

  it('returns the next cursor when more rows are available', () => {
    const page = toCursorPage(
      [
        { id: '3', createdAt: new Date('2026-01-03T00:00:00Z') },
        { id: '2', createdAt: new Date('2026-01-02T00:00:00Z') },
        { id: '1', createdAt: new Date('2026-01-01T00:00:00Z') },
      ],
      2,
      (item) => item.createdAt,
    );

    expect(page.data).toHaveLength(2);
    expect(page.meta.hasNextPage).toBe(true);
    expect(page.meta.nextCursor).toBeTruthy();
    expect(normalizeCursorOptions({ cursor: page.meta.nextCursor ?? undefined }).cursor).toEqual({
      id: '2',
      createdAt: new Date('2026-01-02T00:00:00Z'),
    });
  });
});
