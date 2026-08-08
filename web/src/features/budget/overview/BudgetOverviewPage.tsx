import { useState } from 'react';
import { useBudgetOverview } from '../budgetQueries';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { ChevronLeft, ChevronRight, Plus, ArrowUpRight, ArrowDownRight, Wallet, PieChart } from 'lucide-react';
import { Link } from 'react-router-dom';

export function BudgetOverviewPage() {
  const [period, setPeriod] = useState(() => new Date().toISOString().substring(0, 7));
  const { data: overview, isLoading, isError } = useBudgetOverview(period);

  const handlePrevMonth = () => {
    const [y, m] = period.split('-').map(Number);
    const date = new Date(y, m - 2, 1);
    setPeriod(date.toISOString().substring(0, 7));
  };

  const handleNextMonth = () => {
    const [y, m] = period.split('-').map(Number);
    const date = new Date(y, m, 1);
    setPeriod(date.toISOString().substring(0, 7));
  };

  const formatCurrency = (val: number, curr = 'VND') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, maximumFractionDigits: 0 }).format(val);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-10 bg-muted/40 rounded-lg w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="h-32 bg-muted/40 rounded-xl" />
          <div className="h-32 bg-muted/40 rounded-xl" />
          <div className="h-32 bg-muted/40 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !overview) {
    return (
      <div className="p-8 text-center text-muted-foreground border rounded-xl">
        Failed to load budget overview. Please try again.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Month Picker */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-mono text-sm font-semibold">{overview.period}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        <Link to="/budget/transactions?add=true">
          <Button size="sm" className="gap-1.5">
            <Plus className="w-4 h-4" />
            Add Transaction
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-5 space-y-2 border-emerald-500/20 bg-emerald-500/5">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span>TOTAL INCOME</span>
            <ArrowUpRight className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-foreground">
            {formatCurrency(overview.income, overview.currency)}
          </p>
        </Card>

        <Card className="p-5 space-y-2 border-rose-500/20 bg-rose-500/5">
          <div className="flex items-center justify-between text-xs font-semibold text-rose-600 dark:text-rose-400">
            <span>TOTAL SPENT</span>
            <ArrowDownRight className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-foreground">
            {formatCurrency(overview.spent, overview.currency)}
          </p>
        </Card>

        <Card className="p-5 space-y-2 border-primary/20 bg-primary/5">
          <div className="flex items-center justify-between text-xs font-semibold text-primary">
            <span>REMAINING BUDGET</span>
            <Wallet className="w-4 h-4" />
          </div>
          <p className="text-2xl font-bold font-mono tracking-tight text-foreground">
            {formatCurrency(overview.remainingBudget, overview.currency)}
          </p>
          <p className="text-xs text-muted-foreground">
            Overall Limit: {formatCurrency(overview.overallBudget, overview.currency)}
          </p>
        </Card>
      </div>

      {/* Category Budgets Breakdown */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <PieChart className="w-4 h-4 text-emerald-500" />
            Category Budgets
          </h3>
          <Link to="/budget/budgets" className="text-xs text-primary hover:underline font-medium">
            Manage limits &rarr;
          </Link>
        </div>

        {overview.categories.length === 0 ? (
          <Card className="p-8 text-center text-xs text-muted-foreground">
            No categories defined.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {overview.categories.map((catStat: any) => (
              <Card key={catStat.category.id} className="p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">{catStat.category.name}</span>
                  <span className="font-mono text-muted-foreground">
                    {formatCurrency(catStat.spent, overview.currency)} / {formatCurrency(catStat.budget, overview.currency)}
                  </span>
                </div>

                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      catStat.percentage > 90 ? 'bg-rose-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, catStat.percentage)}%` }}
                  />
                </div>

                <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                  <span>{catStat.percentage}% used</span>
                  <span>Remaining: {formatCurrency(catStat.remaining, overview.currency)}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
