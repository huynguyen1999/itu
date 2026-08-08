import { PieChart } from 'lucide-react';
import { useJournalEntries } from '../../journalQueries';

export function BudgetPage() {
  const { data: entries = [], isLoading } = useJournalEntries({ kind: 'EXPENSE' });

  const now = new Date();
  const monthLabel = now.toLocaleString('default', { month: 'long', year: 'numeric' });
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

  const monthExpenses = entries.filter((e) => {
    if (e.kind !== 'EXPENSE' || !e.expense) return false;
    const d = new Date(e.entryDate);
    return d >= monthStart && d <= monthEnd;
  });

  let totalExpense = 0;
  let totalIncome = 0;
  const categorySpentMap: Record<string, number> = {};

  for (const e of monthExpenses) {
    if (!e.expense) continue;
    const amt = Number(e.expense.amount) || 0;
    if (e.expense.type === 'INCOME') {
      totalIncome += amt;
    } else {
      totalExpense += amt;
      const rawCat = e.expense.category || 'OTHER';
      const cat = rawCat.charAt(0).toUpperCase() + rawCat.slice(1).toLowerCase();
      categorySpentMap[cat] = (categorySpentMap[cat] || 0) + amt;
    }
  }

  const categoryItems = Object.entries(categorySpentMap).map(([category, spent]) => ({
    category,
    spent,
  }));

  return (
    <div className="space-y-6">
      {/* Overall Month Spending Overview */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-foreground">{monthLabel} Spending Overview</h2>
          <span className="text-xs font-mono font-bold text-emerald-400">
            {monthExpenses.length} transaction{monthExpenses.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1">
            <span className="text-[11px] text-muted-foreground font-medium">Total Income</span>
            <p className="text-lg font-bold text-emerald-400">₫{totalIncome.toLocaleString()}</p>
          </div>
          <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1">
            <span className="text-[11px] text-muted-foreground font-medium">Total Spent</span>
            <p className="text-lg font-bold text-rose-400">₫{totalExpense.toLocaleString()}</p>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <PieChart className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-foreground">Category Breakdown</h3>
        </div>

        {categoryItems.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            No expenses recorded for {monthLabel}. Add transactions using the "+ Add transaction" button.
          </p>
        ) : (
          <div className="space-y-4">
            {categoryItems.map((b) => {
              const pct = totalExpense > 0 ? Math.min(100, Math.round((b.spent / totalExpense) * 100)) : 0;

              return (
                <div key={b.category} className="p-4 rounded-xl border border-border/60 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-foreground">{b.category}</span>
                    <div className="text-right text-xs">
                      <span className="font-bold text-foreground">₫{b.spent.toLocaleString()}</span>
                      <span className="text-muted-foreground font-mono ml-2">({pct}% of total)</span>
                    </div>
                  </div>

                  <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
