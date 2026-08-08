import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useBudgetCategories } from './budgetQueries';
import { useCreateBudgetCategory, useArchiveBudgetCategory } from './budgetMutations';
import { Tag, Plus, Archive } from 'lucide-react';

interface BudgetSettingsPopoverProps {
  preferences?: Record<string, any>;
  onChange?: (patch: Record<string, any>) => void;
}

export function BudgetSettingsPopover({ preferences = {}, onChange }: BudgetSettingsPopoverProps) {
  const [currency, setCurrency] = useState(preferences.currency || 'VND');
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');

  const { data: categories = [] } = useBudgetCategories();
  const createCat = useCreateBudgetCategory();
  const archiveCat = useArchiveBudgetCategory();

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    createCat.mutate({ name: newCatName.trim(), type: newCatType });
    setNewCatName('');
  };

  return (
    <div className="space-y-6 p-4 w-80 text-sm">
      <div className="space-y-2">
        <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Default Currency
        </label>
        <Input
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            onChange?.({ ...preferences, currency: e.target.value });
          }}
          placeholder="VND"
          className="font-mono text-xs"
        />
      </div>

      <div className="space-y-3 pt-2 border-t border-border">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Tag className="w-3.5 h-3.5" />
            Manage Categories
          </label>
        </div>

        <form onSubmit={handleAddCategory} className="flex gap-1.5">
          <Input
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            placeholder="New Category..."
            className="text-xs flex-1"
          />
          <select
            value={newCatType}
            onChange={(e) => setNewCatType(e.target.value as any)}
            className="rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
          </select>
          <Button type="submit" size="sm" variant="outline" className="px-2" disabled={createCat.isPending}>
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </form>

        <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
          {categories.map((cat: any) => (
            <div key={cat.id} className="flex items-center justify-between p-2 rounded-md bg-muted/40 text-xs">
              <span className="font-medium truncate">{cat.name}</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground uppercase">{cat.type}</span>
                <button
                  type="button"
                  onClick={() => archiveCat.mutate(cat.id)}
                  className="text-muted-foreground hover:text-destructive"
                  title="Archive category"
                >
                  <Archive className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
