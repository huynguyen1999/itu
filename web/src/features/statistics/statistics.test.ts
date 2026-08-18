import { describe, expect, it } from 'vitest';
import type { GrowthSkill, GrowthStatistics, StudyCalendarDay } from '@/shared/api/types';
import type { WebsiteActivitySession, WebsiteUsageSummary } from '@/shared/api/usageApi';
import {
  getStoredStatisticsSettings,
  saveStoredStatisticsSettings,
  DEFAULT_STATISTICS_DISPLAY_SETTINGS,
} from './StatisticsSettingsPopover';
import {
  buildTrendData,
  buildUsageStackData,
  buildUsageTrendData,
  addDateKey,
  dateRangeForDays,
  engagementPercent,
  filterActivityRange,
  inclusiveDayCount,
  selectTopAttributes,
  selectTopUsageApps,
  selectWebsiteUsageSlices,
  statisticsDateTimeRange,
  statisticsPeriod,
  summarizeActivity,
  filterWebsiteSessions,
  websiteDomains,
  websiteUrls,
} from './statistics';
import { statisticsQueryKeys } from './statisticsQueries';

function skill(overrides: Partial<GrowthSkill>): GrowthSkill {
  return {
    id: 'skill-1',
    name: 'Strength',
    kind: 'ATTRIBUTE',
    description: '',
    icon: 'star',
    color: '#fff',
    sortOrder: 0,
    starterKey: null,
    cycleId: 'cycle-1',
    archivedAt: null,
    version: 1,
    level: 1,
    currentXp: 0,
    levelStartXp: 0,
    nextLevelXp: 100,
    progressXp: 0,
    requiredXp: 100,
    baseXp: 0,
    ...overrides,
  };
}

