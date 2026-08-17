import { ReviewContextBuilder, compareMetric, toPeriod } from './review-context.builder';

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

  it('makes weekly app and website comparisons citable evidence', async () => {
    const source = {
      loadPeriodData: jest
        .fn()
        .mockResolvedValueOnce({
          coverage: {},
          metrics: { appUsage: { activeSeconds: 600 }, websiteUsage: { activeSeconds: 300 } },
          details: {},
        })
        .mockResolvedValueOnce({
          coverage: {},
          metrics: { appUsage: { activeSeconds: 400 }, websiteUsage: { activeSeconds: 500 } },
          details: {},
        }),
    };

    const context = await new ReviewContextBuilder(source).build(
      'user-1',
      {
        kind: 'WEEKLY',
        startDate: '2026-08-10',
        endDate: '2026-08-16',
        timezone: 'Asia/Ho_Chi_Minh',
      },
      {},
    );

    expect(context.evidence).toEqual(
      expect.arrayContaining([
        { id: 'comparison.appUsage.active_seconds', source: 'APP', label: '600 vs 400 last week' },
        { id: 'comparison.websiteUsage.active_seconds', source: 'WEBSITE', label: '300 vs 500 last week' },
      ]),
    );
  });

  it('compares measured health totals without turning missing days into zero', async () => {
    const source = {
      loadPeriodData: jest
        .fn()
        .mockResolvedValueOnce({
          coverage: {},
          metrics: { health: { steps: 1000, exerciseMinutes: 30, workoutMinutes: 20 } },
          details: {},
        })
        .mockResolvedValueOnce({
          coverage: {},
          metrics: { health: { steps: null, exerciseMinutes: null, workoutMinutes: null } },
          details: {},
        }),
    };

    const context = await new ReviewContextBuilder(source).build(
      'user-1',
      {
        kind: 'WEEKLY',
        startDate: '2026-08-10',
        endDate: '2026-08-16',
        timezone: 'Asia/Ho_Chi_Minh',
      },
      {},
    );

    expect(context.evidence).toEqual(
      expect.arrayContaining([{ id: 'health.steps', source: 'HEALTH', label: '1000 steps this week' }]),
    );
    expect(context.evidence).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'comparison.health.steps' })]),
    );
  });
});
