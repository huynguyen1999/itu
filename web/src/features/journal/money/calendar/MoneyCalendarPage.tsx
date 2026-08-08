import { useState } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useJournalEntries } from '../../journalQueries';
import type { JournalEntry } from '../../journal.types';

export function MoneyCalendarPage() {
  const { data: entries = [] } = useJournalEntries({ kind: 'EXPENSE' });
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number>(new Date().getDate());

  const expenses = entries.filter((e) => e.kind === 'EXPENSE' && e.expense);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  // Aggregate by day number
  const dayAggregates: Record<number, { spent: number; income: number; items: JournalEntry[] }> = {};

  for (const e of expenses) {
    if (!e.expense) continue;
    const d = new Date(e.entryDate);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const dayNum = d.getDate();
      if (!dayAggregates[dayNum]) {
        dayAggregates[dayNum] = { spent: 0, income: 0, items: [] };
      }
      const amt = Number(e.expense.amount) || 0;
      if (e.expense.type === 'INCOME') {
        dayAggregates[dayNum].income += amt;
      } else {
        dayAggregates[dayNum].spent += amt;
      }
      dayAggregates[dayNum].items.push(e);
    }
  }

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const monthName = currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  const selectedDayData = dayAggregates[selectedDay] || { spent: 0, income: 0, items: [] };

  return (
    <div className="space-y-6">
      {/* Month Selector Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={prevMonth}
            className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-lg font-bold text-foreground min-w-[140px] text-center">{monthName}</h2>
          <button
            type="button"
            onClick={nextMonth}
            className="p-1.5 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Calendar Grid (col-span-8) */}
        <div className="md:col-span-8 rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
          <div className="grid grid-cols-7 text-center text-xs font-bold text-muted-foreground pb-2 border-b border-border/40">
            <span>Sun</span>
            <span>Mon</span>
            <span>Tue</span>
            <span>Wed</span>
            <span>Thu</span>
            <span>Fri</span>
            <span>Sat</span>
          </div>

          <div className="grid grid-cols-7 gap-1 text-xs">
            {/* Empty slots for first week padding */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="h-16 rounded-xl border border-transparent" />
            ))}

            {/* Days of month */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const agg = dayAggregates[dayNum];
              const isSelected = selectedDay === dayNum;

              return (
                <div
                  key={dayNum}
                  onClick={() => setSelectedDay(dayNum)}
                  className={`h-16 p-1.5 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                      : 'border-border/40 bg-muted/10 hover:bg-muted/30'
                  }`}
                >
                  <span className={`font-bold text-xs ${isSelected ? 'text-emerald-400' : 'text-foreground'}`}>
                    {dayNum}
                  </span>

                  {agg && (agg.spent > 0 || agg.income > 0) && (
                    <div className="text-[10px] font-mono text-right leading-tight">
                      {agg.spent > 0 && <span className="text-rose-400 block">-₫{(agg.spent / 1000).toFixed(0)}k</span>}
                      {agg.income > 0 && <span className="text-emerald-400 block">+₫{(agg.income / 1000).toFixed(0)}k</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Day Details Panel (col-span-4) */}
        <div className="md:col-span-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/40">
            <h3 className="text-sm font-bold text-foreground">
              {monthName} {selectedDay}
            </h3>
            <span className="text-xs font-mono text-muted-foreground">{selectedDayData.items.length} items</span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-muted/20 border border-border/40">
              <span className="text-[10px] text-muted-foreground font-medium">Spent</span>
              <p className="font-bold text-rose-400">₫{selectedDayData.spent.toLocaleString()}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-muted/20 border border-border/40">
              <span className="text-[10px] text-muted-foreground font-medium">Income</span>
              <p className="font-bold text-emerald-400">₫{selectedDayData.income.toLocaleString()}</p>
            </div>
          </div>

          <div className="divide-y divide-border/40 text-xs">
            {selectedDayData.items.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No transactions logged on this date.</p>
            ) : (
              selectedDayData.items.map((item) => {
                const exp = item.expense!;
                const isInc = exp.type === 'INCOME';
                return (
                  <div key={item.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-foreground">{exp.merchant || item.title}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {exp.category} · {exp.paymentMethod}
                      </p>
                    </div>
                    <span className={`font-mono font-bold ${isInc ? 'text-emerald-400' : 'text-foreground'}`}>
                      {isInc ? '+' : '-'}₫{Number(exp.amount).toLocaleString()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
