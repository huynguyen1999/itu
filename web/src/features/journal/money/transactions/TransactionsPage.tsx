import { useState } from 'react';
import { Search, Plus, Trash2, Save, X, Filter } from 'lucide-react';
import { useJournalEntries } from '../../journalQueries';
import { useUpdateJournalEntryMutation, useDeleteJournalEntryMutation } from '../../journalMutations';
import { TransactionQuickAdd } from './TransactionQuickAdd';
import type { ExpenseCategory, JournalEntry, PaymentMethod, TransactionType } from '../../journal.types';

export function TransactionsPage() {
  const { data: entries = [], isLoading } = useJournalEntries({ kind: 'EXPENSE' });
  const updateMutation = useUpdateJournalEntryMutation();
  const deleteMutation = useDeleteJournalEntryMutation();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Filter expenses
  const expenses = entries.filter((e) => e.kind === 'EXPENSE' && e.expense);

  const filteredExpenses = expenses.filter((e) => {
    const exp = e.expense!;
    const matchesCategory = selectedCategory === 'ALL' || exp.category === selectedCategory;
    const matchesSearch =
      !searchQuery.trim() ||
      (exp.merchant && exp.merchant.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.title && e.title.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const selectedEntry = expenses.find((e) => e.id === selectedId) || filteredExpenses[0] || null;

  // Detail edit state
  const [editMerchant, setEditMerchant] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<TransactionType>('EXPENSE');
  const [editCategory, setEditCategory] = useState<ExpenseCategory>('FOOD');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('E_WALLET');

  const handleSelect = (entry: JournalEntry) => {
    setSelectedId(entry.id);
    const exp = entry.expense!;
    setEditMerchant(exp.merchant || entry.title);
    setEditAmount(String(exp.amount));
    setEditType(exp.type || 'EXPENSE');
    setEditCategory(exp.category);
    setEditPaymentMethod(exp.paymentMethod);
  };

  const handleSaveDetail = async () => {
    if (!selectedEntry || !selectedEntry.expense) return;
    const numAmt = parseFloat(editAmount);
    if (isNaN(numAmt)) return;

    await updateMutation.mutateAsync({
      id: selectedEntry.id,
      title: editMerchant.trim() || selectedEntry.title,
      expense: {
        ...selectedEntry.expense,
        type: editType,
        amount: numAmt,
        category: editCategory,
        merchant: editMerchant.trim() || undefined,
        paymentMethod: editPaymentMethod,
      },
    });
  };

  const handleDeleteDetail = async () => {
    if (!selectedEntry) return;
    await deleteMutation.mutateAsync({ id: selectedEntry.id });
    setSelectedId(null);
  };

  return (
    <div className="space-y-4">
      {/* Header Search & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search transactions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-background/50 border border-input rounded-xl pl-9 pr-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsAddOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Split-view Container */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Left List Pane (55% on desktop -> col-span-7) */}
        <div className="md:col-span-7 rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden flex flex-col min-h-[480px]">
          <div className="p-3 border-b border-border/40 bg-muted/20 text-xs font-semibold text-muted-foreground flex justify-between items-center">
            <span>Transaction List ({filteredExpenses.length})</span>
          </div>

          <div className="divide-y divide-border/40 overflow-y-auto max-h-[500px]">
            {filteredExpenses.length === 0 ? (
              <div className="p-8 text-center text-xs text-muted-foreground">No matching transactions found.</div>
            ) : (
              filteredExpenses.map((e) => {
                const exp = e.expense!;
                const isSelected = selectedEntry?.id === e.id;
                const isIncome = exp.type === 'INCOME';

                return (
                  <div
                    key={e.id}
                    onClick={() => handleSelect(e)}
                    className={`p-3.5 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500' : 'hover:bg-muted/30'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-foreground">{exp.merchant || e.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {e.entryDate} · {exp.category} · {exp.paymentMethod}
                      </p>
                    </div>
                    <span className={`font-mono font-bold ${isIncome ? 'text-emerald-400' : 'text-foreground'}`}>
                      {isIncome ? '+' : '-'}₫{Number(exp.amount).toLocaleString()}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail Pane (45% on desktop -> col-span-5) */}
        <div className="md:col-span-5 rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
          {!selectedEntry || !selectedEntry.expense ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground py-16">
              Select a transaction to inspect details.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <h3 className="text-sm font-bold text-foreground">Transaction Details</h3>
                <span className="text-[10px] font-mono text-muted-foreground">{selectedEntry.id.slice(-8)}</span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-muted-foreground font-medium">Merchant / Title</label>
                  <input
                    type="text"
                    value={editMerchant}
                    onChange={(e) => setEditMerchant(e.target.value)}
                    className="w-full mt-1 bg-background/50 border border-input rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="text-muted-foreground font-medium">Amount (VND)</label>
                  <input
                    type="number"
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full mt-1 font-bold text-sm bg-background/50 border border-input rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>

                <div>
                  <label className="text-muted-foreground font-medium">Type</label>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value as TransactionType)}
                    className="w-full mt-1 bg-background/50 border border-input rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="EXPENSE">Expense</option>
                    <option value="INCOME">Income</option>
                  </select>
                </div>

                <div>
                  <label className="text-muted-foreground font-medium">Category</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as ExpenseCategory)}
                    className="w-full mt-1 bg-background/50 border border-input rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="FOOD">Food</option>
                    <option value="TRANSPORT">Transport</option>
                    <option value="SHOPPING">Shopping</option>
                    <option value="BILLS">Bills</option>
                    <option value="HEALTH">Health</option>
                    <option value="ENTERTAINMENT">Entertainment</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <div>
                  <label className="text-muted-foreground font-medium">Payment Method</label>
                  <select
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full mt-1 bg-background/50 border border-input rounded-lg px-3 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="E_WALLET">E-Wallet</option>
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank Transfer</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-border/40">
                <button
                  type="button"
                  onClick={handleDeleteDetail}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete
                </button>

                <button
                  type="button"
                  onClick={handleSaveDetail}
                  className="flex items-center gap-1 px-4 py-1.5 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <TransactionQuickAdd isOpen={isAddOpen} onClose={() => setIsAddOpen(false)} />
    </div>
  );
}
