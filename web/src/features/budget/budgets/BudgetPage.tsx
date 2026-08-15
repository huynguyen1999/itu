import { useState } from 'react';
import { useBudgetCategories, useBudgetOverview } from '../budgetQueries';
import { useDeleteBudgetCategoryLimit, useUpdateBudgetCategoryLimit, useUpdateBudgetPeriodLimit } from '../budgetMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { currentBudgetPeriod } from '../budgetPeriod';

const formatCurrency = (value: string | number, currency = 'VND') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));

export function BudgetPage() {
  const [period, setPeriod] = useState(currentBudgetPeriod);
  const { data: summary, isLoading } = useBudgetOverview(period);
  const { data: categories = [] } = useBudgetCategories();
  const updateOverall = useUpdateBudgetPeriodLimit();
  const updateLimit = useUpdateBudgetCategoryLimit();
  const deleteLimit = useDeleteBudgetCategoryLimit();
  const [overall, setOverall] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [limit, setLimit] = useState('');

  if (isLoading || !summary) return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading budget limits...</div>;

  const saveOverall = () => {
    if (overall.trim() === '') return;
    updateOverall.mutate({ period, overallLimit: overall });
    setOverall('');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between"><div><h1 className="text-lg font-semibold">Budgets</h1><p className="text-xs text-muted-foreground">Optional monthly and category spending limits.</p></div><Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="w-40 font-mono text-xs" /></div>
      <Card className="space-y-3 border-primary/20 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-bold uppercase tracking-wider">Monthly spending limit</h3><p className="text-xs text-muted-foreground">Optional overall limit for {summary.period}</p></div><div className="flex gap-2"><Input type="number" min="0" value={overall} onChange={(event) => setOverall(event.target.value)} placeholder={summary.overallLimit ?? 'No limit'} className="w-36 font-mono text-xs" /><Button size="sm" onClick={saveOverall} disabled={updateOverall.isPending}>Save</Button>{summary.overallLimit !== null && <Button size="sm" variant="outline" onClick={() => updateOverall.mutate({ period, overallLimit: null })}>Remove</Button>}</div></div>
        <p className="font-mono text-2xl font-bold text-primary">{summary.overallLimit === null ? 'No monthly limit' : formatCurrency(summary.overallLimit)}</p>
        <p className={`text-sm ${summary.remaining !== null && Number(summary.remaining) < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>Spent {formatCurrency(summary.spent)} · Remaining {summary.remaining === null ? 'No limit' : formatCurrency(summary.remaining)}</p>
      </Card>

      <div className="space-y-3"><h3 className="text-sm font-semibold">Category limits</h3>{categories.length === 0 ? <Card className="p-8 text-center text-xs text-muted-foreground">No categories available.</Card> : categories.map((category) => {
        const row = summary.categories.find((item) => item.category.id === category.id);
        const isEditing = editingCategory === category.id;
        const spent = Number(row?.spent ?? 0);
        const configuredLimit = row?.limit ?? null;
        const percentage = configuredLimit && Number(configuredLimit) > 0 ? Math.min(100, (spent / Number(configuredLimit)) * 100) : 0;
        return <Card key={category.id} className="space-y-3 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{category.name}</p><p className="text-xs text-muted-foreground">{formatCurrency(spent)} spent · {configuredLimit === null ? 'No limit' : `${formatCurrency(configuredLimit)} limit`}</p></div><div className="flex gap-2">{isEditing ? <><Input type="number" min="0" value={limit} onChange={(event) => setLimit(event.target.value)} className="w-28 font-mono text-xs" /><Button size="sm" onClick={() => { updateLimit.mutate({ period, categoryId: category.id, limit }); setEditingCategory(null); }}>Save</Button><Button size="sm" variant="outline" onClick={() => setEditingCategory(null)}>Cancel</Button></> : <><Button size="sm" variant="outline" onClick={() => { setEditingCategory(category.id); setLimit(configuredLimit ?? ''); }}>{configuredLimit === null ? 'Set limit' : 'Edit limit'}</Button>{configuredLimit !== null && <Button size="sm" variant="ghost" onClick={() => deleteLimit.mutate({ period, categoryId: category.id })}>Remove</Button>}</>}</div></div><div className="h-2 overflow-hidden rounded-full bg-muted"><div className={`h-full ${row?.remaining !== null && Number(row?.remaining) < 0 ? 'bg-destructive' : 'bg-emerald-500'}`} style={{ width: `${percentage}%` }} /></div></Card>;
      })}</div>
    </div>
  );
}
