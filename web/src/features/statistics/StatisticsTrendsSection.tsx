import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { ChartEmptyState, QueryError } from './StatisticsSectionStates';
import { formatMinutes, formatNumber, type TrendPoint } from './statistics';
import type { StatisticsDomainKey } from './StatisticsSettingsPopover';

export function StatisticsTrendsSection({ visibleDomains, trends, summary, growthXp, showComparison, hasError, onRetry }: {
  visibleDomains: StatisticsDomainKey[];
  trends: TrendPoint[];
  summary: { completedTasks: number; focusedMinutes: number; focusSessions: number };
  growthXp: number;
  showComparison: boolean;
  hasError: boolean;
  onRetry: () => void;
}) {
  if (hasError) return <QueryError message="Some statistics could not be loaded." onRetry={onRetry} />;
  return <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3" aria-label="Activity trends">
    {visibleDomains.includes('productivity') ? <>
      <TrendCard id="task-completion-trend" title="Task completion trend" summary={`${formatNumber(summary.completedTasks)} completed in this period`} data={trends} dataKey="completedTasks" valueLabel="Tasks" color="#0f766e" showComparison={showComparison} />
      <TrendCard id="focus-duration-trend" title="Focus duration trend" summary={`${formatMinutes(summary.focusedMinutes)} across ${formatNumber(summary.focusSessions)} sessions`} data={trends} dataKey="focusedMinutes" valueLabel="Minutes" color="#2563eb" showComparison={showComparison} />
    </> : null}
    {visibleDomains.includes('growth') ? <TrendCard id="experience-gained-trend" title="Experience gained trend" summary={`${formatNumber(growthXp)} XP earned in this period`} data={trends} dataKey="xp" valueLabel="XP" color="#d97706" showComparison={showComparison} className="lg:col-span-2 xl:col-span-1" /> : null}
  </section>;
}

function TrendCard({ id, title, summary, data, dataKey, valueLabel, color, showComparison, className = '' }: {
  id: string; title: string; summary: string; data: TrendPoint[]; dataKey: 'completedTasks' | 'focusedMinutes' | 'xp'; valueLabel: string; color: string; showComparison: boolean; className?: string;
}) {
  const hasData = data.some((point) => point[dataKey] > 0);
  return <Card className={`overflow-hidden shadow-[var(--shadow-soft)] ${className}`}><CardHeader className="border-b bg-muted/20 p-5"><CardTitle id={id} className="text-base">{title}</CardTitle>{showComparison ? <p className="mt-1 text-xs text-muted-foreground">{summary}</p> : null}</CardHeader><CardContent className="p-5">{hasData ? <div className="h-56" aria-hidden="true"><ResponsiveContainer width="100%" height="100%"><AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}><defs><linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.28} /><stop offset="100%" stopColor={color} stopOpacity={0.02} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} minTickGap={24} /><YAxis tickLine={false} axisLine={false} fontSize={10} width={34} allowDecimals={false} /><Tooltip formatter={(value) => [formatNumber(Number(value)), valueLabel]} /><Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2.5} fill={`url(#${id}-fill)`} dot={false} activeDot={{ r: 4 }} /></AreaChart></ResponsiveContainer></div> : <ChartEmptyState message={`No ${valueLabel.toLowerCase()} recorded in this period.`} />}</CardContent></Card>;
}
