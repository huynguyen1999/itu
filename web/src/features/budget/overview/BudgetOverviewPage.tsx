import { ChevronLeft, ChevronRight, Plus, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useBudgetOverview } from '../budgetQueries';
import { Button } from '@/shared/ui/button';
import { CategoryIcon } from '../budgetCategoryIcons';
import { currentBudgetPeriod, shiftBudgetPeriod } from '../budgetPeriod';

const formatCurrency = (value: string | number, currency = 'VND') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));

export function BudgetOverviewPage() {
  const [period, setPeriod] = useState(currentBudgetPeriod);
  const { data: summary, isLoading, isError } = useBudgetOverview(period);

  if (isLoading) return <div className="space-y-4 animate-pulse"><div className="h-10 w-48 rounded-lg bg-muted/40" /><div className="h-20 rounded-xl bg-muted/40" /><div className="h-64 rounded-xl bg-muted/40" /></div>;
  if (isError || !summary) return <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Could not load this month. Try again.</div>;

  const currency = 'VND';
  const overspent = summary.overallLimit !== null && Number(summary.remaining) < 0;
  const change = summary.changePercentage === null ? '—' : `${summary.changePercentage > 0 ? '+' : ''}${summary.changePercentage.toFixed(1)}%`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPeriod(shiftBudgetPeriod(period, -1))} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-mono text-sm font-semibold">{summary.period}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setPeriod(shiftBudgetPeriod(period, 1))} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Link to="/budget/expenses?add=true"><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" />Add expense</Button></Link>
      </div>

      <section className={`rounded-xl border p-5 ${overspent ? 'border-destructive/40 bg-destructive/5' : 'border-primary/25 bg-primary/5'}`}>
        <div className="grid gap-4 sm:grid-cols-3">
          <Summary label="Spent this month" value={formatCurrency(summary.spent, currency)} />
          <Summary label="Budget remaining" value={summary.remaining === null ? 'No monthly limit' : formatCurrency(summary.remaining, currency)} />
          <Summary label="Change vs previous month" value={change} />
        </div>
        {overspent && <p className="mt-4 flex items-center gap-2 text-sm font-medium text-destructive"><AlertTriangle className="h-4 w-4" />Monthly limit exceeded by {formatCurrency(Math.abs(Number(summary.remaining)), currency)}</p>}
      </section>

      <div className="flex items-center justify-between">
        <div><h2 className="text-base font-semibold text-foreground">Top spending categories</h2><p className="text-sm text-muted-foreground">See where this month&apos;s expenses went.</p></div>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        {summary.categories.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Add an expense category to get started.</div> : summary.categories.slice(0, 5).map((row) => {
          const isOver = row.remaining !== null && Number(row.remaining) < 0;
          return <div key={row.category.id} className="grid grid-cols-1 gap-2 border-b border-border/60 px-4 py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_150px_150px] sm:items-center sm:gap-4">
            <span className="flex items-center gap-2 font-medium text-foreground"><CategoryIcon name={row.category.icon || row.category.name} color={row.category.color ?? undefined} />{row.category.name}</span>
            <span className="font-mono text-sm text-muted-foreground">{formatCurrency(row.spent, currency)} spent</span>
            <span className={`font-mono text-sm font-semibold ${isOver ? 'text-destructive' : 'text-foreground'}`}>{row.limit === null ? 'No limit' : `${formatCurrency(row.limit, currency)} limit`}</span>
          </div>;
        })}
      </div>

      <section className="rounded-xl border border-border/70 bg-card p-4">
        <h2 className="mb-3 text-base font-semibold">Recent expenses</h2>
        <div className="space-y-2">
          {summary.recentExpenses.length === 0 ? <p className="text-sm text-muted-foreground">No expenses recorded this month.</p> : summary.recentExpenses.map((expense) => <div key={expense.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{expense.merchant || expense.category}</span><span className="font-mono">−{formatCurrency(expense.amount, currency)}</span></div>)}
        </div>
      </section>

      {summary.dueRecurring.length > 0 && <section className="rounded-xl border border-border/70 bg-card p-4"><h2 className="mb-3 text-base font-semibold">Due recurring expenses</h2><div className="space-y-2">{summary.dueRecurring.map((expense) => <div key={expense.id} className="flex items-center justify-between gap-3 text-sm"><span className="truncate">{expense.name || expense.merchant || expense.category}</span><span className="font-mono">{formatCurrency(expense.amount, currency)}</span></div>)}</div></section>}
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-mono text-base font-semibold text-foreground">{value}</p></div>;
}
