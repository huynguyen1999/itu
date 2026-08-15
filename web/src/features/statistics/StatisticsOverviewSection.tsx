import type { LucideIcon } from 'lucide-react';
import { BookOpenCheck, CheckCircle2, Clock3, Dumbbell, Layers3, ListChecks, MonitorPlay, PlusCircle, Timer, WalletCards, Zap } from 'lucide-react';
import { Card, CardContent } from '@/shared/ui/card';
import type { StatisticsDomainKey } from './StatisticsSettingsPopover';

type Summary = {
  completedTasks: number;
  focusSessions: number;
  focusedMinutes: number;
  reviewSessions: number;
  reviews: number;
  cardsCreated: number;
};

type QueryState = { isLoading: boolean; isError: boolean };
type HabitQuery = QueryState & { data?: { days?: Array<{ status: string; scheduled: boolean }> } };
type NumericQuery = QueryState & { data?: { totalWorkouts?: number; totalTrainingMinutes?: number; totalXp?: number; spent?: string; changeAmount?: string } };
type UsageQuery = QueryState & { data?: { totalActiveSeconds?: number } };

export function StatisticsOverviewSection({
  visibleDomains,
  calendarState,
  growthState,
  summary,
  comparisonSummary,
  calendarComparisonReady,
  habits,
  habitsComparison,
  gym,
  gymComparison,
  budget,
  growth,
  growthComparison,
  usage,
}: {
  visibleDomains: StatisticsDomainKey[];
  calendarState: QueryState;
  growthState: QueryState;
  summary: Summary;
  comparisonSummary: Summary;
  calendarComparisonReady: boolean;
  habits: HabitQuery;
  habitsComparison: HabitQuery;
  gym: NumericQuery;
  gymComparison: NumericQuery;
  budget: NumericQuery;
  growth: NumericQuery;
  growthComparison: NumericQuery;
  usage: UsageQuery;
}) {
  const habitTotals = totals(habits.data?.days);
  const comparisonHabitTotals = totals(habitsComparison.data?.days);
  const habitRate = rate(habitTotals);
  const comparisonHabitRate = rate(comparisonHabitTotals);
  const show = (domain: StatisticsDomainKey) => visibleDomains.includes(domain);

  return (
    <section aria-labelledby="overview-heading">
      <div className="mb-3">
        <h2 id="overview-heading" className="text-lg font-semibold">Data overview</h2>
        <p className="mt-1 text-xs text-muted-foreground">Totals inside the selected period.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {show('productivity') ? <>
          <MetricCard icon={CheckCircle2} label="Tasks completed" value={queryValue(calendarState, format(summary.completedTasks))} comparison={calendarComparisonReady ? delta(summary.completedTasks, comparisonSummary.completedTasks) : undefined} />
          <MetricCard icon={Timer} label="Focus sessions" value={queryValue(calendarState, format(summary.focusSessions))} />
          <MetricCard icon={Clock3} label="Focus duration" value={queryValue(calendarState, minutes(summary.focusedMinutes))} comparison={calendarComparisonReady ? delta(summary.focusedMinutes, comparisonSummary.focusedMinutes, minutes) : undefined} />
        </> : null}
        {show('habits') ? <MetricCard icon={ListChecks} label="Habit completion" value={queryValue(habits, habitRate)} comparison={habitsComparisonReady(habitsComparison) ? percentageDelta(habitTotals, comparisonHabitTotals) : undefined} /> : null}
        {show('learning') ? <>
          <MetricCard icon={BookOpenCheck} label="Review sessions" value={queryValue(calendarState, format(summary.reviewSessions))} />
          <MetricCard icon={Layers3} label="Cards reviewed" value={queryValue(calendarState, format(summary.reviews))} />
          <MetricCard icon={PlusCircle} label="Cards created" value={queryValue(calendarState, format(summary.cardsCreated))} />
        </> : null}
        {show('gym') ? <MetricCard icon={Dumbbell} label="Workouts" value={queryValue(gym, format(gym.data?.totalWorkouts ?? 0))} comparison={!gym.isError && gymComparison.data ? delta(gym.data?.totalWorkouts ?? 0, gymComparison.data.totalWorkouts ?? 0) : undefined} /> : null}
        {show('budget') ? <MetricCard icon={WalletCards} label="Spent" value={queryValue(budget, budget.data?.spent ?? '0.00')} comparison={!budget.isError ? budget.data?.changeAmount : undefined} /> : null}
        {show('growth') ? <MetricCard icon={Zap} label="XP gained" value={queryValue(growthState, format(growth.data?.totalXp ?? 0))} comparison={!growthState.isError && growthComparison.data ? delta(growth.data?.totalXp ?? 0, growthComparison.data.totalXp ?? 0) : undefined} /> : null}
        {show('digital') ? <MetricCard icon={MonitorPlay} label="App activity" value={queryValue(usage, duration(usage.data?.totalActiveSeconds ?? 0))} /> : null}
      </div>
    </section>
  );
}

function MetricCard({ icon: Icon, label, value, comparison }: { icon: LucideIcon; label: string; value: string; comparison?: string }) {
  return <Card className="min-w-0 shadow-[var(--shadow-soft)]"><CardContent className="p-4"><Icon className="h-4 w-4 text-primary" aria-hidden="true" /><p className="mt-4 text-xl font-semibold tabular-nums text-foreground">{value}</p><p className="mt-1 text-xs leading-4 text-muted-foreground">{label}</p>{comparison ? <p className="mt-2 text-[11px] text-muted-foreground">{comparison} vs previous</p> : null}</CardContent></Card>;
}

function totals(days: Array<{ status: string; scheduled: boolean }> | undefined) {
  return { completed: days?.filter((day) => day.status === 'COMPLETED').length ?? 0, scheduled: days?.filter((day) => day.scheduled).length ?? 0 };
}

function rate(value: { completed: number; scheduled: number }) { return value.scheduled ? `${Math.round((value.completed / value.scheduled) * 100)}%` : '—'; }
function percentageDelta(current: { completed: number; scheduled: number }, previous: { completed: number; scheduled: number }) {
  if (!current.scheduled || !previous.scheduled) return undefined;
  const delta = current.completed / current.scheduled * 100 - previous.completed / previous.scheduled * 100;
  return `${delta >= 0 ? '+' : ''}${Math.round(delta)} pp`;
}
function habitsComparisonReady(query: HabitQuery) { return Boolean(query.data) && !query.isError; }
function queryValue(query: QueryState, value: string) { return query.isError ? 'Unavailable' : query.isLoading ? '—' : value; }
function delta(current: number, previous: number, formatValue: (value: number) => string = format) { const value = current - previous; return `${value >= 0 ? '+' : ''}${formatValue(value)}`; }
function format(value: number) { return new Intl.NumberFormat().format(value); }
function minutes(value: number) { return value >= 60 ? `${Math.floor(value / 60)}h ${value % 60}m` : `${value}m`; }
function duration(seconds: number) { return seconds >= 3600 ? `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m` : `${Math.floor(seconds / 60)}m`; }