describe('statistics helpers', () => {
  const websiteSummary: WebsiteUsageSummary = {
    from: '2026-08-01',
    to: '2026-08-01',
    totalActiveSeconds: 180,
    hostnames: [{ hostname: 'docs.example.com', activeSeconds: 180 }],
    topHostnames: [{ hostname: 'docs.example.com', activeSeconds: 180 }],
    urlDetails: [
      {
        url: 'https://docs.example.com/guide',
        hostname: 'docs.example.com',
        activeSeconds: 120,
        latestTitle: 'Guide',
        iconUrl: 'https://docs.example.com/favicon.png',
        isPrivate: false,
      },
      {
        url: 'https://docs.example.com/private',
        hostname: 'docs.example.com',
        activeSeconds: 60,
        latestTitle: null,
        isPrivate: true,
      },
    ],
    daily: [{ localDate: '2026-08-01', activeSeconds: 180 }],
    sessions: [],
  };

  const websiteSessions: WebsiteActivitySession[] = [
    {
      id: 'normal-1',
      installationId: 'installation-1',
      browserBundleId: 'browser',
      browserDisplayName: 'Browser',
      startedAt: '2026-08-01T09:00:00.000Z',
      endedAt: '2026-08-01T09:02:00.000Z',
      activeSeconds: 120,
      hostname: 'docs.example.com',
      url: 'https://docs.example.com/guide',
      pageTitle: 'Guide',
      isPrivate: false,
      timezone: 'Asia/Ho_Chi_Minh',
      createdAt: '2026-08-01T09:02:00.000Z',
    },
    {
      id: 'private-1',
      installationId: 'installation-1',
      browserBundleId: 'browser',
      browserDisplayName: 'Browser',
      startedAt: '2026-08-01T10:00:00.000Z',
      endedAt: '2026-08-01T10:01:00.000Z',
      activeSeconds: 60,
      hostname: 'docs.example.com',
      url: 'https://docs.example.com/private',
      pageTitle: null,
      isPrivate: true,
      timezone: 'Asia/Ho_Chi_Minh',
      createdAt: '2026-08-01T10:01:00.000Z',
    },
  ];

  it('filters website sessions and resolves title fallback with visit totals', () => {
    expect(filterWebsiteSessions(websiteSessions, 'private')).toHaveLength(1);
    expect(websiteUrls(websiteSummary, websiteSessions, 'docs.example.com', 'private')[0]).toMatchObject({
      url: 'https://docs.example.com/private',
      latestTitle: null,
      visitCount: 1,
      activeSeconds: 60,
      isPrivate: true,
    });
    expect(websiteUrls(websiteSummary, websiteSessions, 'docs.example.com', 'Guide')[0]).toMatchObject({
      latestTitle: 'Guide',
      iconUrl: 'https://docs.example.com/favicon.png',
      visitCount: 1,
    });
  });

  it('searches website title, URL, and domain while retaining exact domain totals', () => {
    expect(websiteDomains(websiteSummary, websiteSessions, 'guide')).toEqual([
      { hostname: 'docs.example.com', activeSeconds: 180 },
    ]);
    expect(websiteUrls(websiteSummary, websiteSessions, 'docs.example.com', 'docs.example.com')).toHaveLength(2);
  });

  it('uses the latest session icon for a website domain', () => {
    const sessions = websiteSessions.map((session, index) => ({
      ...session,
      iconUrl: index === 0 ? 'https://docs.example.com/old-icon.png' : 'https://docs.example.com/icon.png',
    }));

    expect(websiteDomains(websiteSummary, sessions, '')[0]).toMatchObject({
      hostname: 'docs.example.com',
      iconUrl: 'https://docs.example.com/icon.png',
    });
  });

  it('groups website domains into top slices and Other', () => {
    const slices = selectWebsiteUsageSlices(
      {
        topHostnames: [
          { hostname: 'z.example', activeSeconds: 5 },
          { hostname: 'a.example', activeSeconds: 20 },
          { hostname: 'b.example', activeSeconds: 10 },
        ],
      },
      2,
    );

    expect(slices).toEqual([
      { hostname: 'a.example', activeSeconds: 20 },
      { hostname: 'b.example', activeSeconds: 10 },
      { hostname: 'Other', activeSeconds: 5 },
    ]);
  });

  it('formats compatible engagement as a screen-time percentage', () => {
    expect(engagementPercent(200, 51)).toBe(26);
    expect(engagementPercent(200, 300)).toBe(100);
    expect(engagementPercent(200, -10)).toBe(0);
    expect(engagementPercent(0, 0)).toBeNull();
    expect(engagementPercent(200, undefined)).toBeNull();
  });

  it('fills missing usage days and ranks foreground apps', () => {
    const summary = {
      totalActiveSeconds: 900,
      topApps: [
        { bundleId: 'b', displayName: 'Beta', activeSeconds: 120 },
        { bundleId: 'a', displayName: 'Alpha', activeSeconds: 300 },
      ],
      daily: [{ localDate: '2026-07-29', activeSeconds: 900 }],
      dailyApps: [
        { localDate: '2026-07-29', bundleId: 'a', displayName: 'Alpha', activeSeconds: 300 },
        { localDate: '2026-07-29', bundleId: 'b', displayName: 'Beta', activeSeconds: 120 },
      ],
    };

    expect(
      buildUsageTrendData(summary, { from: '2026-07-28', to: '2026-07-29' }).map((point) => point.activeSeconds),
    ).toEqual([0, 900]);
    expect(selectTopUsageApps(summary).map((app) => app.bundleId)).toEqual(['a', 'b']);
    expect(buildUsageStackData(summary, { from: '2026-07-28', to: '2026-07-29' }, summary.topApps)).toEqual([
      { key: '2026-07-28', label: 'Jul 28', app0: 0, app1: 0, other: 0 },
      { key: '2026-07-29', label: 'Jul 29', app0: 120, app1: 300, other: 480 },
    ]);
  });

  it('preserves app identity metadata', () => {
    const summary = {
      totalActiveSeconds: 300,
      topApps: [{ bundleId: 'a', displayName: 'Alpha', activeSeconds: 300, iconUrl: '/media/a.webp', iconHash: 'hash' }],
      daily: [],
    };

    expect(selectTopUsageApps(summary)[0]).toMatchObject({ iconUrl: '/media/a.webp', iconHash: 'hash' });
  });

  it('builds 24 truthful hourly usage buckets for a single-day range', () => {
    const summary = {
      totalActiveSeconds: 900,
      topApps: [{ bundleId: 'a', displayName: 'Alpha', activeSeconds: 900 }],
      daily: [{ localDate: '2026-08-09', activeSeconds: 900 }],
      hourlyApps: [
        { localDate: '2026-08-09', hour: 9, bundleId: 'a', displayName: 'Alpha', activeSeconds: 600 },
        { localDate: '2026-08-09', hour: 9, bundleId: 'b', displayName: 'Beta', activeSeconds: 300 },
      ],
    };

    const points = buildUsageStackData(summary, { from: '2026-08-09', to: '2026-08-09' }, summary.topApps);

    expect(points).toHaveLength(24);
    expect(points[9]).toEqual({ key: '2026-08-09-9', label: '09:00', app0: 600, other: 300 });
    expect(points[10]).toEqual({ key: '2026-08-09-10', label: '10:00', app0: 0, other: 0 });
  });

  it('keeps 24 hourly buckets when Today only has legacy daily detail', () => {
    const summary = {
      totalActiveSeconds: 900,
      topApps: [{ bundleId: 'a', displayName: 'Alpha', activeSeconds: 600 }],
      daily: [{ localDate: '2026-08-09', activeSeconds: 900 }],
      dailyApps: [{ localDate: '2026-08-09', bundleId: 'a', displayName: 'Alpha', activeSeconds: 600 }],
      hourlyApps: [],
    };

    const points = buildUsageStackData(summary, { from: '2026-08-09', to: '2026-08-09' }, summary.topApps);

    expect(points).toHaveLength(24);
    expect(points[0].label).toBe('00:00');
    expect(points[23].label).toBe('23:00');
    expect(points.reduce((total, point) => total + Number(point.app0), 0)).toBe(600);
    expect(points.reduce((total, point) => total + Number(point.other), 0)).toBe(300);
  });

  it('summarizes the activity fields returned by the calendar', () => {
    const days: StudyCalendarDay[] = [
      {
        date: '2026-07-28',
        sessions: 1,
        focusSessions: 2,
        reviews: 8,
        correct: 7,
        completedTasks: 2,
        focusedMinutes: 25,
        cardsCreated: 3,
      },
      {
        date: '2026-07-29',
        sessions: 2,
        focusSessions: 3,
        reviews: 12,
        correct: 10,
        completedTasks: 4,
        focusedMinutes: 50,
        cardsCreated: 1,
      },
    ];

    expect(summarizeActivity(days)).toEqual({
      completedTasks: 6,
      focusSessions: 5,
      focusedMinutes: 75,
      reviewSessions: 3,
      reviews: 20,
      cardsCreated: 4,
    });
  });

  it('treats missing activity counts as zero', () => {
    const days = [
      {
        date: '2026-07-29',
        sessions: undefined,
        reviews: 0,
        correct: 0,
        completedTasks: 0,
        focusedMinutes: 0,
        cardsCreated: 0,
      },
    ] as unknown as StudyCalendarDay[];

    expect(summarizeActivity(days)).toMatchObject({
      focusSessions: 0,
      focusedMinutes: 0,
      reviewSessions: 0,
    });
  });

  it('filters activity to an inclusive custom range', () => {
    const days: StudyCalendarDay[] = [
      {
        date: '2026-07-27',
        sessions: 0,
        focusSessions: 0,
        reviews: 0,
        correct: 0,
        completedTasks: 1,
        focusedMinutes: 0,
        cardsCreated: 0,
      },
      {
        date: '2026-07-28',
        sessions: 0,
        focusSessions: 0,
        reviews: 0,
        correct: 0,
        completedTasks: 2,
        focusedMinutes: 0,
        cardsCreated: 0,
      },
      {
        date: '2026-07-29',
        sessions: 0,
        focusSessions: 0,
        reviews: 0,
        correct: 0,
        completedTasks: 3,
        focusedMinutes: 0,
        cardsCreated: 0,
      },
    ];

    expect(filterActivityRange(days, { from: '2026-07-28', to: '2026-07-29' })).toHaveLength(2);
  });

  it('fills inactive dates and combines activity with XP trends', () => {
    const days: StudyCalendarDay[] = [
      {
        date: '2026-07-28',
        sessions: 0,
        focusSessions: 1,
        reviews: 0,
        correct: 0,
        completedTasks: 2,
        focusedMinutes: 25,
        cardsCreated: 0,
      },
    ];
    const growth: GrowthStatistics = {
      totalXp: 15,
      trend: [{ date: '2026-07-29', xp: 15 }],
      attributes: [],
    };

    const result = buildTrendData(days, growth, { from: '2026-07-27', to: '2026-07-29' });

    expect(result).toHaveLength(3);
    expect(result.map(({ completedTasks, focusedMinutes, xp }) => ({ completedTasks, focusedMinutes, xp }))).toEqual([
      { completedTasks: 0, focusedMinutes: 0, xp: 0 },
      { completedTasks: 2, focusedMinutes: 25, xp: 0 },
      { completedTasks: 0, focusedMinutes: 0, xp: 15 },
    ]);
  });

  it('creates inclusive rolling ranges', () => {
    const range = dateRangeForDays(30, new Date(2026, 6, 29, 12));
    expect(range).toEqual({ from: '2026-06-30', to: '2026-07-29' });
    expect(inclusiveDayCount(range)).toBe(30);
  });

  it('derives deterministic equal-length comparison ranges across calendar boundaries', () => {
    const period = statisticsPeriod({ from: '2026-01-01', to: '2026-03-01' }, 'MONTH');

    expect(period).toEqual({
      from: '2026-01-01',
      to: '2026-03-01',
      grouping: 'MONTH',
      comparisonFrom: '2025-11-02',
      comparisonTo: '2025-12-31',
    });
    expect(addDateKey('2024-03-01', -2)).toBe('2024-02-28');
    expect(statisticsDateTimeRange(period)).toEqual({
      from: '2026-01-01T00:00:00.000+07:00',
      to: '2026-03-02T00:00:00.000+07:00',
    });
  });

  it('normalizes reversed custom ranges like the native client', () => {
    expect(statisticsPeriod({ from: '2026-05-10', to: '2026-05-01' })).toMatchObject({
      from: '2026-05-01',
      to: '2026-05-10',
      comparisonFrom: '2026-04-21',
      comparisonTo: '2026-04-30',
    });
  });

  it('uses the product calendar date instead of the machine timezone', () => {
    expect(dateRangeForDays(2, new Date('2026-03-29T17:30:00.000Z'))).toEqual({
      from: '2026-03-29',
      to: '2026-03-30',
    });
  });

  it('selects only active user attributes for the leaderboard', () => {
    const result = selectTopAttributes([
      skill({ id: 'general', name: 'General', starterKey: 'attribute-general', level: 99 }),
      skill({ id: 'archived', name: 'Archived', archivedAt: '2026-07-01T00:00:00Z', level: 98 }),
      skill({ id: 'strength', name: 'Strength', level: 3, currentXp: 20 }),
      skill({ id: 'agility', name: 'Agility', level: 3, currentXp: 25 }),
      skill({ id: 'focus', name: 'Focus', kind: 'SKILL', level: 100 }),
    ]);

    expect(result.map(({ id }) => id)).toEqual(['agility', 'strength']);
  });

  it('supports custom grouping and zero-value series filtering in trend data', () => {
    const days: StudyCalendarDay[] = [
      {
        date: '2026-07-28',
        sessions: 0,
        focusSessions: 1,
        reviews: 0,
        correct: 0,
        completedTasks: 2,
        focusedMinutes: 25,
        cardsCreated: 0,
      },
    ];
    const growth: GrowthStatistics = {
      totalXp: 15,
      trend: [{ date: '2026-07-29', xp: 15 }],
      attributes: [],
    };

    const grouped = buildTrendData(days, growth, { from: '2026-07-20', to: '2026-07-29' }, 'WEEK');
    expect(grouped.length).toBeGreaterThan(0);

    const nonZeroOnly = buildTrendData(
      days,
      growth,
      { from: '2026-07-27', to: '2026-07-29' },
      'DAY',
      false,
    );
    expect(nonZeroOnly).toHaveLength(2);
    expect(nonZeroOnly.every((point) => point.completedTasks > 0 || point.focusedMinutes > 0 || point.xp > 0)).toBe(true);
  });

  it('keeps trend transformation under the main-thread budget for supported ranges', () => {
    const durations = [1, 7, 30, 90, 365].map((days) => {
      const range = { from: addDateKey('2026-08-15', -(days - 1)), to: '2026-08-15' };
      const activity = Array.from({ length: days }, (_, index) => ({
        date: addDateKey(range.from, index),
        sessions: 1,
        focusSessions: 1,
        reviews: 1,
        correct: 1,
        completedTasks: 1,
        focusedMinutes: 25,
        cardsCreated: 1,
      })) as StudyCalendarDay[];
      const started = performance.now();
      buildTrendData(activity, { totalXp: days, trend: activity.map((day) => ({ date: day.date, xp: 1 })), attributes: [] }, range, 'DAY');
      return performance.now() - started;
    });

    expect(Math.max(...durations)).toBeLessThan(50);
  });

  it('keys every domain cache by the selected range and grouping', () => {
    const period = statisticsPeriod({ from: '2026-08-01', to: '2026-08-09' }, 'WEEK');
    expect(statisticsQueryKeys.gym(period)).toEqual(['statistics', 'gym', '2026-08-01', '2026-08-09', 'WEEK']);
    expect(statisticsQueryKeys.calendarComparison(period)).toEqual([
      'statistics',
      'productivity-comparison',
      period.comparisonFrom,
      period.comparisonTo,
      'WEEK',
    ]);
    expect(statisticsQueryKeys.habitsComparison(period)).toEqual([
      'statistics',
      'habits-comparison',
      '2026-07-23',
      '2026-07-31',
      'WEEK',
    ]);
  });

  it('persists and restores Statistics display settings', () => {
    const storage = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
        clear: () => storage.clear(),
      },
    });

    expect(getStoredStatisticsSettings()).toEqual(DEFAULT_STATISTICS_DISPLAY_SETTINGS);

    saveStoredStatisticsSettings({
      defaultDateRange: '90D',
      grouping: 'WEEK',
      showTrendComparison: false,
      showZeroValueSeries: true,
      visibleDomains: ['productivity', 'gym'],
    });

    expect(getStoredStatisticsSettings()).toEqual({
      defaultDateRange: '90D',
      grouping: 'WEEK',
      showTrendComparison: false,
      showZeroValueSeries: true,
      visibleDomains: ['productivity', 'gym'],
    });
  });

  it('correctly ranks top usage apps and respects limit parameter', () => {
    const summary = {
      totalActiveSeconds: 7200,
      topApps: [
        { bundleId: 'com.apple.Safari', displayName: 'Safari', activeSeconds: 3600 },
        { bundleId: 'com.microsoft.edgemac', displayName: 'Microsoft Edge', activeSeconds: 1800 },
        { bundleId: 'com.google.Chrome', displayName: 'Google Chrome', activeSeconds: 1200 },
        { bundleId: 'com.apple.dt.Xcode', displayName: 'Xcode', activeSeconds: 400 },
        { bundleId: 'com.googlecode.iterm2', displayName: 'iTerm', activeSeconds: 150 },
        { bundleId: 'com.spotify.client', displayName: 'Spotify', activeSeconds: 50 },
      ],
      daily: [],
    };

    const top5 = selectTopUsageApps(summary, 5);
    expect(top5.length).toBe(5);
    expect(top5[0].bundleId).toBe('com.apple.Safari');
    expect(top5[4].bundleId).toBe('com.googlecode.iterm2');

    const top3 = selectTopUsageApps(summary, 3);
    expect(top3.length).toBe(3);
    expect(top3.map((a) => a.displayName)).toEqual(['Safari', 'Microsoft Edge', 'Google Chrome']);
  });
});
