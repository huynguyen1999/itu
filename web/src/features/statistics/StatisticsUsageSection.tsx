import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { UsageSummary } from '@/shared/api/types';
import { AuthenticatedImage } from '@/shared/ui/AuthenticatedImage';
import { Card, CardContent, CardHeader } from '@/shared/ui/card';
import { Skeleton } from '@/shared/ui/skeleton';
import { ChartEmptyState, QueryError } from './StatisticsSectionStates';
import { axisActiveDuration, engagementPercent, formatActiveDuration } from './statistics';

export function UsageSection({
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

