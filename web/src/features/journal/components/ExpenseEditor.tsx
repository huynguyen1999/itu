import type { ExpenseCategory, JournalExpense, PaymentMethod } from '../journal.types';

interface ExpenseEditorProps {
  expense?: JournalExpense | null;
  onChange: (expense: Partial<JournalExpense>) => void;
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

const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'BANK_TRANSFER', 'CARD', 'E_WALLET', 'OTHER'];

export function ExpenseEditor({ expense, onChange }: ExpenseEditorProps) {
  const amount = expense?.amount ?? 0;
  const currency = expense?.currency ?? 'VND';
  const category = expense?.category ?? 'FOOD';
  const merchant = expense?.merchant ?? '';
  const paymentMethod = expense?.paymentMethod ?? 'E_WALLET';

  return (
    <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 space-y-3 shadow-inner">
      <div className="text-xs font-semibold text-emerald-400 flex items-center justify-between">
        <span>Expense Details</span>
        <span className="text-[10px] text-slate-400 font-normal">Decimal precision money values</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Amount</label>
          <div className="flex gap-1.5">
            <input
              type="number"
              step="any"
              value={amount || ''}
              onChange={(e) => onChange({ ...expense, amount: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-100 font-mono font-semibold focus:outline-none focus:border-emerald-500"
            />
            <select
              value={currency}
              onChange={(e) => onChange({ ...expense, currency: e.target.value })}
              className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 font-mono"
            >
              <option value="VND">VND</option>
              <option value="USD">USD</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-slate-400 mb-1 font-medium">Category</label>
          <select
            value={category}
            onChange={(e) => onChange({ ...expense, category: e.target.value as ExpenseCategory })}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-slate-400 mb-1 font-medium">Merchant / Store</label>
          <input
            type="text"
            value={merchant}
            onChange={(e) => onChange({ ...expense, merchant: e.target.value })}
            placeholder="e.g. Highlands Coffee, Grab, Target"
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          />
        </div>

        <div>
          <label className="block text-slate-400 mb-1 font-medium">Payment Method</label>
          <select
            value={paymentMethod}
            onChange={(e) => onChange({ ...expense, paymentMethod: e.target.value as PaymentMethod })}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            {PAYMENT_METHODS.map((pm) => (
              <option key={pm} value={pm}>
                {pm.replace('_', ' ')}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
