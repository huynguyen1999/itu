import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBudgetTransactions, useBudgetCategories } from '../budgetQueries';
import { useUpdateBudgetTransaction, useDeleteBudgetTransaction } from '../budgetMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { TransactionQuickAdd } from './TransactionQuickAdd';
import { CategoryIcon } from '../budgetCategoryIcons';
import { Plus, Trash2, Edit2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';

export function TransactionsPage() {
  const [searchParams] = useSearchParams();
  const [showAdd, setShowAdd] = useState(() => searchParams.get('add') === 'true');
  const [selectedCatId, setSelectedCatId] = useState<string>('');
  const [selectedType, setSelectedType] = useState<'EXPENSE' | 'INCOME' | ''>('');
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const { data: categories = [] } = useBudgetCategories();
  const { data: transactions = [], isLoading } = useBudgetTransactions({
    categoryId: selectedCatId || undefined,
    type: (selectedType as any) || undefined,
  });

  const updateTx = useUpdateBudgetTransaction();
  const deleteTx = useDeleteBudgetTransaction();

  const formatCurrency = (val: number, curr = 'VND') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, maximumFractionDigits: 0 }).format(val);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    updateTx.mutate(
      {
        id: editingTx.id,
        data: {
          amount: Number(editingTx.amount),
          type: editingTx.type,
          categoryId: editingTx.categoryId,
          merchant: editingTx.merchant,
          paymentMethod: editingTx.paymentMethod,
          note: editingTx.note,
          transactionAt: editingTx.transactionAt,
        },
      },
      {
        onSuccess: () => setEditingTx(null),
      },
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Filter and Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <select
            value={selectedCatId}
            onChange={(e) => setSelectedCatId(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs"
          >
            <option value="">All Categories</option>
            {categories.map((c: any) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as any)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs"
          >
            <option value="">All Types</option>
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
          </select>
        </div>

        <Button size="sm" onClick={() => setShowAdd((v) => !v)} className="gap-1.5">
          <Plus className="w-4 h-4" />
          {showAdd ? 'Close Add' : 'Add Transaction'}
        </Button>
      </div>

      {showAdd && <TransactionQuickAdd onClose={() => setShowAdd(false)} />}

      {/* Editing Transaction Modal / Inline */}
      {editingTx && (
        <Card className="p-4 border-emerald-500/30 bg-emerald-500/5 space-y-3">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>Edit Transaction</span>
            <Button variant="ghost" size="sm" onClick={() => setEditingTx(null)}>
              Cancel
            </Button>
          </div>

          <form onSubmit={handleSaveEdit} className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Amount</label>
              <Input
                type="number"
                value={editingTx.amount}
                onChange={(e) => setEditingTx({ ...editingTx, amount: e.target.value })}
                className="text-xs font-mono font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Merchant</label>
              <Input
                value={editingTx.merchant || ''}
                onChange={(e) => setEditingTx({ ...editingTx, merchant: e.target.value })}
                className="text-xs"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Category</label>
              <select
                value={editingTx.categoryId || ''}
                onChange={(e) => setEditingTx({ ...editingTx, categoryId: e.target.value })}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              >
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-3 flex justify-end gap-2">
              <Button type="submit" size="sm" disabled={updateTx.isPending}>
                Save Changes
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Transaction List */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading transactions...</div>
        ) : transactions.length === 0 ? (
          <Card className="p-8 text-center text-xs text-muted-foreground">
            No transactions found. Add your first transaction above!
          </Card>
        ) : (
          transactions.map((tx: any) => {
            const category = categories.find((item: any) => item.id === tx.categoryId);
            return (
              <Card
                key={tx.id}
                className="flex items-center justify-between gap-4 p-3 transition-colors hover:bg-muted/30"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs ${
                      tx.type === 'INCOME' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
                    }`}
                  >
                    {tx.type === 'INCOME' ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  </div>

                  <div className="min-w-0 space-y-0.5">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {tx.merchant || tx.category || 'Transaction'}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1">
                        <CategoryIcon
                          name={category?.icon || category?.name || tx.category}
                          color={category?.color}
                          className="h-3.5 w-3.5 shrink-0"
                        />
                        <span className="truncate">{category?.name || tx.category || 'Uncategorized'}</span>
                      </span>
                      <span aria-hidden="true">&bull;</span>
                      <span className="font-mono">{new Date(tx.transactionAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`font-mono text-xs font-bold ${
                      tx.type === 'INCOME' ? 'text-emerald-500' : 'text-foreground'
                    }`}
                  >
                    {tx.type === 'INCOME' ? '+' : '-'}{formatCurrency(tx.amount, tx.currency)}
                  </span>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => setEditingTx(tx)}
                      aria-label={`Edit ${tx.merchant || tx.category || 'transaction'}`}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteTarget(tx)}
                      aria-label={`Move ${tx.merchant || tx.category || 'transaction'} to Trash`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && !deleteTx.isPending && setDeleteTarget(null)}
        title="Move transaction to Trash?"
        description={
          deleteTarget
            ? `“${deleteTarget.merchant || deleteTarget.category || 'This transaction'}” can be restored from Trash.`
            : ''
        }
        confirmLabel="Move to Trash"
        isPending={deleteTx.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteTx.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        }}
      />
    </div>
  );
}
