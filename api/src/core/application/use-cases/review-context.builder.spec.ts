import { compareMetric, toPeriod } from './review-context.builder';

describe('ReviewContextBuilder helpers', () => {
  it.each([
    [10, 5, 5, 100, 'UP'],
    [5, 10, -5, -50, 'DOWN'],
    [5, 0, 5, null, 'NEW'],
    [0, 0, 0, 0, 'UNCHANGED'],
  ])('compares %s against %s deterministically', (current, previous, absoluteDelta, percentDelta, direction) => {
    expect(compareMetric(current, previous)).toEqual({ current, previous, absoluteDelta, percentDelta, direction });
  });

  it('uses half-open HCMC and DST-aware UTC boundaries', () => {
    expect(toPeriod('2026-08-13', '2026-08-13', 'Asia/Ho_Chi_Minh')).toMatchObject({
      startInclusive: '2026-08-12T17:00:00.000Z',
      endExclusive: '2026-08-13T17:00:00.000Z',
    });
    expect(toPeriod('2026-03-08', '2026-03-08', 'America/New_York')).toMatchObject({
      startInclusive: '2026-03-08T05:00:00.000Z',
      endExclusive: '2026-03-09T04:00:00.000Z',
    });
  });
});
