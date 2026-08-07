import { useState } from 'react';
import { X, Plus, Paperclip, CreditCard, ShoppingBag, UtensilsCrossed, Car, Zap, Heart, GraduationCap, Gamepad2, Dumbbell, Plane, MoreHorizontal } from 'lucide-react';
import { useCreateJournalEntryMutation } from '../journalMutations';
import { JournalMarkdownEditor } from '../components/JournalMarkdownEditor';
import type { ExpenseCategory, PaymentMethod } from '../journal.types';

interface ExpenseQuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const CATEGORY_ITEMS: { id: ExpenseCategory; label: string; icon: any; color: string }[] = [
  { id: 'FOOD', label: 'Food & Dining', icon: UtensilsCrossed, color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
  { id: 'TRANSPORT', label: 'Transport', icon: Car, color: 'text-blue-500 bg-blue-500/10 border-blue-500/30' },
  { id: 'SHOPPING', label: 'Shopping', icon: ShoppingBag, color: 'text-purple-500 bg-purple-500/10 border-purple-500/30' },
  { id: 'BILLS', label: 'Bills & Utilities', icon: Zap, color: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/30' },
  { id: 'ENTERTAINMENT', label: 'Entertainment', icon: Gamepad2, color: 'text-pink-500 bg-pink-500/10 border-pink-500/30' },
  { id: 'HEALTH', label: 'Health', icon: Heart, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' },
  { id: 'FITNESS', label: 'Fitness', icon: Dumbbell, color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/30' },
  { id: 'TRAVEL', label: 'Travel', icon: Plane, color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30' },
  { id: 'EDUCATION', label: 'Education', icon: GraduationCap, color: 'text-teal-500 bg-teal-500/10 border-teal-500/30' },
  { id: 'OTHER', label: 'Other', icon: MoreHorizontal, color: 'text-slate-500 bg-slate-500/10 border-slate-500/30' },
];

const ACCOUNT_OPTIONS: { id: PaymentMethod; label: string }[] = [
  { id: 'E_WALLET', label: 'Momo / E-Wallet' },
  { id: 'CASH', label: 'Cash' },
  { id: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { id: 'CARD', label: 'Card' },
  { id: 'OTHER', label: 'Other Account' },
];

export function ExpenseQuickAddModal({ isOpen, onClose, onSuccess }: ExpenseQuickAddModalProps) {
  const createMutation = useCreateJournalEntryMutation();

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('VND');
  const [category, setCategory] = useState<ExpenseCategory>('FOOD');
  const [merchant, setMerchant] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('E_WALLET');
  const [transactionAt, setTransactionAt] = useState(new Date().toISOString().split('T')[0]);

  const [showNote, setShowNote] = useState(false);
  const [noteMarkdown, setNoteMarkdown] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = parseFloat(amount.replace(/[^0-9.]/g, ''));
    if (!numericAmount || numericAmount <= 0) return;

    setIsSubmitting(true);
    try {
      const displayTitle = merchant.trim()
        ? `${merchant.trim()} (${category})`
        : `${category} expense`;

      await createMutation.mutateAsync({
        kind: 'EXPENSE',
        title: displayTitle,
        contentMarkdown: noteMarkdown,
        entryDate: transactionAt,
        expense: {
          amount: numericAmount,
          currency,
          category,
          merchant: merchant.trim() || null,
          paymentMethod,
          transactionAt,
        },
      });

      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Failed to create expense transaction', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border/60">
          <h3 className="text-base font-bold text-foreground">Add Expense</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Dominant Amount Input */}
          <div className="text-center py-2 space-y-1">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Amount
            </label>
            <div className="flex items-center justify-center gap-2">
              <span className="text-3xl font-bold text-emerald-500">
                {currency === 'VND' ? '₫' : '$'}
              </span>
              <input
                type="text"
                autoFocus
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-48 text-center text-4xl font-extrabold text-foreground bg-transparent border-b-2 border-emerald-500/50 focus:border-emerald-500 outline-none pb-1"
              />
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="text-xs font-semibold bg-muted border border-border rounded-md px-2 py-1 text-foreground"
              >
                <option value="VND">VND</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
          </div>

          {/* Category Quick Picks */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Category
            </label>
            <div className="grid grid-cols-5 gap-2">
              {CATEGORY_ITEMS.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400 shadow-sm'
                        : 'border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <Icon className="w-4 h-4 mb-1" />
                    <span className="text-[10px] font-medium truncate w-full">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Merchant & Account & Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Merchant / Payee</label>
              <input
                type="text"
                placeholder="Highlands, Grab, WinMart..."
                value={merchant}
                onChange={(e) => setMerchant(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Account</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {ACCOUNT_OPTIONS.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">Date</label>
            <input
              type="date"
              value={transactionAt}
              onChange={(e) => setTransactionAt(e.target.value)}
              className="w-full rounded-lg border border-input bg-background/50 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Progressive Disclosure: Add Note */}
          {!showNote ? (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="flex items-center gap-1.5 text-xs text-emerald-500 font-medium hover:underline"
            >
              <Plus className="w-3.5 h-3.5" />
              Add note or description
            </button>
          ) : (
            <div className="space-y-1.5 border-t border-border/40 pt-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Note</label>
                <button
                  type="button"
                  onClick={() => setShowNote(false)}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Hide
                </button>
              </div>
              <JournalMarkdownEditor
                value={noteMarkdown}
                onChange={setNoteMarkdown}
                placeholder="Optional reflection or items..."
                minHeight="120px"
                frameless={false}
              />
            </div>
          )}

          {/* Action Footer */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !amount}
              className="px-5 py-2 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors shadow-md disabled:opacity-50"
            >
              {isSubmitting ? 'Adding...' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
