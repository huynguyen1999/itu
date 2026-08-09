import { useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useBudgetOverview } from '../budgetQueries';
import { Button } from '@/shared/ui/button';
import { CategoryIcon } from '../budgetCategoryIcons';
import { currentBudgetPeriod, shiftBudgetPeriod } from '../budgetPeriod';

export function BudgetOverviewPage() {
  const [period, setPeriod] = useState(currentBudgetPeriod);
  const { data: overview, isLoading, isError } = useBudgetOverview(period);

  const moveMonth = (offset: number) => {
    setPeriod(shiftBudgetPeriod(period, offset));
  };

  const formatCurrency = (value: number, currency = 'VND') =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value);

  if (isLoading) return <div className="space-y-4 animate-pulse"><div className="h-10 w-48 rounded-lg bg-muted/40" /><div className="h-20 rounded-xl bg-muted/40" /><div className="h-64 rounded-xl bg-muted/40" /></div>;
  if (isError || !overview) return <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Could not load this month. Try again.</div>;

  const assigned = overview.categories.reduce((sum: number, category: any) => sum + Number(category.budget || 0), 0);
  const available = overview.categories.reduce((sum: number, category: any) => sum + Number(category.remaining || 0), 0);
  const readyToAssign = Number(overview.income || 0) - assigned;
  const overspent = overview.categories.filter((category: any) => Number(category.spent || 0) > Number(category.budget || 0)).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moveMonth(-1)} aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-mono text-sm font-semibold">{overview.period}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => moveMonth(1)} aria-label="Next month"><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <Link to="/budget/transactions?add=true"><Button size="sm" className="gap-1.5"><Plus className="h-4 w-4" />Add transaction</Button></Link>
      </div>

      <section className={`rounded-xl border p-5 ${readyToAssign < 0 ? 'border-destructive/40 bg-destructive/5' : 'border-primary/25 bg-primary/5'}`}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ready to assign</p>
            <p className="mt-1 font-mono text-3xl font-bold text-foreground">{formatCurrency(readyToAssign, overview.currency)}</p>
            <p className="mt-1 text-sm text-muted-foreground">Income minus category assignments</p>
          </div>
          {readyToAssign < 0 && <p className="flex items-center gap-2 text-sm font-medium text-destructive"><AlertTriangle className="h-4 w-4" />Assignments exceed income</p>}
        </div>
        <div className="mt-5 grid grid-cols-1 gap-3 border-t border-border/60 pt-4 sm:grid-cols-3">
          <Summary label="Assigned" value={formatCurrency(assigned, overview.currency)} />
          <Summary label="Activity" value={formatCurrency(overview.spent, overview.currency)} />
          <Summary label="Available" value={formatCurrency(available, overview.currency)} />
        </div>
      </section>

      <div className="flex items-center justify-between">
        <div><h2 className="text-base font-semibold text-foreground">Categories</h2><p className="text-sm text-muted-foreground">Give each category a job, then spend from its available balance.</p></div>
        {overspent > 0 && <span className="text-xs font-semibold text-destructive">{overspent} over budget</span>}
      </div>

      <div className="overflow-hidden rounded-xl border border-border/70 bg-card">
        <div className="hidden grid-cols-[minmax(0,1fr)_150px_150px_150px] gap-4 border-b border-border/70 bg-muted/20 px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <span>Category</span><span>Assigned</span><span>Activity</span><span>Available</span>
        </div>
        {overview.categories.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Create a category to start assigning money.</div> : overview.categories.map((category: any) => {
          const isOverspent = Number(category.remaining) < 0 || Number(category.spent) > Number(category.budget);
          return <div key={category.category.id} className="grid grid-cols-1 gap-2 border-b border-border/60 px-4 py-4 last:border-0 md:grid-cols-[minmax(0,1fr)_150px_150px_150px] md:items-center md:gap-4">
            <span className="flex items-center gap-2 font-medium text-foreground"><CategoryIcon name={category.category.icon || category.category.name} color={category.category.color} />{category.category.name}</span>
            <Metric label="Assigned" value={formatCurrency(category.budget, overview.currency)} />
            <Metric label="Activity" value={formatCurrency(category.spent, overview.currency)} />
            <Metric label="Available" value={formatCurrency(category.remaining, overview.currency)} tone={isOverspent ? 'danger' : undefined} />
          </div>;
        })}
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-mono text-base font-semibold text-foreground">{value}</p></div>;
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return <div className="flex items-center justify-between md:block"><p className="text-xs text-muted-foreground md:hidden">{label}</p><p className={`font-mono text-sm font-semibold ${tone === 'danger' ? 'text-destructive' : 'text-foreground'}`}>{value}</p></div>;
}
