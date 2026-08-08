import { CheckCircle2, AlertTriangle, AlertCircle, HelpCircle } from 'lucide-react';

interface CategoryBudgetItem {
  id: string;
  category: string;
  budget: number;
  spent: number;
}

const sampleBudgets: CategoryBudgetItem[] = [
  { id: 'b1', category: 'Food', budget: 3000000, spent: 1450000 },
  { id: 'b2', category: 'Transport', budget: 1500000, spent: 720000 },
  { id: 'b3', category: 'Entertainment', budget: 1000000, spent: 950000 },
  { id: 'b4', category: 'Shopping', budget: 2000000, spent: 2150000 },
];

export function BudgetPage() {
  const overallLimit = 12000000;
  const totalSpent = sampleBudgets.reduce((acc, b) => acc + b.spent, 0);
  const remaining = overallLimit - totalSpent;
  const overallPct = Math.min(100, Math.round((totalSpent / overallLimit) * 100));

  const getStatus = (spent: number, budget: number) => {
    if (budget <= 0) return { label: 'No budget', icon: HelpCircle, classNames: 'text-muted-foreground' };
    const pct = (spent / budget) * 100;
    if (pct >= 100) return { label: 'Exceeded', icon: AlertCircle, classNames: 'text-rose-500 bg-rose-500/10 border-rose-500/20' };
    if (pct >= 85) return { label: 'Near limit', icon: AlertTriangle, classNames: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
    return { label: 'Healthy', icon: CheckCircle2, classNames: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
  };

  return (
    <div className="space-y-6">
      {/* Overall Month Budget Card */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">August Budget</h2>
          <span className="text-xs font-mono font-bold text-emerald-400">{overallPct}% spent</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1">
            <span className="text-[11px] text-muted-foreground font-medium">Overall Limit</span>
            <p className="text-lg font-bold text-foreground">₫{overallLimit.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1">
            <span className="text-[11px] text-muted-foreground font-medium">Total Spent</span>
            <p className="text-lg font-bold text-rose-400">₫{totalSpent.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1">
            <span className="text-[11px] text-muted-foreground font-medium">Remaining</span>
            <p className="text-lg font-bold text-emerald-400">₫{remaining.toLocaleString()}</p>
          </div>
        </div>

        <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${overallPct >= 90 ? 'bg-rose-500' : 'bg-emerald-500'}`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Category Budgets */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <h3 className="text-sm font-bold text-foreground">Category Targets</h3>

        <div className="space-y-4">
          {sampleBudgets.map((b) => {
            const rem = b.budget - b.spent;
            const pct = Math.min(100, Math.round((b.spent / b.budget) * 100));
            const status = getStatus(b.spent, b.budget);
            const StatusIcon = status.icon;

            return (
              <div key={b.id} className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">{b.category}</span>
                    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${status.classNames}`}>
                      <StatusIcon className="w-3 h-3" />
                      {status.label}
                    </span>
                  </div>

                  <div className="text-right text-xs">
                    <span className="font-bold text-foreground">₫{b.spent.toLocaleString()} spent</span>
                    <span className="text-muted-foreground font-mono ml-2">/ ₫{b.budget.toLocaleString()} budget</span>
                  </div>
                </div>

                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${pct >= 100 ? 'bg-rose-500' : pct >= 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex justify-end text-[11px] font-medium text-muted-foreground">
                  <span>{rem >= 0 ? `₫${rem.toLocaleString()} remaining` : `₫${Math.abs(rem).toLocaleString()} over budget`}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
