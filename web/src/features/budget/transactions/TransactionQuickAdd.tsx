import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useBudgetCategories } from '../budgetQueries';
import { useCreateBudgetTransaction } from '../budgetMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { CategoryIcon } from '../budgetCategoryIcons';
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { budgetDateTimeInputToIso, currentBudgetDateTimeInput } from '../budgetPeriod';

interface TransactionQuickAddProps {
  onClose?: () => void;
}

interface BudgetCategoryOption {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
}

function normalizeCategoryName(value: string) {
  return value.trim().toLocaleLowerCase();
}

function CategoryCombobox({
  categories,
  value,
  selectedCategoryId,
  onChange,
  onSelect,
  invalid,
}: {
  categories: BudgetCategoryOption[];
  value: string;
  selectedCategoryId: string;
  onChange: (value: string) => void;
  onSelect: (categoryId: string) => void;
  invalid: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = 'budget-transaction-category-options';
  const filteredCategories = useMemo(() => {
    const query = normalizeCategoryName(value);
    return query ? categories.filter((category) => normalizeCategoryName(category.name).includes(query)) : categories;
  }, [categories, value]);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [value]);

  const chooseCategory = (category: BudgetCategoryOption) => {
    onChange(category.name);
    onSelect(category.id);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((index) => Math.min(index + 1, Math.max(filteredCategories.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setHighlightedIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && open && filteredCategories[highlightedIndex]) {
      event.preventDefault();
      chooseCategory(filteredCategories[highlightedIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <Input
          id="budget-transaction-category"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            const exactMatch = categories.find(
              (category) => normalizeCategoryName(category.name) === normalizeCategoryName(event.target.value),
            );
            onSelect(exactMatch?.id ?? '');
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search categories..."
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={
            open && filteredCategories[highlightedIndex]
              ? `budget-category-${filteredCategories[highlightedIndex].id}`
              : undefined
          }
          aria-invalid={invalid}
          autoComplete="off"
          required
          className="pr-9 text-xs"
        />
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
      </div>

      {open && (
        <div
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg"
        >
          {filteredCategories.length > 0 ? (
            filteredCategories.map((category, index) => (
              <div
                id={`budget-category-${category.id}`}
                key={category.id}
                role="option"
                aria-selected={category.id === selectedCategoryId}
                className={`flex cursor-pointer items-center gap-2 rounded-sm px-2 py-2 text-xs ${
                  index === highlightedIndex ? 'bg-muted' : 'hover:bg-muted/70'
                }`}
                onMouseEnter={() => setHighlightedIndex(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  chooseCategory(category);
                }}
              >
                <CategoryIcon
                  name={category.icon || category.name}
                  color={category.color ?? undefined}
                  className="h-4 w-4 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">{category.name}</span>
                {category.id === selectedCategoryId && (
                  <Check className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                )}
              </div>
            ))
          ) : (
            <p className="px-2 py-2 text-xs text-muted-foreground">No matching category.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function TransactionQuickAdd({ onClose }: TransactionQuickAddProps) {
  const [type, setType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [merchant, setMerchant] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [transactionAt, setTransactionAt] = useState(currentBudgetDateTimeInput);
  const [note, setNote] = useState('');

  const { data: categories = [] } = useBudgetCategories();
  const typedCategories = categories as BudgetCategoryOption[];
  const createTx = useCreateBudgetTransaction();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) return;

    const selectedCategory =
      typedCategories.find((category) => category.id === categoryId) ??
      typedCategories.find((category) => normalizeCategoryName(category.name) === normalizeCategoryName(categoryQuery));
    if (!selectedCategory) {
      setCategoryError(typedCategories.length > 0 ? 'Choose a category from the list.' : 'Create a category first.');
      return;
    }
    setCategoryError('');

    createTx.mutate(
      {
        type,
        amount: parsedAmount,
        currency: 'VND',
        categoryId: selectedCategory.id,
        merchant: merchant.trim() || undefined,
        paymentMethod,
        transactionAt: budgetDateTimeInputToIso(transactionAt),
        note: note.trim() || undefined,
      },
      {
        onSuccess: () => {
          setAmount('');
          setCategoryId('');
          setCategoryQuery('');
          setMerchant('');
          setNote('');
          onClose?.();
        },
      },
    );
  };

  return (
    <Card className="space-y-4 border-primary/20 p-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">New Transaction</h4>
        {onClose && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} aria-label="Close new transaction">
            <X className="h-3.5 w-3.5" />
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
          <label htmlFor="budget-transaction-amount" className="text-[11px] font-medium text-muted-foreground">
            Amount
          </label>
          <Input
            id="budget-transaction-amount"
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
            <label htmlFor="budget-transaction-category" className="text-[11px] font-medium text-muted-foreground">
              Category
            </label>
            <CategoryCombobox
              categories={typedCategories}
              value={categoryQuery}
              selectedCategoryId={categoryId}
              onChange={(value) => {
                setCategoryQuery(value);
                setCategoryError('');
              }}
              onSelect={setCategoryId}
              invalid={Boolean(categoryError)}
            />
            {categoryError && (
              <p className="text-[11px] text-destructive" role="alert">
                {categoryError}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor="budget-transaction-payment" className="text-[11px] font-medium text-muted-foreground">
              Payment Method
            </label>
            <select
              id="budget-transaction-payment"
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
            <label htmlFor="budget-transaction-merchant" className="text-[11px] font-medium text-muted-foreground">
              Merchant / Description
            </label>
            <Input
              id="budget-transaction-merchant"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              placeholder="e.g. Supermarket"
              className="text-xs"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="budget-transaction-date" className="text-[11px] font-medium text-muted-foreground">
              Date / Time
            </label>
            <Input
              id="budget-transaction-date"
              type="datetime-local"
              value={transactionAt}
              onChange={(e) => setTransactionAt(e.target.value)}
              className="text-xs font-mono"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label htmlFor="budget-transaction-note" className="text-[11px] font-medium text-muted-foreground">
            Note (Optional)
          </label>
          <Input
            id="budget-transaction-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add note..."
            className="text-xs"
          />
        </div>

        {createTx.isError && (
          <p className="text-xs text-destructive" role="alert">
            Could not save this transaction. Try again.
          </p>
        )}

        <Button type="submit" size="sm" className="mt-2 w-full gap-1.5" disabled={createTx.isPending}>
          <Plus className="h-4 w-4" />
          Save Transaction
        </Button>
      </form>
    </Card>
  );
}
