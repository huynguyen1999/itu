import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBudgetExpenses, useBudgetCategories } from '../budgetQueries';
import { useUpdateBudgetExpense, useDeleteBudgetExpense } from '../budgetMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { TransactionQuickAdd } from './TransactionQuickAdd';
import { CategoryIcon } from '../budgetCategoryIcons';
import { Plus, Trash2, Edit2 } from 'lucide-react';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { currentBudgetPeriod } from '../budgetPeriod';
import type { Expense, PaymentMethod } from '@/shared/api/budgetApi';

const formatCurrency = (value: string | number, currency = 'VND') =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));

export function TransactionsPage() {
  const [searchParams] = useSearchParams();
  const [showAdd, setShowAdd] = useState(() => searchParams.get('add') === 'true');
  const [period, setPeriod] = useState(currentBudgetPeriod);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const { data: categories = [] } = useBudgetCategories();
  const { data: expenses = [], isLoading } = useBudgetExpenses({ period, categoryId: selectedCategory || undefined, paymentMethod: paymentMethod || undefined, search: search || undefined });
  const updateExpense = useUpdateBudgetExpense();
  const deleteExpense = useDeleteBudgetExpense();

  const handleSaveEdit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingExpense) return;
    updateExpense.mutate({ id: editingExpense.id, data: { amount: editingExpense.amount, categoryId: editingExpense.categoryId, merchant: editingExpense.merchant, paymentMethod: editingExpense.paymentMethod, expenseDate: editingExpense.expenseDate, note: editingExpense.note } }, { onSuccess: () => setEditingExpense(null) });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search merchant or note" className="w-52 text-xs" aria-label="Search expenses" />
          <Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="w-36 text-xs" aria-label="Expense month" />
          <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs" aria-label="Expense category">
            <option value="">All categories</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod | '')} className="rounded-md border border-input bg-background px-3 py-1.5 text-xs" aria-label="Payment method">
            <option value="">All payment methods</option><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="E_WALLET">E-wallet</option><option value="OTHER">Other</option>
          </select>
        </div>
        <Button size="sm" onClick={() => setShowAdd((value) => !value)} className="gap-1.5"><Plus className="h-4 w-4" />{showAdd ? 'Close add' : 'Add expense'}</Button>
      </div>

      {showAdd && <TransactionQuickAdd onClose={() => setShowAdd(false)} />}

      {editingExpense && <Card className="space-y-3 border-emerald-500/30 bg-emerald-500/5 p-4"><div className="flex items-center justify-between text-xs font-semibold"><span>Edit expense</span><Button variant="ghost" size="sm" onClick={() => setEditingExpense(null)}>Cancel</Button></div><form onSubmit={handleSaveEdit} className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3"><Input type="number" min="0" value={editingExpense.amount} onChange={(event) => setEditingExpense({ ...editingExpense, amount: event.target.value })} aria-label="Amount" /><Input value={editingExpense.merchant ?? ''} onChange={(event) => setEditingExpense({ ...editingExpense, merchant: event.target.value })} aria-label="Merchant" /><select value={editingExpense.categoryId} onChange={(event) => setEditingExpense({ ...editingExpense, categoryId: event.target.value })} className="rounded-md border border-input bg-background px-2 py-1.5 text-xs" aria-label="Category">{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select><Input type="date" value={editingExpense.expenseDate.slice(0, 10)} onChange={(event) => setEditingExpense({ ...editingExpense, expenseDate: event.target.value })} aria-label="Date" /><div className="sm:col-span-3 flex justify-end"><Button type="submit" size="sm" disabled={updateExpense.isPending}>Save changes</Button></div></form></Card>}

      <p className="text-xs text-muted-foreground">{expenses.length} expenses · <span className="font-mono font-semibold text-foreground">{formatCurrency(expenses.reduce((total, expense) => total + Number(expense.amount), 0))}</span></p>
      <div className="space-y-2">{isLoading ? <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading expenses...</div> : expenses.length === 0 ? <Card className="p-8 text-center text-xs text-muted-foreground">No expenses found. Add your first expense above.</Card> : expenses.map((expense) => {
        const category = categories.find((item) => item.id === expense.categoryId);
        return <Card key={expense.id} className="flex items-center justify-between gap-4 p-3 transition-colors hover:bg-muted/30"><div className="flex min-w-0 items-center gap-3"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-rose-500/10 text-rose-500"><CategoryIcon name={category?.icon || category?.name || expense.category} color={category?.color ?? undefined} className="h-4 w-4" /></div><div className="min-w-0 space-y-0.5"><p className="truncate text-xs font-semibold">{expense.merchant || expense.category || 'Expense'}</p><div className="flex items-center gap-2 text-[11px] text-muted-foreground"><span>{category?.name || expense.category || 'Uncategorized'}</span><span aria-hidden="true">&bull;</span><span className="font-mono">{expense.expenseDate.slice(0, 10)}</span></div></div></div><div className="flex shrink-0 items-center gap-2"><span className="font-mono text-xs font-bold">−{formatCurrency(expense.amount)}</span><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingExpense(expense)} aria-label={`Edit ${expense.merchant || expense.category || 'expense'}`}><Edit2 className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => setDeleteTarget(expense)} aria-label={`Move ${expense.merchant || expense.category || 'expense'} to Trash`}><Trash2 className="h-3.5 w-3.5" /></Button></div></Card>;
      })}</div>

      <ConfirmDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && !deleteExpense.isPending && setDeleteTarget(null)} title="Move expense to Trash?" description={deleteTarget ? `“${deleteTarget.merchant || deleteTarget.category || 'This expense'}” can be restored from Trash.` : ''} confirmLabel="Move to Trash" isPending={deleteExpense.isPending} onConfirm={() => { if (!deleteTarget) return; deleteExpense.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) }); }} />
    </div>
  );
}
