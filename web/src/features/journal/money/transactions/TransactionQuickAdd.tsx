import { useEffect, useRef, useState } from 'react';
import { X, ArrowDownRight, ArrowUpRight, Check, Sparkles } from 'lucide-react';
import { useCreateJournalEntryMutation } from '../../journalMutations';
import { useJournalEntries } from '../../journalQueries';
import { createUlid } from '@/shared/sync/syncIdentity';
import type { ExpenseCategory, PaymentMethod, TransactionType } from '../../journal.types';

interface TransactionQuickAddProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const CATEGORIES: ExpenseCategory[] = [
  'FOOD',
  'TRANSPORT',
  'SHOPPING',
  'BILLS',
  'HEALTH',
  'EDUCATION',
  'ENTERTAINMENT',
  'FITNESS',
  'TRAVEL',
  'OTHER',
];

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'CARD', 'E_WALLET', 'BANK_TRANSFER', 'OTHER'];

export function TransactionQuickAdd({ isOpen, onClose, onSuccess }: TransactionQuickAddProps) {
  const createMutation = useCreateJournalEntryMutation();
  const { data: entries = [] } = useJournalEntries({ kind: 'EXPENSE' });

  const [type, setType] = useState<TransactionType>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('VND');
  const [category, setCategory] = useState<ExpenseCategory>('FOOD');
  const [merchant, setMerchant] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('E_WALLET');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [merchantSuggestion, setMerchantSuggestion] = useState<{ category: ExpenseCategory; paymentMethod: PaymentMethod } | null>(null);

  const amountInputRef = useRef<HTMLInputElement>(null);

  // Focus amount input on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => amountInputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Keyboard shortcut listener (Cmd+Shift+E)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        if (isOpen) onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Merchant learning lookup
  useEffect(() => {
    if (!merchant.trim()) {
      setMerchantSuggestion(null);
      return;
    }
    const query = merchant.trim().toLowerCase();
    const match = entries.find((e) => e.expense?.merchant?.toLowerCase().includes(query));
    if (match?.expense) {
      setMerchantSuggestion({
        category: match.expense.category,
        paymentMethod: match.expense.paymentMethod,
      });
    } else {
      setMerchantSuggestion(null);
    }
  }, [merchant, entries]);

  const applySuggestion = () => {
    if (merchantSuggestion) {
      setCategory(merchantSuggestion.category);
      setPaymentMethod(merchantSuggestion.paymentMethod);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = parseFloat(amount.replace(/,/g, ''));
    if (isNaN(numAmount) || numAmount <= 0) return;

    const id = createUlid();
    const displayTitle = merchant.trim()
      ? `${type === 'INCOME' ? '+' : '-'}${numAmount.toLocaleString()} ${currency} (${merchant})`
      : `${type === 'INCOME' ? 'Income' : 'Expense'}: ${numAmount.toLocaleString()} ${currency}`;

    await createMutation.mutateAsync({
      id,
      kind: 'EXPENSE',
      title: displayTitle,
      contentMarkdown: note,
      entryDate: date,
      expense: {
        entryId: id,
        type,
        amount: numAmount,
        currency,
        category,
        merchant: merchant.trim() || undefined,
        paymentMethod,
        transactionAt: new Date(date).toISOString(),
      },
    });

    // Reset & close
    setAmount('');
    setMerchant('');
    setNote('');
    onSuccess?.();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-border/80 bg-card p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground">Add Transaction</h2>
            <span className="text-[10px] font-mono text-muted-foreground bg-muted px-2 py-0.5 rounded">
              ⌘ ⇧ E
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Toggle: Expense / Income */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-muted/40 rounded-xl border border-border/60">
            <button
              type="button"
              onClick={() => setType('EXPENSE')}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-colors ${
                type === 'EXPENSE'
                  ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType('INCOME')}
              className={`flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-colors ${
                type === 'INCOME'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              Income
            </button>
          </div>

          {/* Amount Field (keyboard-first) */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Amount</label>
            <div className="relative">
              <input
                ref={amountInputRef}
                type="number"
                step="any"
                required
                placeholder="55,000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full text-2xl font-bold bg-background/50 border border-input rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <span className="absolute right-4 top-4 text-xs font-mono font-semibold text-muted-foreground">
                {currency}
              </span>
            </div>
          </div>

          {/* Category Selector */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Category</label>
            <div className="grid grid-cols-5 gap-1.5">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`py-1.5 text-[11px] font-semibold rounded-lg border transition-colors ${
                    category === cat
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                      : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Merchant Input with Suggestion */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Merchant / Payee</label>
              {merchantSuggestion && (
                <button
                  type="button"
                  onClick={applySuggestion}
                  className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  Auto-fill ({merchantSuggestion.category} · {merchantSuggestion.paymentMethod})
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="e.g. Highlands Coffee, Grab, Circle K"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="w-full text-xs bg-background/50 border border-input rounded-xl px-3 py-2 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Payment Method */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Payment Method</label>
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {PAYMENT_METHODS.map((pm) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setPaymentMethod(pm)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                    paymentMethod === pm
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 font-semibold'
                      : 'border-border/60 bg-muted/20 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {pm}
                </button>
              ))}
            </div>
          </div>

          {/* Date & Note */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full text-xs bg-background/50 border border-input rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Note (optional)</label>
              <input
                type="text"
                placeholder="Optional notes"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full text-xs bg-background/50 border border-input rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-xl hover:bg-muted/40 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-md"
            >
              Save transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
