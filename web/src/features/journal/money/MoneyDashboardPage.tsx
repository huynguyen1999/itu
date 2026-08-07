import { useState } from 'react';
import { Plus, Wallet, ArrowDownRight, ArrowUpRight, Filter, Calendar, Search, UtensilsCrossed, Car, ShoppingBag, Zap, Heart, Gamepad2, Dumbbell, Plane, GraduationCap, MoreHorizontal } from 'lucide-react';
import { useJournalEntries } from '../journalQueries';
import { ExpenseQuickAddModal } from './ExpenseQuickAddModal';
import type { ExpenseCategory, JournalEntry } from '../journal.types';

const CATEGORY_ICONS: Record<ExpenseCategory, any> = {
  FOOD: UtensilsCrossed,
  TRANSPORT: Car,
  SHOPPING: ShoppingBag,
  BILLS: Zap,
  ENTERTAINMENT: Gamepad2,
  HEALTH: Heart,
  FITNESS: Dumbbell,
  TRAVEL: Plane,
  EDUCATION: GraduationCap,
  OTHER: MoreHorizontal,
};

export function MoneyDashboardPage() {
  const { data: entries = [], isLoading, refetch } = useJournalEntries({ kind: 'EXPENSE' });
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  // Filter expense entries
  const expenses = entries.filter((e) => e.kind === 'EXPENSE' && e.expense);

  // Compute monthly totals & category breakdown
  let totalSpent = 0;
  const categoryTotals: Record<string, number> = {};

  for (const entry of expenses) {
    if (!entry.expense) continue;
    const val = Number(entry.expense.amount) || 0;
    totalSpent += val;
    const cat = entry.expense.category || 'OTHER';
    categoryTotals[cat] = (categoryTotals[cat] || 0) + val;
  }

  // Filtered transactions list
  const filteredExpenses = selectedCategory === 'ALL'
    ? expenses
    : expenses.filter((e) => e.expense?.category === selectedCategory);

  // Group by date
  const groupedByDate: Record<string, JournalEntry[]> = {};
  for (const entry of filteredExpenses) {
    const dateKey = entry.entryDate ? new Date(entry.entryDate).toISOString().split('T')[0] : 'Unknown';
    if (!groupedByDate[dateKey]) groupedByDate[dateKey] = [];
    groupedByDate[dateKey].push(entry);
  }

  const sortedDates = Object.keys(groupedByDate).sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Money Tracker</h1>
              <p className="text-xs text-muted-foreground">Personal finance & transaction tracking</p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-md"
        >
          <Plus className="w-4 h-4" />
          Add transaction
        </button>
      </div>

      {/* Monthly Spend Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Spent this month
            </span>
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
              <ArrowDownRight className="w-3.5 h-3.5" /> 8% vs last month
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-foreground">
              ₫{totalSpent.toLocaleString()}
            </span>
            <span className="text-xs font-medium text-muted-foreground">VND</span>
          </div>

          {/* Top Category Progress Bars */}
          <div className="space-y-2 pt-2 border-t border-border/40">
            <p className="text-[11px] font-medium text-muted-foreground">Top Spending Categories</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Object.entries(categoryTotals)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([cat, amt]) => {
                  const pct = totalSpent > 0 ? Math.round((amt / totalSpent) * 100) : 0;
                  const Icon = CATEGORY_ICONS[cat as ExpenseCategory] || MoreHorizontal;
                  return (
                    <div key={cat} className="p-2.5 rounded-xl border border-border/60 bg-muted/20 space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium text-foreground flex items-center gap-1.5">
                          <Icon className="w-3.5 h-3.5 text-emerald-500" />
                          {cat}
                        </span>
                        <span className="font-semibold text-foreground">₫{amt.toLocaleString()}</span>
                      </div>
                      <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Account Balance Overview */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm flex flex-col justify-between space-y-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Accounts
            </span>
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg border border-border/40 bg-muted/20">
                <span className="font-medium text-foreground">Momo / E-Wallet</span>
                <span className="font-mono text-muted-foreground">Active</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg border border-border/40 bg-muted/20">
                <span className="font-medium text-foreground">Cash</span>
                <span className="font-mono text-muted-foreground">Active</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg border border-border/40 bg-muted/20">
                <span className="font-medium text-foreground">Vietcombank</span>
                <span className="font-mono text-muted-foreground">Active</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsAddModalOpen(true)}
            className="w-full py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-dashed border-border rounded-xl hover:bg-muted/40 transition-colors"
          >
            + Quick Add Transaction
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          type="button"
          onClick={() => setSelectedCategory('ALL')}
          className={`px-3 py-1.5 rounded-xl border transition-colors whitespace-nowrap ${
            selectedCategory === 'ALL'
              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-semibold'
              : 'border-border bg-card text-muted-foreground hover:text-foreground'
          }`}
        >
          All Transactions
        </button>
        {Object.keys(CATEGORY_ICONS).map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-xl border transition-colors whitespace-nowrap ${
              selectedCategory === cat
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-semibold'
                : 'border-border bg-card text-muted-foreground hover:text-foreground'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Transactions List Grouped by Date */}
      <div className="space-y-4">
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Loading transactions...
          </div>
        ) : sortedDates.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-border bg-card/40 p-8 space-y-3">
            <Wallet className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium text-foreground">No transactions recorded</p>
            <p className="text-xs text-muted-foreground">Click "+ Add transaction" to log your first expense.</p>
          </div>
        ) : (
          sortedDates.map((dateStr) => {
            const dayEntries = groupedByDate[dateStr];
            return (
              <div key={dateStr} className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wider">
                  <span>{dateStr === new Date().toISOString().split('T')[0] ? 'Today' : dateStr}</span>
                  <span>
                    -₫
                    {dayEntries
                      .reduce((acc, e) => acc + (Number(e.expense?.amount) || 0), 0)
                      .toLocaleString()}
                  </span>
                </div>

                <div className="rounded-2xl border border-border/80 bg-card divide-y divide-border/40 overflow-hidden shadow-sm">
                  {dayEntries.map((entry) => {
                    const exp = entry.expense!;
                    const cat = exp.category || 'OTHER';
                    const Icon = CATEGORY_ICONS[cat as ExpenseCategory] || MoreHorizontal;
                    const displayMerchant = exp.merchant || entry.title || cat;

                    return (
                      <div
                        key={entry.id}
                        className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">{displayMerchant}</p>
                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                              <span className="px-1.5 py-0.5 rounded bg-muted font-medium">{cat}</span>
                              <span>•</span>
                              <span>{exp.paymentMethod}</span>
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <p className="text-sm font-bold text-foreground">
                            -₫{Number(exp.amount).toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            {exp.transactionAt
                              ? new Date(exp.transactionAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                              : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Add Modal */}
      <ExpenseQuickAddModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => void refetch()}
      />
    </div>
  );
}
