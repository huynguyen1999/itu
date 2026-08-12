import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpenCheck,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Layers3,
  Globe2,
  Link2,
  LockKeyhole,
  MonitorPlay,
  PlusCircle,
  Search,
  Target,
  Timer,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '@/shared/api/client';
import type { GrowthSkill, GrowthStatistics, UsageSummary } from '@/shared/api/types';
import type { WebsiteUsageSummary } from '@/shared/api/usageApi';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import {
  StatisticsSettingsPopover,
  DEFAULT_STATISTICS_DISPLAY_SETTINGS,
  getStoredStatisticsSettings,
  saveStoredStatisticsSettings,
  type StatisticsDisplaySettings,
} from './StatisticsSettingsPopover';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { GrowthIconMark, growthColorClasses } from '@/shared/ui/GrowthIcons';
import { AuthenticatedImage } from '@/shared/ui/AuthenticatedImage';
import {
  buildTrendData,
  buildUsageStackData,
  buildUsageTrendData,
  dateRangeForDays,
  engagementPercent,
  filterActivityRange,
  inclusiveDayCount,
  rangeLabel,
  selectTopAttributes,
  selectTopUsageApps,
  summarizeActivity,
  filterWebsiteSessions,
  websiteDomains,
  websiteUrls,
  type WebsitePrivacyFilter,
  type StatisticsDateRange,
  type TrendPoint,
} from './statistics';

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
  const daysToFetch = inclusiveDayCount({ from: range.from, to: today });

  const calendar = useQuery({
    queryKey: ['study-calendar', daysToFetch],
    queryFn: () => api.studyCalendar(daysToFetch),
  });
  const growth = useQuery({
    queryKey: ['growth', 'statistics', range.from, range.to],
    queryFn: () => api.growthStatistics(startOfDate(range.from), startOfNextDate(range.to)),
  });
  const growthOverview = useQuery({
    queryKey: ['growth', 'overview'],
    queryFn: () => api.growthOverview(),
  });
  const usage = useQuery({
    queryKey: ['usage', 'summaries', range.from, range.to],
    queryFn: () => api.usageSummaries(range.from, range.to),
  });
  const websiteUsage = useQuery({
    queryKey: ['usage', 'websites', 'statistics', range.from, range.to],
    queryFn: () => api.websiteUsageStatistics(range.from, range.to),
  });

  const activity = useMemo(() => filterActivityRange(calendar.data ?? [], range), [calendar.data, range]);
  const summary = useMemo(() => summarizeActivity(activity), [activity]);
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
  const topAttributes = useMemo(() => selectTopAttributes(growthOverview.data?.skills ?? []), [growthOverview.data]);
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

  const isLoading = calendar.isLoading || growth.isLoading;
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

      <section aria-labelledby="overview-heading">
        <div className="mb-3">
          <h2 id="overview-heading" className="text-lg font-semibold">
            Data overview
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">Totals inside the selected period.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          <MetricCard
            icon={CheckCircle2}
            label="Tasks completed"
            value={isLoading ? '—' : formatNumber(summary.completedTasks)}
          />
          <MetricCard
            icon={Timer}
            label="Focus sessions"
            value={isLoading ? '—' : formatNumber(summary.focusSessions)}
          />
          <MetricCard
            icon={Clock3}
            label="Focus duration"
            value={isLoading ? '—' : formatMinutes(summary.focusedMinutes)}
          />
          <MetricCard
            icon={Zap}
            label="XP gained"
            value={growth.isLoading ? '—' : formatNumber(growth.data?.totalXp ?? 0)}
          />
          <MetricCard
            icon={BookOpenCheck}
            label="Review sessions"
            value={isLoading ? '—' : formatNumber(summary.reviewSessions)}
          />
          <MetricCard icon={Layers3} label="Cards reviewed" value={isLoading ? '—' : formatNumber(summary.reviews)} />
          <MetricCard
            icon={PlusCircle}
            label="Cards created"
            value={isLoading ? '—' : formatNumber(summary.cardsCreated)}
          />
          <MetricCard
            icon={MonitorPlay}
            label="App activity"
            value={usage.isLoading ? '—' : formatActiveDuration(usage.data?.totalActiveSeconds ?? 0)}
          />
        </div>
      </section>

      {calendar.isError || growth.isError ? (
        <QueryError
          message="Some statistics could not be loaded."
          onRetry={() => {
            calendar.refetch();
            growth.refetch();
          }}
        />
      ) : (
        <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3" aria-label="Activity trends">
          <TrendCard
            id="task-completion-trend"
            title="Task completion trend"
            summary={`${formatNumber(summary.completedTasks)} completed in this period`}
            data={trends}
            dataKey="completedTasks"
            valueLabel="Tasks"
            color="#0f766e"
            showTrendComparison={statsDisplaySettings.showTrendComparison}
          />
          <TrendCard
            id="focus-duration-trend"
            title="Focus duration trend"
            summary={`${formatMinutes(summary.focusedMinutes)} across ${formatNumber(summary.focusSessions)} sessions`}
            data={trends}
            dataKey="focusedMinutes"
            valueLabel="Minutes"
            color="#2563eb"
            showTrendComparison={statsDisplaySettings.showTrendComparison}
          />
          <TrendCard
            id="experience-gained-trend"
            title="Experience gained trend"
            summary={`${formatNumber(growth.data?.totalXp ?? 0)} XP earned in this period`}
            data={trends}
            dataKey="xp"
            valueLabel="XP"
            color="#d97706"
            showTrendComparison={statsDisplaySettings.showTrendComparison}
            className="lg:col-span-2 xl:col-span-1"
          />
        </section>
      )}

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

      <section
        className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.75fr)]"
        aria-label="Attribute statistics"
      >
        <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
          <CardHeader className="border-b bg-muted/20 p-5">
            <CardTitle className="text-base">Attribute experience distribution</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">
              XP earned and lost by attribute inside the selected period.
            </p>
          </CardHeader>
          <CardContent className="p-5">
            {growth.isLoading ? (
              <Skeleton className="h-80 w-full" />
            ) : (growth.data?.attributes.length ?? 0) === 0 ? (
              <ChartEmptyState message="Complete rewarded activities to see attribute XP distribution." />
            ) : (
              <>
                <div className="h-64" aria-hidden="true">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={growth.data?.attributes}
                      layout="vertical"
                      margin={{ top: 4, right: 8, bottom: 4, left: 8 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                      <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis
                        type="category"
                        dataKey="name"
                        tickLine={false}
                        axisLine={false}
                        width={96}
                        fontSize={11}
                      />
                      <Tooltip formatter={(value) => [`${value} XP`, 'Gained']} />
                      <Bar dataKey="gained" radius={[0, 5, 5, 0]}>
                        {growth.data?.attributes.map((attribute) => (
                          <Cell key={attribute.skillId} fill={chartColor(attribute.color)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-5 divide-y">
                  {growth.data?.attributes.map((attribute) => (
                    <AttributeDistributionRow key={attribute.skillId} attribute={attribute} />
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
          <CardHeader className="border-b bg-muted/20 p-5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Highest-level attributes
            </CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Lifetime ranking with selected-period gains.</p>
          </CardHeader>
          <CardContent className="p-5">
            {growthOverview.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }, (_, index) => (
                  <Skeleton key={index} className="h-16 w-full" />
                ))}
              </div>
            ) : topAttributes.length === 0 ? (
              <ChartEmptyState message="Create an attribute to start tracking levels." />
            ) : (
              <div className="divide-y">
                {topAttributes.map((attribute, index) => (
                  <TopAttributeRow
                    key={attribute.id}
                    attribute={attribute}
                    rank={index + 1}
                    period={growth.data?.attributes.find((item) => item.skillId === attribute.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value }: { icon: typeof Target; label: string; value: string }) {
  return (
    <Card className="min-w-0 shadow-[var(--shadow-soft)]">
      <CardContent className="p-4">
        <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
        <p className="mt-4 text-xl font-semibold tabular-nums text-foreground">{value}</p>
        <p className="mt-1 text-xs leading-4 text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function TrendCard({
  id,
  title,
  summary,
  data,
  dataKey,
  valueLabel,
  color,
  showTrendComparison = true,
  className = '',
}: {
  id: string;
  title: string;
  summary: string;
  data: TrendPoint[];
  dataKey: 'completedTasks' | 'focusedMinutes' | 'xp';
  valueLabel: string;
  color: string;
  showTrendComparison?: boolean;
  className?: string;
}) {
  const hasData = data.some((point) => point[dataKey] > 0);
  return (
    <Card className={`overflow-hidden shadow-[var(--shadow-soft)] ${className}`}>
      <CardHeader className="border-b bg-muted/20 p-5">
        <CardTitle id={id} className="text-base">
          {title}
        </CardTitle>
        {showTrendComparison ? <p className="mt-1 text-xs text-muted-foreground">{summary}</p> : null}
      </CardHeader>
      <CardContent className="p-5">
        {hasData ? (
          <div className="h-56" aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} fontSize={10} width={34} allowDecimals={false} />
                <Tooltip formatter={(value) => [formatNumber(Number(value)), valueLabel]} />
                <Area
                  type="monotone"
                  dataKey={dataKey}
                  stroke={color}
                  strokeWidth={2.5}
                  fill={`url(#${id}-fill)`}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <ChartEmptyState message={`No ${valueLabel.toLowerCase()} recorded in this period.`} />
        )}
      </CardContent>
    </Card>
  );
}

function AttributeDistributionRow({ attribute }: { attribute: GrowthStatistics['attributes'][number] }) {
  const colorClass = growthColorClasses[attribute.color] ?? growthColorClasses.TEAL;
  return (
    <div className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${colorClass}`}>
        <GrowthIconMark icon={attribute.icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <p className="truncate text-sm font-medium">{attribute.name}</p>
          <p
            className={`shrink-0 text-sm font-semibold tabular-nums ${attribute.net >= 0 ? 'text-emerald-600' : 'text-destructive'}`}
          >
            {attribute.net >= 0 ? '+' : ''}
            {formatNumber(attribute.net)} XP
          </p>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          <span className="text-emerald-600">Gained {formatNumber(attribute.gained)}</span>
          {' · '}
          <span className={attribute.lost > 0 ? 'text-destructive' : ''}>Lost {formatNumber(attribute.lost)}</span>
          {' · '}
          {formatNumber(attribute.changes)} {attribute.changes === 1 ? 'change' : 'changes'}
        </p>
      </div>
    </div>
  );
}

function TopAttributeRow({
  attribute,
  period,
  rank,
}: {
  attribute: GrowthSkill;
  period?: GrowthStatistics['attributes'][number];
  rank: number;
}) {
  const progress =
    attribute.requiredXp > 0 ? Math.min(100, Math.max(0, (attribute.progressXp / attribute.requiredXp) * 100)) : 0;
  const colorClass = growthColorClasses[attribute.color] ?? growthColorClasses.TEAL;

  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <span className="w-5 text-center text-xs font-semibold text-muted-foreground">{rank}</span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${colorClass}`}>
          <GrowthIconMark icon={attribute.icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium">{attribute.name}</p>
            <p className="shrink-0 text-sm font-semibold">Level {attribute.level}</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-label={`${attribute.name} level progress`}
              aria-valuemin={0}
              aria-valuemax={attribute.requiredXp}
              aria-valuenow={attribute.progressXp}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>
              {formatNumber(attribute.progressXp)} / {formatNumber(attribute.requiredXp)} XP
            </span>
            <span className="text-emerald-600">+{formatNumber(period?.gained ?? 0)} in range</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function QueryError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      className="flex min-h-32 flex-col items-center justify-center gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-6 text-center text-sm text-destructive"
      role="alert"
    >
      <p>{message}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function ChartEmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-lg border border-dashed bg-muted/20 px-6 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function UsageSection({
  isLoading,
  isError,
  onRetry,
  summary,
  trend,
  stack,
  topApps,
}: {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  summary?: UsageSummary;
  trend: Array<{ key: string; label: string; activeSeconds: number }>;
  stack: Array<Record<string, string | number>>;
  topApps: UsageSummary['topApps'];
}) {
  const hasHourlyBuckets = stack.length === 24;
  const engagedPercent = engagementPercent(summary?.totalActiveSeconds ?? 0, summary?.totalEngagedSeconds);
  const hasEngagementData = engagedPercent !== null && summary?.totalEngagedSeconds != null;
  const coveragePercent =
    summary?.engagementCoverage && summary.engagementCoverage.totalActiveSeconds > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (summary.engagementCoverage.observedActiveSeconds / summary.engagementCoverage.totalActiveSeconds) * 100,
            ),
          ),
        )
      : null;
  const engagementMeasurement =
    coveragePercent === null
      ? 'Engagement coverage is unavailable.'
      : `Engagement was measured for ${coveragePercent}% of foreground activity.`;

  return (
    <section aria-labelledby="usage-heading" aria-busy={isLoading}>
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="usage-heading" className="text-lg font-semibold">
            Foreground app activity
          </h2>
          <p className="text-xs text-muted-foreground">Synced from your tracked devices for the selected period.</p>
        </div>
        <p className="text-xs text-muted-foreground bg-muted/30 px-2.5 py-1 rounded-md border border-border/50">
          💻 Raw session timeline stored locally on Mac
        </p>
      </div>
      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2" role="status" aria-live="polite">
          <span className="sr-only">Loading foreground app activity.</span>
          <Card>
            <CardContent className="p-5">
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Skeleton className="h-56 w-full" />
            </CardContent>
          </Card>
        </div>
      ) : isError ? (
        <QueryError message="Foreground app activity could not be loaded." onRetry={onRetry} />
      ) : !summary ||
        (summary.totalActiveSeconds <= 0 &&
          topApps.length === 0 &&
          trend.every((point) => point.activeSeconds <= 0)) ? (
        <ChartEmptyState message="No synced foreground activity in this period." />
      ) : (
        <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
          <CardHeader className="flex-col gap-3 border-b bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Screen Time</p>
                <p className="font-mono text-2xl font-bold tracking-[-0.03em]">
                  {formatActiveDuration(summary.totalActiveSeconds)}
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Engaged Time</p>
                  <span className="group relative inline-flex">
                    <button
                      type="button"
                      className="grid h-5 w-5 place-items-center rounded-full text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      aria-label="How Engaged Time is measured"
                      aria-describedby="engagement-measurement"
                    >
                      ⓘ
                    </button>
                    <span
                      id="engagement-measurement"
                      role="tooltip"
                      className="pointer-events-none invisible absolute left-0 top-full z-10 mt-2 w-64 rounded-[var(--itu-radius-s)] border border-border bg-card px-3 py-2 text-xs leading-4 text-foreground opacity-0 shadow-[var(--shadow-soft)] transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
                    >
                      {engagementMeasurement}
                    </span>
                  </span>
                </div>
                <p className="font-mono text-2xl font-bold tracking-[-0.03em] text-primary">
                  {hasEngagementData ? formatActiveDuration(summary.totalEngagedSeconds ?? 0) : '—'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {hasEngagementData ? `${engagedPercent}% of screen time` : 'Not enough engagement data yet.'}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {hasHourlyBuckets ? 'Hourly foreground time' : 'Daily foreground time'}, stacked by application.
            </p>
          </CardHeader>
          <CardContent className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-stretch">
            <div
              className="h-64 min-w-0"
              aria-label={`${hasHourlyBuckets ? 'Hourly' : 'Daily'} foreground time stacked by application`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stack} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="28%">
                  <CartesianGrid vertical={false} stroke="var(--itu-border-soft)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    minTickGap={24}
                    interval={hasHourlyBuckets ? 2 : 'preserveStartEnd'}
                  />
                  <YAxis
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    width={38}
                    tickFormatter={(value) => axisActiveDuration(Number(value))}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--itu-surface-2)' }}
                    itemSorter={(item) => -Number(item.value ?? 0)}
                    formatter={(value, name) => [formatActiveDuration(Number(value)), String(name)]}
                  />
                  {topApps.map((app, index) => (
                    <Bar
                      key={app.bundleId}
                      dataKey={`app${index}`}
                      name={app.displayName}
                      stackId="usage"
                      fill={usageColors[index % usageColors.length]}
                      maxBarSize={18}
                    />
                  ))}
                  <Bar
                    dataKey="other"
                    name="Other apps"
                    stackId="usage"
                    fill="var(--itu-ink-faint)"
                    maxBarSize={18}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="border-t pt-4 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
              {topApps.length === 0 ? (
                <ChartEmptyState message="No app ranking is available in this period." />
              ) : (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Top Applications
                  </p>
                  {topApps.map((app, index) => (
                    <div
                      key={app.bundleId}
                      className="flex items-center gap-3 rounded-[var(--itu-radius-s)] px-1.5 py-1.5 hover:bg-muted/30"
                    >
                      <AuthenticatedImage
                        src={app.iconUrl ?? null}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-[var(--itu-radius-s)] object-cover shadow-sm"
                        fallback={<AppUsageIcon name={app.displayName} color={usageColors[index % usageColors.length]} />}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{app.displayName}</p>
                        {app.engagedSeconds != null && (
                          <p className="text-[11px] text-muted-foreground">
                            Engaged: {formatActiveDuration(app.engagedSeconds)}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                          {formatActiveDuration(app.activeSeconds)}
                        </p>
                        <p className="text-[10px] text-muted-foreground uppercase">Screen</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function WebsiteUsageSection({
  isLoading,
  isError,
  onRetry,
  summary,
}: {
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  summary?: WebsiteUsageSummary;
}) {
  const [filter, setFilter] = useState<WebsitePrivacyFilter>('all');
  const [search, setSearch] = useState('');
  const [selectedHostname, setSelectedHostname] = useState<string | null>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [showAllDomains, setShowAllDomains] = useState(false);
  const privacySessions = useMemo(() => filterWebsiteSessions(summary?.sessions ?? [], filter), [summary, filter]);
  const domains = useMemo(() => websiteDomains(summary, privacySessions, search), [summary, privacySessions, search]);
  const visibleDomains = showAllDomains ? domains : domains.slice(0, 5);
  const filteredTotalActiveSeconds = domains.reduce((total, domain) => total + domain.activeSeconds, 0);
  const selectedDomain = selectedHostname && domains.some((domain) => domain.hostname === selectedHostname)
    ? selectedHostname
    : null;
  const urls = useMemo(
    () => websiteUrls(summary, privacySessions, selectedDomain, search),
    [summary, privacySessions, selectedDomain, search],
  );
  const selectedDetail = selectedUrl ? urls.find((url) => url.url === selectedUrl) ?? null : null;
  const sessions = useMemo(
    () =>
      privacySessions.filter(
        (session) => session.hostname === selectedDomain && session.url === selectedDetail?.url,
      ),
    [privacySessions, selectedDetail?.url, selectedDomain],
  );

  function selectDomain(hostname: string) {
    if (hostname === 'Other') return;
    if (!showAllDomains && !visibleDomains.some((domain) => domain.hostname === hostname)) setShowAllDomains(true);
    setSelectedHostname((current) => (current === hostname ? null : hostname));
    setSelectedUrl(null);
  }

  function changeFilter(next: WebsitePrivacyFilter) {
    setFilter(next);
    setSelectedHostname(null);
    setSelectedUrl(null);
    setShowAllDomains(false);
  }

  return (
    <section aria-labelledby="website-usage-heading" aria-busy={isLoading}>
      <div className="mb-3">
        <h2 id="website-usage-heading" className="flex items-center gap-2 text-lg font-semibold">
          <Globe2 className="h-5 w-5 text-primary" aria-hidden="true" />
          Website activity
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Domain totals with URL-level detail from the active tab in your focused browser window.
        </p>
      </div>
      {isLoading ? (
        <Card role="status" aria-live="polite">
          <span className="sr-only">Loading website activity.</span>
          <CardContent className="p-5">
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      ) : isError ? (
        <QueryError message="Website activity could not be loaded." onRetry={onRetry} />
      ) : (
        <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
          <CardHeader className="flex-col gap-4 border-b bg-muted/20 p-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <CardTitle className="text-base">Website time by domain</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Select a domain, URL, then a visit for exact timing.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="relative min-w-48">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search title, domain, URL"
                  aria-label="Search website activity"
                  className="h-9 pl-8 text-xs"
                />
              </div>
              <div className="inline-flex rounded-lg border bg-card p-1" aria-label="Website privacy filter">
                {(['all', 'normal', 'private'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`min-h-8 rounded-md px-2.5 text-xs font-medium capitalize transition-colors ${
                      filter === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
                    }`}
                    aria-pressed={filter === value}
                    onClick={() => changeFilter(value)}
                  >
                    {value === 'all' ? 'All' : value === 'normal' ? 'Normal' : 'Private'}
                  </button>
                ))}
              </div>
              <p className="shrink-0 font-mono text-xl font-bold tracking-[-0.03em]">
                {formatActiveDuration(privacySessions.reduce((total, session) => total + session.activeSeconds, 0))}
              </p>
            </div>
          </CardHeader>
          {!summary || filteredTotalActiveSeconds <= 0 || domains.length === 0 ? (
            <CardContent className="p-5">
              <ChartEmptyState
                message={
                  filter !== 'all' || search.trim() !== ''
                    ? 'No website activity matches the selected filter.'
                    : 'No synced website activity in this period.'
                }
              />
            </CardContent>
          ) : (
            <CardContent className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
            <div className="h-64 min-w-0" aria-label="Website activity by domain">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={domains}
                    dataKey="activeSeconds"
                    nameKey="hostname"
                    cx="50%"
                    cy="50%"
                    innerRadius="58%"
                    outerRadius="82%"
                    paddingAngle={2}
                    stroke="var(--itu-surface)"
                    strokeWidth={2}
                    onClick={(entry) => selectDomain(String(entry.payload?.hostname ?? ''))}
                  >
                    {domains.map((domain, index) => (
                      <Cell key={domain.hostname} fill={websiteColors[index % websiteColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value, name, item) => {
                      const percent =
                        filteredTotalActiveSeconds > 0
                          ? Math.round((Number(value) / filteredTotalActiveSeconds) * 100)
                          : 0;
                      return [
                        `${percent}% · ${formatActiveDuration(Number(value))}`,
                        String(name ?? item?.payload?.hostname ?? ''),
                      ];
                    }}
                  />
                  <text
                    x="50%"
                    y="47%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-foreground font-mono text-lg font-bold"
                  >
                    {formatActiveDuration(filteredTotalActiveSeconds)}
                  </text>
                  <text
                    x="50%"
                    y="59%"
                    textAnchor="middle"
                    dominantBaseline="central"
                    className="fill-muted-foreground text-[11px]"
                  >
                    active time
                  </text>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="min-w-0 space-y-2" aria-label="Website domains">
              {visibleDomains.map((domain, index) => {
                const selected = selectedDomain === domain.hostname;
                const percent = Math.round((domain.activeSeconds / filteredTotalActiveSeconds) * 100);
                return (
                  <button
                    key={domain.hostname}
                    type="button"
                    className={`flex min-h-11 w-full items-center gap-3 rounded-[var(--itu-radius-s)] px-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected ? 'bg-primary/10' : 'hover:bg-muted/40'
                    } ${domain.hostname === 'Other' ? 'cursor-default' : ''}`}
                    onClick={() => selectDomain(domain.hostname)}
                        aria-pressed={selected}
                    aria-label={
                      domain.hostname === 'Other' ? 'Other domains, not drillable' : `Inspect ${domain.hostname}`
                    }
                    disabled={domain.hostname === 'Other'}
                  >
                    <WebsiteFavicon src={domain.iconUrl} />
                    <span className="min-w-0 flex-1 truncate text-sm font-medium" title={domain.hostname}>
                      {domain.hostname}
                    </span>
                    <span className="shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                      {percent}% · {formatActiveDuration(domain.activeSeconds)}
                    </span>
                  </button>
                );
              })}
              {domains.length > 5 ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  aria-expanded={showAllDomains}
                  onClick={() => setShowAllDomains((current) => !current)}
                >
                  {showAllDomains ? 'Show less' : `See more (${domains.length - 5})`}
                </Button>
              ) : null}
            </div>
            {selectedDomain ? (
              <div className="border-t border-[var(--itu-border-soft)] pt-4 lg:col-span-2" aria-live="polite">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                    <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate" title={selectedDomain}>
                      {selectedDomain}
                    </span>
                  </h3>
                  {urls.length > 0 ? (
                    <span className="text-xs text-muted-foreground">{urls.length} URLs</span>
                  ) : null}
                </div>
                {urls.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No URL detail matches this filter or search.</p>
                ) : (
                  <div className="divide-y divide-[var(--itu-border-soft)] rounded-[var(--itu-radius-s)] border border-[var(--itu-border-soft)] bg-[var(--itu-surface-2)] px-3">
                    {urls.map((item) => (
                      <button
                        key={`${item.url}-${item.isPrivate ? 'private' : 'normal'}`}
                        type="button"
                        className={`flex w-full items-start gap-3 py-2.5 text-left ${selectedUrl === item.url ? 'text-primary' : ''}`}
                        onClick={() => setSelectedUrl((current) => (current === item.url ? null : item.url))}
                        aria-pressed={selectedUrl === item.url}
                      >
                        <WebsiteFavicon src={item.iconUrl} />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-xs font-semibold" title={item.latestTitle ?? item.url}>
                              {item.latestTitle?.trim() || formatWebsitePath(item.url)}
                            </span>
                            {item.isPrivate ? <PrivateMarker /> : null}
                          </span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground" title={item.url}>
                            {formatWebsitePath(item.url)}
                          </span>
                        </span>
                        <span className="shrink-0 text-right font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                          <span className="block">{formatActiveDuration(item.activeSeconds)}</span>
                          <span className="block text-[10px] font-normal">{item.visitCount} visits</span>
                        </span>
                        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                      </button>
                    ))}
                  </div>
                )}
                {selectedDetail ? (
                  <div className="mt-4 rounded-[var(--itu-radius-s)] border border-[var(--itu-border-soft)] bg-[var(--itu-surface-2)] p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <WebsiteFavicon src={selectedDetail.iconUrl} />
                        <h4 className="truncate text-xs font-semibold" title={selectedDetail.url}>
                          {selectedDetail.latestTitle?.trim() || formatWebsitePath(selectedDetail.url)}
                        </h4>
                        {selectedDetail.isPrivate ? <PrivateMarker /> : null}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatActiveDuration(selectedDetail.activeSeconds)} · {sessions.length} visits
                      </span>
                    </div>
                    {sessions.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No visit session detail is available for this URL.</p>
                    ) : (
                      <div className="divide-y divide-[var(--itu-border-soft)]">
                        {sessions.map((session) => (
                          <div key={session.id} className="flex flex-wrap items-center gap-2 py-2 text-xs">
                            <span className="font-mono tabular-nums">{formatSessionTime(session.startedAt, session.timezone)}</span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-mono tabular-nums">{formatSessionTime(session.endedAt, session.timezone)}</span>
                            <span className="ml-auto font-mono font-semibold tabular-nums">
                              {formatActiveDuration(session.activeSeconds)}
                            </span>
                            {session.isPrivate ? <PrivateMarker /> : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}
          </CardContent>
          )}
        </Card>
      )}
    </section>
  );
}

const usageColors = [
  'var(--itu-teal-600)',
  'var(--itu-sync-blue, #4f8fcf)',
  'var(--itu-amber-500)',
  'var(--itu-teal-400)',
  'var(--itu-coral-500)',
];

const websiteColors = [
  'var(--itu-teal-600)',
  'var(--itu-sync-blue, #4f8fcf)',
  'var(--itu-amber-500)',
  'var(--itu-teal-400)',
  'var(--itu-coral-500)',
  'var(--itu-glow-gold, #ad8a3d)',
  'var(--itu-violet-item, #8b6fc9)',
  'var(--itu-ink-faint)',
];

function AppUsageIcon({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--itu-radius-s)] text-sm font-bold text-white shadow-sm"
      style={{ backgroundColor: color }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toLocaleUpperCase() || '?'}
    </span>
  );
}

function WebsiteFavicon({ src }: { src?: string | null }) {
  const [failed, setFailed] = useState(false);
  const safeSrc = websiteIconSource(src);

  useEffect(() => setFailed(false), [safeSrc]);

  if (!safeSrc || failed) {
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-[4px] bg-muted text-muted-foreground" aria-hidden="true">
        <Globe2 className="h-3.5 w-3.5" />
      </span>
    );
  }

  return (
    <img
      src={safeSrc}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      className="h-5 w-5 shrink-0 rounded-[4px] object-contain"
      onError={() => setFailed(true)}
    />
  );
}

function websiteIconSource(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function validateCustomRange(range: StatisticsDateRange, earliest: string, latest: string) {
  if (!range.from || !range.to) return 'Choose both dates.';
  if (range.from > range.to) return 'The start date must be before the end date.';
  if (range.from < earliest || range.to > latest) return 'Choose a range within the last year.';
  return '';
}

function startOfDate(date: string) {
  return `${date}T00:00:00.000Z`;
}

function startOfNextDate(date: string) {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  return remainder === 0 ? `${hours}h` : `${hours}h ${remainder}m`;
}

function formatActiveDuration(seconds: number) {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  if (safeSeconds < 60) return `${safeSeconds}s`;
  return formatMinutes(Math.floor(safeSeconds / 60));
}

function formatWebsitePath(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname || '/'}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

function PrivateMarker() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <LockKeyhole className="h-3 w-3" aria-hidden="true" />
      Private
    </span>
  );
}

function formatSessionTime(value: string, timezone: string) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }
}

function axisActiveDuration(seconds: number) {
  return seconds >= 3_600 ? `${Math.round(seconds / 3_600)}h` : `${Math.round(seconds / 60)}m`;
}

function formatNumber(value: number) {
  return value.toLocaleString();
}

function chartColor(color: string) {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  return (
    {
      TEAL: '#0f766e',
      EMERALD: '#059669',
      BLUE: '#2563eb',
      INDIGO: '#4f46e5',
      VIOLET: '#7c3aed',
      ROSE: '#e11d48',
      AMBER: '#d97706',
      SLATE: '#475569',
    }[color] ?? '#0f766e'
  );
}
