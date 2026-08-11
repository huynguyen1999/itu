import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpenCheck,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Layers3,
  Globe2,
  Link2,
  MonitorPlay,
  PlusCircle,
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
  type StatisticsDisplaySettings,
} from './StatisticsSettingsPopover';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Skeleton } from '@/shared/ui/skeleton';
import { GrowthIconMark, growthColorClasses } from '@/shared/ui/GrowthIcons';
import {
  buildTrendData,
  buildUsageStackData,
  buildUsageTrendData,
  dateRangeForDays,
  filterActivityRange,
  inclusiveDayCount,
  rangeLabel,
  selectTopAttributes,
  selectTopUsageApps,
  summarizeActivity,
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
  '7D': 7,
  '30D': 30,
  '90D': 90,
  '1Y': 365,
} as const;

export function StatisticsPage() {
  const today = useMemo(() => dateRangeForDays(1).to, []);
  const earliestDate = useMemo(() => dateRangeForDays(365).from, []);
  const [statsDisplaySettings, setStatsDisplaySettings] = useState<StatisticsDisplaySettings>(
    DEFAULT_STATISTICS_DISPLAY_SETTINGS,
  );
  const initialRangeDays = defaultRangeDays[DEFAULT_STATISTICS_DISPLAY_SETTINGS.defaultDateRange];
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
    queryKey: ['usage', 'websites', 'summaries', range.from, range.to],
    queryFn: () => api.websiteUsageSummaries(range.from, range.to),
  });

  const activity = useMemo(() => filterActivityRange(calendar.data ?? [], range), [calendar.data, range]);
  const summary = useMemo(() => summarizeActivity(activity), [activity]);
  const trends = useMemo(() => buildTrendData(activity, growth.data, range), [activity, growth.data, range]);
  const topAttributes = useMemo(() => selectTopAttributes(growthOverview.data?.skills ?? []), [growthOverview.data]);
  const usageTrend = useMemo(() => buildUsageTrendData(usage.data, range), [usage.data, range]);
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
      >
        <FeatureSettingsButton title="Statistics settings">
          <StatisticsSettingsPopover
            settings={statsDisplaySettings}
            onChange={(patch) => setStatsDisplaySettings((s) => ({ ...s, ...patch }))}
          />
        </FeatureSettingsButton>
      </PageHeader>

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
          />
          <TrendCard
            id="focus-duration-trend"
            title="Focus duration trend"
            summary={`${formatMinutes(summary.focusedMinutes)} across ${formatNumber(summary.focusSessions)} sessions`}
            data={trends}
            dataKey="focusedMinutes"
            valueLabel="Minutes"
            color="#2563eb"
          />
          <TrendCard
            id="experience-gained-trend"
            title="Experience gained trend"
            summary={`${formatNumber(growth.data?.totalXp ?? 0)} XP earned in this period`}
            data={trends}
            dataKey="xp"
            valueLabel="XP"
            color="#d97706"
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
  className = '',
}: {
  id: string;
  title: string;
  summary: string;
  data: TrendPoint[];
  dataKey: 'completedTasks' | 'focusedMinutes' | 'xp';
  valueLabel: string;
  color: string;
  className?: string;
}) {
  const hasData = data.some((point) => point[dataKey] > 0);
  return (
    <Card className={`overflow-hidden shadow-[var(--shadow-soft)] ${className}`}>
      <CardHeader className="border-b bg-muted/20 p-5">
        <CardTitle id={id} className="text-base">
          {title}
        </CardTitle>
        <p className="mt-1 text-xs text-muted-foreground">{summary}</p>
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
  const coveragePercent = summary?.engagementCoverage
    ? Math.round((summary.engagementCoverage.observedActiveSeconds / (summary.engagementCoverage.totalActiveSeconds || 1)) * 100)
    : null;

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
                  {coveragePercent !== null && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {coveragePercent}% coverage
                    </span>
                  )}
                </div>
                <p className="font-mono text-2xl font-bold tracking-[-0.03em] text-primary">
                  {summary.totalEngagedSeconds != null
                    ? formatActiveDuration(summary.totalEngagedSeconds)
                    : 'Unavailable'}
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
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Applications</p>
                  {topApps.map((app, index) => (
                    <div
                      key={app.bundleId}
                      className="flex items-center gap-3 rounded-[var(--itu-radius-s)] px-1.5 py-1.5 hover:bg-muted/30"
                    >
                      <AppUsageIcon name={app.displayName} color={usageColors[index % usageColors.length]} />
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
      ) : !summary || summary.totalActiveSeconds <= 0 ? (
        <ChartEmptyState message="No synced website activity in this period." />
      ) : (
        <Card className="overflow-hidden shadow-[var(--shadow-soft)]">
          <CardHeader className="flex-row items-end justify-between gap-4 border-b bg-muted/20 p-5">
            <div>
              <CardTitle className="text-base">Domains and visited URLs</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Open a domain to inspect its individual URL totals.</p>
            </div>
            <p className="shrink-0 font-mono text-2xl font-bold tracking-[-0.03em]">
              {formatActiveDuration(summary.totalActiveSeconds)}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {(summary.hostnames ?? summary.topHostnames).map((domain) => {
              const urls = summary.urlDetails.filter((detail) => detail.hostname === domain.hostname);
              const detailedSeconds = urls.reduce((total, detail) => total + detail.activeSeconds, 0);
              const legacySeconds = Math.max(0, domain.activeSeconds - detailedSeconds);
              return (
                <details key={domain.hostname} className="group border-b border-[var(--itu-border-soft)] last:border-0">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 transition-colors hover:bg-[var(--itu-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    <DomainMark hostname={domain.hostname} />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{domain.hostname}</span>
                    <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-muted-foreground">
                      {formatActiveDuration(domain.activeSeconds)}
                    </span>
                    <span
                      className="text-xs text-muted-foreground transition-transform group-open:rotate-90"
                      aria-hidden="true"
                    >
                      ›
                    </span>
                  </summary>
                  <div className="border-t border-[var(--itu-border-soft)] bg-[var(--itu-surface-2)] px-5 py-3">
                    {urls.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        URL detail is unavailable for earlier hostname-only activity.
                      </p>
                    ) : (
                      <div className="divide-y divide-[var(--itu-border-soft)]">
                        {urls.map((detail) => (
                          <div key={detail.url} className="flex items-start gap-3 py-2.5">
                            <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                            <p
                              className="min-w-0 flex-1 break-all text-xs leading-5 text-foreground"
                              title={detail.url}
                            >
                              {detail.url}
                            </p>
                            <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                              {formatActiveDuration(detail.activeSeconds)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {legacySeconds > 0 && urls.length > 0 ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatActiveDuration(legacySeconds)} of earlier activity has domain-only detail.
                      </p>
                    ) : null}
                  </div>
                </details>
              );
            })}
          </CardContent>
        </Card>
      )}
    </section>
  );
}

function DomainMark({ hostname }: { hostname: string }) {
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--itu-radius-s)] bg-[var(--itu-mint-100)] text-sm font-bold text-[var(--itu-teal-700)]"
      aria-hidden="true"
    >
      {hostname.charAt(0).toLocaleUpperCase() || '?'}
    </span>
  );
}

const usageColors = [
  'var(--itu-teal-600)',
  'var(--itu-sync-blue, #4f8fcf)',
  'var(--itu-amber-500)',
  'var(--itu-teal-400)',
  'var(--itu-coral-500)',
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
