import { useState } from 'react';
import { useBudgetCategories, useRecurringExpenses } from '../budgetQueries';
import { useArchiveRecurringExpense, useConfirmRecurringExpense, useCreateRecurringExpense, useSkipRecurringExpense, useUpdateRecurringExpense } from '../budgetMutations';
import type { RecurringExpense, RecurringFrequency } from '@/shared/api/budgetApi';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

const formatCurrency = (value: string) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(value));
const today = () => new Date().toISOString().slice(0, 10);

export function BudgetRecurringPage() {
  const { data: recurring = [], isLoading } = useRecurringExpenses();
  const { data: categories = [] } = useBudgetCategories();
  const confirm = useConfirmRecurringExpense();
  const skip = useSkipRecurringExpense();
  const create = useCreateRecurringExpense();
  const update = useUpdateRecurringExpense();
  const archive = useArchiveRecurringExpense();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('MONTHLY');
  const [startDate, setStartDate] = useState(today());
  const [editName, setEditName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editFrequency, setEditFrequency] = useState<RecurringFrequency>('MONTHLY');
  const [editStartDate, setEditStartDate] = useState(today());

  const beginEdit = (expense: RecurringExpense) => {
    setEditing(expense);
    setEditName(expense.name ?? '');
    setEditAmount(expense.amount);
    setEditCategoryId(expense.categoryId);
    setEditFrequency(expense.frequency);
    setEditStartDate(expense.startDate.slice(0, 10));
  };

  if (isLoading) return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading recurring expenses...</div>;

  return <div className="space-y-3">
    <div className="flex justify-end"><Button size="sm" onClick={() => setShowCreate((value) => !value)}>{showCreate ? 'Close' : 'Add recurring expense'}</Button></div>
    {showCreate && <Card className="space-y-3 p-4"><div className="grid gap-2 sm:grid-cols-2">
      <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Name (optional)" aria-label="Recurring expense name" />
      <Input type="number" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Amount" aria-label="Recurring expense amount" />
      <select value={categoryId || categories[0]?.id || ''} onChange={(event) => setCategoryId(event.target.value)} className="rounded-md border border-input bg-background px-2 text-xs" aria-label="Recurring expense category">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      <select value={frequency} onChange={(event) => setFrequency(event.target.value as RecurringFrequency)} className="rounded-md border border-input bg-background px-2 text-xs" aria-label="Recurring expense frequency"><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select>
      <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} aria-label="Recurring expense start date" />
    </div><div className="flex justify-end"><Button size="sm" disabled={create.isPending || !amount || !(categoryId || categories[0]?.id)} onClick={() => { const selectedCategoryId = categoryId || categories[0]?.id; if (!selectedCategoryId) return; create.mutate({ name: name || undefined, amount, categoryId: selectedCategoryId, frequency, startDate }, { onSuccess: () => { setShowCreate(false); setName(''); setAmount(''); } }); }}>Save recurring expense</Button></div></Card>}
    {editing && <Card className="space-y-3 border-primary/30 p-4"><div className="flex items-center justify-between"><p className="text-sm font-semibold">Edit recurring expense</p><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button></div><div className="grid gap-2 sm:grid-cols-2">
      <Input value={editName} onChange={(event) => setEditName(event.target.value)} placeholder="Name (optional)" aria-label="Edit recurring expense name" />
      <Input type="number" min="0" value={editAmount} onChange={(event) => setEditAmount(event.target.value)} aria-label="Edit recurring expense amount" />
      <select value={editCategoryId} onChange={(event) => setEditCategoryId(event.target.value)} className="rounded-md border border-input bg-background px-2 text-xs" aria-label="Edit recurring expense category">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
      <select value={editFrequency} onChange={(event) => setEditFrequency(event.target.value as RecurringFrequency)} className="rounded-md border border-input bg-background px-2 text-xs" aria-label="Edit recurring expense frequency"><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option><option value="YEARLY">Yearly</option></select>
      <Input type="date" value={editStartDate} onChange={(event) => setEditStartDate(event.target.value)} aria-label="Edit recurring expense start date" />
    </div><div className="flex justify-end"><Button size="sm" disabled={update.isPending || !editAmount || !editCategoryId} onClick={() => update.mutate({ id: editing.id, data: { name: editName || null, amount: editAmount, categoryId: editCategoryId, frequency: editFrequency, startDate: editStartDate } }, { onSuccess: () => setEditing(null) })}>Save changes</Button></div></Card>}
    {recurring.length === 0 ? <Card className="p-8 text-center text-sm text-muted-foreground">No recurring expenses yet.</Card> : recurring.map((expense) => {
      const due = expense.isActive && expense.nextDueDate.slice(0, 10) <= today();
      return <Card key={expense.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{expense.name || expense.merchant || expense.category}</p><p className="text-xs text-muted-foreground">{expense.frequency.toLowerCase()} · next due {expense.nextDueDate.slice(0, 10)}</p></div><div className="flex items-center gap-2"><span className="font-mono text-sm">{formatCurrency(expense.amount)}</span>{due && <><Button size="sm" onClick={() => confirm.mutate(expense.id)}>Confirm</Button><Button size="sm" variant="outline" onClick={() => skip.mutate(expense.id)}>Skip</Button></>}<Button size="sm" variant="outline" onClick={() => beginEdit(expense)}>Edit</Button><Button size="sm" variant="ghost" onClick={() => archive.mutate(expense.id)}>Archive</Button></div></Card>;
    })}
  </div>;
}
