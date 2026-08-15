import { useMemo, useState } from 'react';
import {
  BookOpenCheck,
  CalendarRange,
  CheckCircle2,
  MonitorPlay,
  Dumbbell,
  WalletCards,
  Brain,
  ListChecks,
} from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import {
  StatisticsSettingsPopover,
  getStoredStatisticsSettings,
  saveStoredStatisticsSettings,
  type StatisticsDisplaySettings,
} from './StatisticsSettingsPopover';
import { UsageSection } from './StatisticsUsageSection';
import { WebsiteUsageSection } from './StatisticsWebsiteUsageSection';
import { StatisticsDomainCards, type StatisticsDomainCardModel } from './StatisticsDomainCards';
import { Input } from '@/shared/ui/input';
import { StatisticsOverviewSection } from './StatisticsOverviewSection';
import { StatisticsTrendsSection } from './StatisticsTrendsSection';
import { StatisticsGrowthSection } from './StatisticsGrowthSection';
import {
  buildTrendData,
  buildUsageStackData,
  buildUsageTrendData,
  filterActivityRange,
  selectTopUsageApps,
  summarizeActivity,
  formatActiveDuration,
  formatMinutes,
  formatNumber,
} from './statistics';
import { dateRangeForDays, rangeLabel, statisticsPeriod, type StatisticsDateRange } from './statisticsPeriod';
import { useStatisticsQueries } from './statisticsQueries';

const rangePresets = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '3 months', days: 90 },
  { label: '1 year', days: 365 },
] as const;

type RangePreset = (typeof rangePresets)[number]['days'] | 'custom';

const defaultRangeDays = {
  '1D': 1,
  '7D': 7,
  '30D': 30,
  '90D': 90,
  '1Y': 365,
} as const;

