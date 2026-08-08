import { useState } from 'react';
import { useBudgetTransactions } from '../budgetQueries';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function BudgetCalendarPage() {
  const [period, setPeriod] = useState(() => new Date().toISOString().substring(0, 7));
  const { data: transactions = [], isLoading } = useBudgetTransactions({ period });

  const [year, month] = period.split('-').map(Number);

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();

  const handlePrevMonth = () => {
    const date = new Date(year, month - 2, 1);
    setPeriod(date.toISOString().substring(0, 7));
  };

  const handleNextMonth = () => {
    const date = new Date(year, month, 1);
    setPeriod(date.toISOString().substring(0, 7));
  };

  // Group transactions by day of month
  const txByDay: Record<number, { spent: number; income: number; count: number }> = {};
  for (const tx of transactions) {
    const txDate = new Date(tx.transactionAt);
    const day = txDate.getDate();
    if (!txByDay[day]) txByDay[day] = { spent: 0, income: 0, count: 0 };
    txByDay[day].count++;
    if (tx.type === 'INCOME') {
      txByDay[day].income += tx.amount;
    } else {
      txByDay[day].spent += tx.amount;
    }
  }

  const formatCurrency = (val: number) => {
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(0)}k`;
    return String(val);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Budget Calendar</h3>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handlePrevMonth}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="font-mono text-sm font-semibold">{period}</span>
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleNextMonth}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Card className="p-4">
        {/* Days Header */}
        <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted-foreground pb-2 border-b border-border/60">
          <span>Sun</span>
          <span>Mon</span>
          <span>Tue</span>
          <span>Wed</span>
          <span>Thu</span>
          <span>Fri</span>
          <span>Sat</span>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-muted-foreground animate-pulse">Loading calendar...</div>
        ) : (
          <div className="grid grid-cols-7 gap-1 pt-2">
            {/* Empty slots for first week */}
            {Array.from({ length: firstDayOfWeek }).map((_, idx) => (
              <div key={`empty-${idx}`} className="h-20 p-1 bg-muted/10 rounded-md" />
            ))}

            {/* Days of Month */}
            {Array.from({ length: daysInMonth }).map((_, idx) => {
              const day = idx + 1;
              const stats = txByDay[day];

              return (
                <div
                  key={day}
                  className="h-20 p-1.5 border border-border/40 rounded-md flex flex-col justify-between hover:bg-muted/20 transition-colors"
                >
                  <span className="font-mono text-xs font-semibold text-foreground">{day}</span>

                  {stats && (
                    <div className="space-y-0.5 text-[10px] font-mono">
                      {stats.spent > 0 && (
                        <p className="text-rose-500 font-bold truncate">-{formatCurrency(stats.spent)}</p>
                      )}
                      {stats.income > 0 && (
                        <p className="text-emerald-500 font-bold truncate">+{formatCurrency(stats.income)}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
