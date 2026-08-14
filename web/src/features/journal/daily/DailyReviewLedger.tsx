import type { ReactNode } from 'react';
import { CheckCircle2, Clock, Dumbbell, Flame, Globe, Sparkles, Wallet, Zap } from 'lucide-react';

export function DailyReviewLedger({
  metrics,
  isLoading,
  onRefresh,
}: {
  metrics?: Record<string, any>;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  const tasksCompleted = metrics?.tasks?.completed ?? 0;
  const focusMinutes = metrics?.focus?.minutes ?? 0;
  const habitsCompleted = metrics?.habits?.completed ?? 0;
  const habitsScheduled = metrics?.habits?.scheduled ?? 0;
  const workoutsCount = metrics?.gym?.workouts ?? metrics?.workouts?.sessions ?? 0;
  const spending = metrics?.budget?.spendingByCurrency ?? metrics?.expenses;
  const learningReviews = metrics?.learning?.reviews ?? 0;
  const appActiveSeconds = metrics?.appUsage?.activeSeconds;
  const websiteActiveSeconds = metrics?.websiteUsage?.activeSeconds;

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Today&apos;s ledger
        </span>
        <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground/70">
          {isLoading ? (
            <span>Loading metrics…</span>
          ) : (
            <button
              type="button"
              onClick={onRefresh}
              className="text-muted-foreground hover:text-primary hover:underline"
            >
              Refresh
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-y divide-border/50 sm:grid-cols-4 sm:divide-y-0 lg:grid-cols-8">
        <LedgerItem
          icon={<CheckCircle2 className="h-3 w-3 text-primary" />}
          label="Tasks"
          value={
            <>
              {tasksCompleted} <small className="text-[10px] font-normal text-muted-foreground">done</small>
            </>
          }
          delta={{ text: `${tasksCompleted} done`, type: tasksCompleted > 0 ? 'up' : 'flat' }}
        />
        <LedgerItem
          icon={<Clock className="h-3 w-3 text-primary" />}
          label="Focus"
          value={`${Math.floor(focusMinutes / 60)}h ${focusMinutes % 60}m`}
          delta={{ text: `${focusMinutes}m tracked`, type: focusMinutes > 0 ? 'up' : 'flat' }}
        />
        <LedgerItem
          icon={<Zap className="h-3 w-3 text-amber-500" />}
          label="Habits"
          value={
            <>
              {habitsCompleted}
              <small className="text-[10px] font-normal text-muted-foreground">/{habitsScheduled}</small>
            </>
          }
          delta={{
            text: `${habitsScheduled > 0 ? Math.round((habitsCompleted / habitsScheduled) * 100) : 0}% rate`,
            type: habitsScheduled > 0 && habitsCompleted / habitsScheduled >= 0.7 ? 'up' : 'flat',
          }}
        />
        <LedgerItem
          icon={<Dumbbell className="h-3 w-3 text-primary" />}
          label="Training"
          value={
            <>
              {workoutsCount} <small className="text-[10px] font-normal text-muted-foreground">sess.</small>
            </>
          }
          delta={{
            text: workoutsCount > 0 ? `${workoutsCount} logged` : '0 logged',
            type: workoutsCount > 0 ? 'up' : 'flat',
          }}
        />
        <LedgerItem
          icon={<Wallet className="h-3 w-3 text-primary" />}
          label="Spending"
          value={formatSpending(spending)}
          delta={{ text: spending ? 'tracked' : 'no expenses', type: 'flat' }}
        />
        <LedgerItem
          icon={<Sparkles className="h-3 w-3 text-primary" />}
          label="Learning"
          value={
            <>
              {learningReviews} <small className="text-[10px] font-normal text-muted-foreground">rev.</small>
            </>
          }
          delta={{
            text: learningReviews > 0 ? `${learningReviews} rev.` : '0 rev.',
            type: learningReviews > 0 ? 'up' : 'flat',
          }}
        />
        <LedgerItem
          icon={<Flame className="h-3 w-3 text-amber-500" />}
          label="Apps"
          value={formatDuration(appActiveSeconds)}
          delta={{ text: 'tracked', type: 'flat' }}
        />
        <LedgerItem
          icon={<Globe className="h-3 w-3 text-primary" />}
          label="Websites"
          value={formatDuration(websiteActiveSeconds)}
          delta={{ text: 'tracked', type: 'flat' }}
        />
      </div>
    </section>
  );
}

function LedgerItem({
  icon,
  label,
  value,
  delta,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  delta: { text: string; type: 'up' | 'down' | 'flat' };
}) {
  return (
    <div className="flex flex-col gap-1 p-3 sm:border-l sm:border-border/50 sm:first:border-l-0">
      <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
        <span className="opacity-90">{icon}</span>
        <span>{label}</span>
      </div>
      <div className="font-mono text-sm font-medium tracking-tight text-foreground sm:text-base">{value}</div>
      <div
        className={`w-fit rounded-full px-1.5 py-0.5 font-mono text-[9.5px] ${
          delta.type === 'up'
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : delta.type === 'down'
              ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
              : 'bg-muted/70 text-muted-foreground'
        }`}
      >
        {delta.text}
      </div>
    </div>
  );
}

function formatDuration(value: unknown) {
  const seconds = typeof value === 'number' ? value : 0;
  return seconds >= 3600 ? `${Math.round(seconds / 3600)}h` : `${Math.round(seconds / 60)}m`;
}

function formatCompactMoney(amount: number): string {
  if (!amount || isNaN(amount)) return '0';
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return amount.toLocaleString();
}

function formatSpending(spending: unknown): string {
  if (!spending || typeof spending !== 'object') return '₫0';
  const entries = Object.entries(spending as Record<string, unknown>);
  if (!entries.length) return '₫0';
  const vnd = (spending as Record<string, number>).VND;
  if (vnd !== undefined) return `₫${formatCompactMoney(Number(vnd))}`;
  return entries.map(([currency, amount]) => `${currency} ${formatCompactMoney(Number(amount))}`).join(', ');
}