export function StatisticsPage() {
  const today = useMemo(() => dateRangeForDays(1).to, []);
  const earliestDate = useMemo(() => dateRangeForDays(365).from, []);
  const [statsDisplaySettings, setStatsDisplaySettings] = useState<StatisticsDisplaySettings>(
    () => getStoredStatisticsSettings(),
  );
  const initialRangeDays = defaultRangeDays[statsDisplaySettings.defaultDateRange];
  const [range, setRange] = useState<StatisticsDateRange>(() => dateRangeForDays(initialRangeDays));
  const [rangePreset, setRangePreset] = useState<RangePreset>(initialRangeDays);
  const [customRange, setCustomRange] = useState<StatisticsDateRange>(range);
  const period = useMemo(() => statisticsPeriod(range, statsDisplaySettings.grouping), [range, statsDisplaySettings.grouping]);
  const { calendar, growth, calendarComparison, growthComparison, growthOverview, usage, websiteUsage, habits, habitsComparison, gym, gymComparison, budget } = useStatisticsQueries(period);

  const activity = useMemo(() => filterActivityRange(calendar.data ?? [], range), [calendar.data, range]);
  const summary = useMemo(() => summarizeActivity(activity), [activity]);
  const comparisonSummary = useMemo(
    () => summarizeActivity(calendarComparison.data ?? []),
    [calendarComparison.data],
  );
  const trends = useMemo(
    () =>
      buildTrendData(
        activity,
        growth.data,
        range,
        statsDisplaySettings.grouping,
        statsDisplaySettings.showZeroValueSeries,
      ),
    [activity, growth.data, range, statsDisplaySettings.grouping, statsDisplaySettings.showZeroValueSeries],
  );
  const usageTrend = useMemo(
    () =>
      buildUsageTrendData(
        usage.data,
        range,
        statsDisplaySettings.grouping,
        statsDisplaySettings.showZeroValueSeries,
      ),
    [usage.data, range, statsDisplaySettings.grouping, statsDisplaySettings.showZeroValueSeries],
  );
  const topUsageApps = useMemo(() => selectTopUsageApps(usage.data), [usage.data]);
  const usageStack = useMemo(
    () => buildUsageStackData(usage.data, range, topUsageApps),
    [usage.data, range, topUsageApps],
  );
  const habitTotals = useMemo(() => {
    const days = habits.data?.days ?? [];
    return {
      completed: days.filter((day) => day.status === 'COMPLETED').length,
      scheduled: days.filter((day) => day.scheduled).length,
    };
  }, [habits.data]);
  const comparisonHabitTotals = useMemo(() => {
    const days = habitsComparison.data?.days ?? [];
    return {
      completed: days.filter((day) => day.status === 'COMPLETED').length,
      scheduled: days.filter((day) => day.scheduled).length,
    };
  }, [habitsComparison.data]);
  const domainCards: StatisticsDomainCardModel[] = [
    {
      key: 'productivity',
      title: 'Productivity',
      description: 'Tasks and focus',
      href: '/plan',
      icon: ListChecks,
      state: calendar.isLoading ? 'loading' : calendar.isError ? 'error' : 'ready',
      onRetry: () => calendar.refetch(),
        metrics: [
        { label: 'Tasks', value: formatNumber(summary.completedTasks), comparison: calendarComparison.isSuccess ? comparisonValue(summary.completedTasks, comparisonSummary.completedTasks) : undefined },
        { label: 'Focus', value: formatMinutes(summary.focusedMinutes), comparison: calendarComparison.isSuccess ? comparisonValue(summary.focusedMinutes, comparisonSummary.focusedMinutes, formatMinutes) : undefined },
      ],
    },
    {
      key: 'habits',
      title: 'Habits',
      description: 'Scheduled consistency',
      href: '/habits',
      icon: CheckCircle2,
      state: habits.isLoading ? 'loading' : habits.isError ? 'error' : 'ready',
      onRetry: () => habits.refetch(),
      metrics: [
        { label: 'Completed', value: formatNumber(habitTotals.completed), comparison: habitsComparison.isSuccess ? comparisonValue(habitTotals.completed, comparisonHabitTotals.completed) : undefined },
        { label: 'Scheduled', value: formatNumber(habitTotals.scheduled) },
      ],
    },
    {
      key: 'learning',
      title: 'Learning',
      description: 'Reviews and cards',
      href: '/learn',
      icon: BookOpenCheck,
      state: calendar.isLoading ? 'loading' : calendar.isError ? 'error' : 'ready',
      onRetry: () => calendar.refetch(),
      metrics: [
        { label: 'Reviews', value: formatNumber(summary.reviews), comparison: calendarComparison.isSuccess ? comparisonValue(summary.reviews, comparisonSummary.reviews) : undefined },
        { label: 'Created', value: formatNumber(summary.cardsCreated), comparison: calendarComparison.isSuccess ? comparisonValue(summary.cardsCreated, comparisonSummary.cardsCreated) : undefined },
      ],
    },
    {
      key: 'gym',
      title: 'Gym',
      description: 'Training volume',
      href: '/gym',
      icon: Dumbbell,
      state: gym.isLoading ? 'loading' : gym.isError ? 'error' : 'ready',
      onRetry: () => gym.refetch(),
      metrics: [
        { label: 'Workouts', value: formatNumber(gym.data?.totalWorkouts ?? 0), comparison: gymComparison.isSuccess ? comparisonValue(gym.data?.totalWorkouts ?? 0, gymComparison.data?.totalWorkouts ?? 0) : undefined },
        { label: 'Minutes', value: formatNumber(gym.data?.totalTrainingMinutes ?? 0), comparison: gymComparison.isSuccess ? comparisonValue(gym.data?.totalTrainingMinutes ?? 0, gymComparison.data?.totalTrainingMinutes ?? 0) : undefined },
      ],
    },
    {
      key: 'budget',
      title: 'Budget',
      description: 'Spending in range',
      href: '/budget',
      icon: WalletCards,
      state: budget.isLoading ? 'loading' : budget.isError ? 'error' : 'ready',
      onRetry: () => budget.refetch(),
      metrics: [
        { label: 'Spent', value: budget.data?.spent ?? '0.00', comparison: budget.data?.changeAmount },
        { label: 'Expenses', value: formatNumber(budget.data?.expenseCount ?? 0) },
      ],
    },
    {
      key: 'growth',
      title: 'Growth',
      description: 'Experience and skills',
      href: '/growth/attributes',
      icon: Brain,
      state: growth.isLoading ? 'loading' : growth.isError ? 'error' : 'ready',
      onRetry: () => growth.refetch(),
      metrics: [
        { label: 'XP', value: formatNumber(growth.data?.totalXp ?? 0), comparison: growthComparison.isSuccess ? comparisonValue(growth.data?.totalXp ?? 0, growthComparison.data?.totalXp ?? 0) : undefined },
        { label: 'Attributes', value: formatNumber(growth.data?.attributes.length ?? 0) },
      ],
    },
    {
      key: 'digital',
      title: 'Digital',
      description: 'App activity',
      href: '/settings',
      icon: MonitorPlay,
      state: usage.isLoading ? 'loading' : usage.isError ? 'error' : 'ready',
      onRetry: () => usage.refetch(),
      metrics: [{ label: 'Active', value: formatActiveDuration(usage.data?.totalActiveSeconds ?? 0) }],
    },
  ];

  const customRangeError = validateCustomRange(customRange, earliestDate, today);

  function choosePreset(days: (typeof rangePresets)[number]['days']) {
    const nextRange = dateRangeForDays(days);
    setRangePreset(days);
    setRange(nextRange);
    setCustomRange(nextRange);
  }

  function applyCustomRange() {
    if (customRangeError) return;
    setRangePreset('custom');
    setRange(customRange);
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-7 pb-10 animate-in fade-in duration-500">
      <PageHeader
        kicker="Reports & Analytics"
        title="Statistics"
        description={`Tasks, deep work, learning, and Growth progress for ${rangeLabel(range)}.`}
        stickyControls={
          <section aria-labelledby="range-heading">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 id="range-heading" className="flex items-center gap-2 text-sm font-semibold">
                  <CalendarRange className="h-4 w-4 text-primary" aria-hidden="true" />
                  Time range
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">{rangeLabel(range)}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex max-w-full overflow-x-auto rounded-lg border bg-card p-1"
                  aria-label="Statistics range"
                >
                  {rangePresets.map((preset) => (
                    <button
                      type="button"
                      key={preset.days}
                      className={`min-h-9 shrink-0 rounded-md px-3 text-xs font-medium transition-colors ${
                        rangePreset === preset.days
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                      aria-pressed={rangePreset === preset.days}
                      onClick={() => choosePreset(preset.days)}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={`min-h-9 shrink-0 rounded-md px-3 text-xs font-medium transition-colors ${
                      rangePreset === 'custom'
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                    aria-pressed={rangePreset === 'custom'}
                    onClick={() => setRangePreset('custom')}
                  >
                    Custom
                  </button>
                </div>
              </div>
            </div>
          </section>
        }
      >
        <FeatureSettingsButton title="Statistics settings">
          <StatisticsSettingsPopover
            settings={statsDisplaySettings}
            onChange={(patch) => {
              setStatsDisplaySettings((current) => {
                const next = { ...current, ...patch };
                saveStoredStatisticsSettings(next);
                if (patch.defaultDateRange && patch.defaultDateRange !== current.defaultDateRange) {
                  const nextDays = defaultRangeDays[patch.defaultDateRange];
                  setRangePreset(nextDays);
                  const nextRange = dateRangeForDays(nextDays);
                  setRange(nextRange);
                  setCustomRange(nextRange);
                }
                return next;
              });
            }}
          />
        </FeatureSettingsButton>
      </PageHeader>

      <section aria-label="Custom time range">
        {rangePreset === 'custom' ? (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border bg-muted/20 p-3 sm:flex-row sm:items-end">
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              From
              <Input
                type="date"
                min={earliestDate}
                max={today}
                value={customRange.from}
                onChange={(event) => setCustomRange((current) => ({ ...current, from: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-xs font-medium text-muted-foreground">
              To
              <Input
                type="date"
                min={earliestDate}
                max={today}
                value={customRange.to}
                onChange={(event) => setCustomRange((current) => ({ ...current, to: event.target.value }))}
              />
            </label>
            <Button type="button" onClick={applyCustomRange} disabled={Boolean(customRangeError)}>
              Apply range
            </Button>
            {customRangeError ? (
              <p className="text-xs text-destructive" role="alert">
                {customRangeError}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>

      <StatisticsOverviewSection
        visibleDomains={statsDisplaySettings.visibleDomains}
        calendarState={{ isLoading: calendar.isLoading, isError: calendar.isError }}
        growthState={{ isLoading: growth.isLoading, isError: growth.isError }}
        summary={summary}
        comparisonSummary={comparisonSummary}
        calendarComparisonReady={calendarComparison.isSuccess && !calendar.isError}
        habits={habits}
        habitsComparison={habitsComparison}
        gym={gym}
        gymComparison={gymComparison}
        budget={budget}
        growth={growth}
        growthComparison={growthComparison}
        usage={usage}
      />

      <StatisticsDomainCards cards={domainCards.filter((card) => statsDisplaySettings.visibleDomains.includes(card.key))} />

      <StatisticsTrendsSection
        visibleDomains={statsDisplaySettings.visibleDomains}
        trends={trends}
        summary={summary}
        growthXp={growth.data?.totalXp ?? 0}
        showComparison={statsDisplaySettings.showTrendComparison}
        hasError={calendar.isError || growth.isError}
        onRetry={() => { calendar.refetch(); growth.refetch(); }}
      />

      {statsDisplaySettings.visibleDomains.includes('digital') ? (
        <>
          <UsageSection
            isLoading={usage.isLoading}
            isError={usage.isError}
            onRetry={() => usage.refetch()}
            summary={usage.data}
            trend={usageTrend}
            stack={usageStack}
            topApps={topUsageApps}
          />
          <WebsiteUsageSection
            isLoading={websiteUsage.isLoading}
            isError={websiteUsage.isError}
            onRetry={() => websiteUsage.refetch()}
            summary={websiteUsage.data}
          />
        </>
      ) : null}

      {statsDisplaySettings.visibleDomains.includes('growth') ? <StatisticsGrowthSection growth={growth} growthOverview={growthOverview} /> : null}
    </div>
  );
}

function comparisonValue(current: number, previous: number, format: (value: number) => string = formatNumber) {
  const delta = current - previous;
  return `${delta >= 0 ? '+' : ''}${format(delta)}`;
}

function comparisonPercentagePoints(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return undefined;
  const delta = current - previous;
  return `${delta >= 0 ? '+' : ''}${formatNumber(Math.round(delta))} pp`;
}

function validateCustomRange(range: StatisticsDateRange, earliest: string, latest: string) {
  if (!range.from || !range.to) return 'Choose both dates.';
  if (range.from > range.to) return 'The start date must be before the end date.';
  if (range.from < earliest || range.to > latest) return 'Choose a range within the last year.';
  return '';
}
