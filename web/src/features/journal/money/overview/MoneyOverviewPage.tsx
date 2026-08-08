import { useState } from 'react';
import { Plus, ChevronLeft, ChevronRight, ArrowDownRight, ArrowUpRight, Wallet, PieChart, ReceiptText } from 'lucide-react';
import { useJournalEntries } from '../../journalQueries';
import { TransactionQuickAdd } from '../transactions/TransactionQuickAdd';
import type { JournalEntry } from '../../journal.types';

export function MoneyOverviewPage() {
  const { data: entries = [], isLoading } = useJournalEntries({ kind: 'EXPENSE' });
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  const monthLabel = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Filter expenses for current selected month
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);

  const monthExpenses = entries.filter((e) => {
    if (e.kind !== 'EXPENSE' || !e.expense) return false;
    const d = new Date(e.entryDate);
    return d >= monthStart && d <= monthEnd;
  });

  let totalIncome = 0;
  let totalExpense = 0;
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

  const netBalance = totalIncome - totalExpense;

  // Actual category spending breakdown calculated from real journal entries
  const categorySpending = Object.entries(categorySpentMap).map(([category, spent]) => ({
    category,
    spent,
  }));

  // Recent transactions sorted by date
  const recentTransactions = [...monthExpenses]
    .sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime())
    .slice(0, 5);

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h1 className="text-xl font-extrabold text-foreground min-w-[140px] text-center">{monthLabel}</h1>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-md"
        >
          <Plus className="w-4 h-4" />
          Add transaction
        </button>
      </div>

      {/* Monthly Net Balance & Overview Card */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-6">
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Monthly Net Balance
          </p>
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-black ${netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {netBalance >= 0 ? '+' : ''}₫{netBalance.toLocaleString()}
            </span>
            <span className="text-xs font-semibold text-muted-foreground">VND</span>
          </div>
        </div>

        {/* Income / Expenses / Net Row */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-border/40 text-center">
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center justify-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
              Income
            </span>
            <p className="text-sm font-bold text-emerald-400">+₫{totalIncome.toLocaleString()}</p>
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center justify-center gap-1">
              <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />
              Expenses
            </span>
            <p className="text-sm font-bold text-rose-400">-₫{totalExpense.toLocaleString()}</p>
          </div>
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">Net</span>
            <p className={`text-sm font-bold ${netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {netBalance >= 0 ? '+' : ''}₫{netBalance.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Category Expenses Breakdown */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PieChart className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-foreground">Category Spending</h3>
          </div>
          <span className="text-xs text-muted-foreground">Actual monthly spending</span>
        </div>

        {categorySpending.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No expenses recorded for this month.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {categorySpending.map((b) => {
              const pct = totalExpense > 0 ? Math.min(100, Math.round((b.spent / totalExpense) * 100)) : 0;
              return (
                <div key={b.category} className="p-3 rounded-xl border border-border/60 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-foreground">{b.category}</span>
                    <span className="font-mono text-muted-foreground">
                      ₫{b.spent.toLocaleString()} ({pct}%)
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
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

      {/* Recent Transactions List */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ReceiptText className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-foreground">Recent Transactions</h3>
          </div>
        </div>

        {recentTransactions.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No recent transactions recorded.</p>
        ) : (
          <div className="divide-y divide-border/40">
            {recentTransactions.map((t) => {
              const exp = t.expense!;
              const isIncome = exp.type === 'INCOME';
              return (
                <div key={t.id} className="py-3 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-bold text-foreground">{exp.merchant || t.title}</p>
                    <p className="text-muted-foreground text-[11px]">
                      {exp.category} · {exp.paymentMethod}
                    </p>
                  </div>
                  <span className={`font-bold font-mono ${isIncome ? 'text-emerald-400' : 'text-foreground'}`}>
                    {isIncome ? '+' : '-'}₫{Number(exp.amount).toLocaleString()}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <TransactionQuickAdd isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
    </div>
  );
}
