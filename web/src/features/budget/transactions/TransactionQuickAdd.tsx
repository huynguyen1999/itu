import { useState } from 'react';
import { useBudgetCategories } from '../budgetQueries';
import { useCreateBudgetTransaction } from '../budgetMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Plus, X } from 'lucide-react';
import { budgetDateTimeInputToIso, currentBudgetDateTimeInput } from '../budgetPeriod';

interface TransactionQuickAddProps {
  onClose?: () => void;
}

export function TransactionQuickAdd({ onClose }: TransactionQuickAddProps) {
  const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [merchant, setMerchant] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [transactionAt, setTransactionAt] = useState(currentBudgetDateTimeInput);
  const [note, setNote] = useState('');

  const { data: categories = [] } = useBudgetCategories();
  const createTx = useCreateBudgetTransaction();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;
    if (!categoryId && categories.length > 0) {
      setCategoryId(categories[0].id);
    }

    createTx.mutate(
      {
        type,
        amount: parsedAmount,
        currency: 'VND',
        categoryId: categoryId || (categories[0]?.id ?? ''),
        merchant: merchant.trim() || undefined,
        paymentMethod,
        transactionAt: budgetDateTimeInputToIso(transactionAt),
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          setAmount('');
          setMerchant('');
          setNote('');
          onClose?.();
        },
      },
    );
  };

  return (
    <Card className="p-4 border-primary/20 space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">New Transaction</h4>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={type === 'EXPENSE' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setType('EXPENSE')}
          >
            Expense
          </Button>
          <Button
            type="button"
            variant={type === 'INCOME' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setType('INCOME')}
          >
            Income
          </Button>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">Amount</label>
          <Input
            type="number"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
            className="font-mono text-sm font-bold"
            autoFocus
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
              required
            >
              <option value="">Select Category...</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs"
            >
              <option value="CASH">Cash</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="CARD">Card</option>
              <option value="E_WALLET">E-Wallet</option>
              <option value="OTHER">Other</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Merchant / Description</label>
            <Input
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="e.g. Supermarket"
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Date / Time</label>
            <Input
              type="datetime-local"
              value={transactionAt}
              onChange={(e) => setTransactionAt(e.target.value)}
              className="text-xs font-mono"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-medium text-muted-foreground">Note (Optional)</label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add note..."
            className="text-xs"
          />
        </div>

        <Button type="submit" size="sm" className="w-full gap-1.5 mt-2" disabled={createTx.isPending}>
          <Plus className="w-4 h-4" />
          Save Transaction
        </Button>
      </form>
    </Card>
  );
}
