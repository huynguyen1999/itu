import { useMemo } from 'react';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { axisActiveDuration, formatActiveDuration } from './statistics';

export interface AppUsageDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  app: {
    bundleId: string;
    displayName: string;
    activeSeconds: number;
    engagedSeconds?: number;
    iconUrl?: string | null;
  } | null;
  summary?: UsageSummary;
  color?: string;
}

interface ChartPoint {
  label: string;
  activeSeconds: number;
  engagedSeconds: number;
}

export function AppUsageDetailModal({
  isOpen,
  onClose,
  app,
  summary,
  color = 'var(--itu-teal-600)',
}: AppUsageDetailModalProps) {
  if (!app) return null;

  const totalScreenTime = summary?.totalActiveSeconds ?? 0;
  const percentOfTotal =
    totalScreenTime > 0 ? Math.round((app.activeSeconds / totalScreenTime) * 100) : 0;

  // Check if we have hourly buckets or daily buckets for this specific app
  const hourlyData = useMemo<ChartPoint[]>(() => {
    if (!summary?.hourlyApps || summary.hourlyApps.length === 0) return [];
    const filtered = summary.hourlyApps.filter((h) => h.bundleId === app.bundleId);
    if (filtered.length === 0) return [];

    // Create 24-hour array [00..23]
    const hours: ChartPoint[] = Array.from({ length: 24 }, (_, i) => ({
      label: `${String(i).padStart(2, '0')}:00`,
      activeSeconds: 0,
      engagedSeconds: 0,
    }));

    for (const item of filtered) {
      if (item.hour >= 0 && item.hour < 24) {
        hours[item.hour].activeSeconds += item.activeSeconds;
        hours[item.hour].engagedSeconds += item.engagedSeconds ?? 0;
      }
    }
    return hours;
  }, [summary?.hourlyApps, app.bundleId]);

  const dailyData = useMemo<ChartPoint[]>(() => {
    if (!summary?.dailyApps || summary.dailyApps.length === 0) return [];
    return summary.dailyApps
      .filter((d) => d.bundleId === app.bundleId)
      .map((d) => ({
        localDate: d.localDate,
        label: d.localDate.slice(5), // MM-DD
        activeSeconds: d.activeSeconds,
        engagedSeconds: d.engagedSeconds ?? 0,
      }))
      .sort((a, b) => (a.localDate ?? '').localeCompare(b.localDate ?? ''))
      .map((d) => ({
        label: d.label,
        activeSeconds: d.activeSeconds,
        engagedSeconds: d.engagedSeconds,
      }));
  }, [summary?.dailyApps, app.bundleId]);

  const rawDailyList = useMemo(() => {
    if (!summary?.dailyApps || summary.dailyApps.length === 0) return [];
    return summary.dailyApps
      .filter((d) => d.bundleId === app.bundleId)
      .sort((a, b) => a.localDate.localeCompare(b.localDate));
  }, [summary?.dailyApps, app.bundleId]);

  const showHourly = hourlyData.length > 0 && hourlyData.some((h) => h.activeSeconds > 0);
  const chartData: ChartPoint[] = showHourly ? hourlyData : dailyData;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl sm:max-w-2xl">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-3">
            <AuthenticatedImage
              src={app.iconUrl ?? null}
              alt=""
              className="h-11 w-11 shrink-0 rounded-[var(--itu-radius-s)] object-cover shadow-sm"
              fallback={
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--itu-radius-s)] text-base font-bold text-white shadow-sm"
                  style={{ backgroundColor: color }}
                  aria-hidden="true"
                >
                  {app.displayName.trim().charAt(0).toLocaleUpperCase() || '?'}
                </span>
              }
            />
            <div className="min-w-0 flex-1 text-left">
              <DialogTitle className="truncate text-lg font-bold">{app.displayName}</DialogTitle>
              <DialogDescription className="truncate font-mono text-xs text-muted-foreground">
                {app.bundleId}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Stats tiles */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg border bg-muted/20 p-3 text-left">
            <p className="text-xs font-medium text-muted-foreground">Screen Time</p>
            <p className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">
              {formatActiveDuration(app.activeSeconds)}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 text-left">
            <p className="text-xs font-medium text-muted-foreground">Engaged Time</p>
            <p className="mt-1 font-mono text-xl font-bold tracking-tight text-primary">
              {app.engagedSeconds != null ? formatActiveDuration(app.engagedSeconds) : '—'}
            </p>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 text-left">
            <p className="text-xs font-medium text-muted-foreground">% of Total Usage</p>
            <p className="mt-1 font-mono text-xl font-bold tracking-tight text-foreground">
              {percentOfTotal}%
            </p>
          </div>
        </div>

        {/* Timeline Chart */}
        {chartData.length > 0 && chartData.some((d) => d.activeSeconds > 0) ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {showHourly ? 'Hourly Activity (24 Hours)' : 'Daily Activity Timeline'}
              </p>
              <p className="text-xs text-muted-foreground">
                {summary?.from} {summary?.to && summary.to !== summary.from ? `– ${summary.to}` : ''}
              </p>
            </div>
            <div className="h-48 w-full rounded-lg border bg-card p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--itu-border-soft)" />
                  <XAxis
                    dataKey="label"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    minTickGap={16}
                    interval={showHourly ? 3 : 'preserveStartEnd'}
                  />
                  <YAxis
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                    width={38}
                    tickFormatter={(val) => axisActiveDuration(Number(val))}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--itu-surface-2)' }}
                    formatter={(value) => [formatActiveDuration(Number(value)), 'Active Time']}
                  />
                  <Bar
                    dataKey="activeSeconds"
                    name={app.displayName}
                    fill={color}
                    maxBarSize={18}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : null}

        {/* Breakdown table if multi-day */}
        {!showHourly && rawDailyList.length > 0 ? (
          <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-lg border bg-muted/10 p-2">
            <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Daily Breakdown
            </p>
            {rawDailyList.map((d) => (
              <div
                key={d.localDate}
                className="flex items-center justify-between px-2 py-1 text-xs hover:bg-muted/30 rounded"
              >
                <span className="font-mono text-muted-foreground">{d.localDate}</span>
                <span className="font-mono font-semibold">{formatActiveDuration(d.activeSeconds)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
