import { useState } from 'react';
import { useBudgetReport } from '../budgetQueries';
import { currentBudgetPeriod } from '../budgetPeriod';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';

const formatCurrency = (value: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value));

export function BudgetReportsPage() {
  const [period, setPeriod] = useState(currentBudgetPeriod);
  const { data: report, isLoading } = useBudgetReport(period);

  return <div className="space-y-4">
    <div className="flex items-center justify-between"><div><h1 className="text-lg font-semibold">Reports</h1><p className="text-xs text-muted-foreground">Expense aggregates for the selected month.</p></div><Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="w-40 font-mono text-xs" /></div>
    {isLoading || !report ? <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading reports...</div> : <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-4"><h2 className="mb-3 font-semibold">Spending over time</h2><div className="space-y-1 text-sm">{report.spendingOverTime.map((point) => <div key={point.date} className="flex justify-between gap-3"><span>{point.date}</span><span className="font-mono">{formatCurrency(point.amount)}</span></div>)}</div></Card>
      <Card className="p-4"><h2 className="mb-3 font-semibold">Category breakdown</h2><div className="space-y-1 text-sm">{report.categoryBreakdown.map((row) => <div key={row.categoryId} className="flex justify-between gap-3"><span>{row.category}</span><span className="font-mono">{formatCurrency(row.amount)} · {row.percentage.toFixed(1)}%</span></div>)}</div></Card>
      <Card className="p-4"><h2 className="mb-3 font-semibold">Monthly outflow</h2><div className="space-y-1 text-sm">{report.monthlyOutflow.map((row) => <div key={row.bucket} className="flex justify-between gap-3"><span>{row.bucket}</span><span className="font-mono">{formatCurrency(row.amount)}</span></div>)}</div></Card>
      <Card className="p-4"><h2 className="mb-3 font-semibold">Previous-month comparison</h2><div className="flex justify-between text-sm"><span>{formatCurrency(report.previousMonthComparison.current)} vs {formatCurrency(report.previousMonthComparison.previous)}</span><span className="font-mono">{report.previousMonthComparison.percentage === null ? '—' : `${report.previousMonthComparison.percentage.toFixed(1)}%`}</span></div></Card>
      <Card className="p-4"><h2 className="mb-3 font-semibold">Top merchants</h2><div className="space-y-1 text-sm">{report.topMerchants.map((row) => <div key={row.merchant} className="flex justify-between gap-3"><span>{row.merchant}</span><span className="font-mono">{formatCurrency(row.amount)} · {row.count}</span></div>)}</div></Card>
      <Card className="p-4"><h2 className="mb-3 font-semibold">Top categories</h2><div className="space-y-1 text-sm">{report.topCategories.map((row) => <div key={row.categoryId} className="flex justify-between gap-3"><span>{row.category}</span><span className="font-mono">{formatCurrency(row.amount)} · {row.count}</span></div>)}</div></Card>
    </div>}
  </div>;
}
