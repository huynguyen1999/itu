import { useState, type FormEvent } from 'react';
import { Archive, Check, Pencil, Plus, Tag, X } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { useBudgetCategories } from './budgetQueries';
import { useArchiveBudgetCategory, useCreateBudgetCategory, useUpdateBudgetCategory } from './budgetMutations';
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  CategoryIcon,
  getCategoryColorClasses,
  getCategoryColorKey,
  getCategoryIconKey,
} from './budgetCategoryIcons';

export function BudgetCategoryManager({ compact = false }: { compact?: boolean }) {
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [newCatIcon, setNewCatIcon] = useState('wallet');
  const [newCatColor, setNewCatColor] = useState('TEAL');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<'EXPENSE' | 'INCOME'>('EXPENSE');
  const [editIcon, setEditIcon] = useState('wallet');
  const [editColor, setEditColor] = useState('TEAL');

  const { data: categories = [] } = useBudgetCategories();
  const createCat = useCreateBudgetCategory();
  const updateCat = useUpdateBudgetCategory();
  const archiveCat = useArchiveBudgetCategory();

  const handleAddCategory = (event: FormEvent) => {
    event.preventDefault();
    if (!newCatName.trim()) return;
    createCat.mutate({ name: newCatName.trim(), type: newCatType, icon: newCatIcon, color: newCatColor });
    setNewCatName('');
  };

  const startEdit = (category: any) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditType(category.type || 'EXPENSE');
    setEditIcon(getCategoryIconKey(category.icon || category.name));
    setEditColor(getCategoryColorKey(category.color));
  };

  const saveEdit = (id: string) => {
    if (!editName.trim()) return;
    updateCat.mutate({ id, data: { name: editName.trim(), type: editType, icon: editIcon, color: editColor } });
    setEditingId(null);
  };

  return (
    <section className={compact ? 'space-y-3' : 'space-y-5 rounded-xl border border-border/70 bg-card p-5'}>
      <div className="space-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <Tag className="h-4 w-4 text-primary" aria-hidden="true" />
          Manage categories
        </h2>
        <p className="text-sm text-muted-foreground">Choose an icon that makes each spending group easy to scan.</p>
      </div>

      <form onSubmit={handleAddCategory} className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
        <Input value={newCatName} onChange={(event) => setNewCatName(event.target.value)} placeholder="New category" aria-label="New category name" className="h-9 text-xs" />
        <div className="flex gap-2">
          <select value={newCatType} onChange={(event) => setNewCatType(event.target.value as 'EXPENSE' | 'INCOME')} className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs" aria-label="Category type">
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
          </select>
          <Button type="submit" size="sm" className="gap-1.5" disabled={createCat.isPending}>
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Add
          </Button>
        </div>
        <IconPicker value={newCatIcon} onChange={setNewCatIcon} />
        <ColorPicker value={newCatColor} onChange={setNewCatColor} />
      </form>

      <div className="space-y-2">
        {categories.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No categories yet.</p>
        ) : categories.map((category: any) => (
          <div key={category.id} className="rounded-lg border border-border/70 bg-background p-3">
            {editingId === category.id ? (
              <div className="space-y-3">
                <Input value={editName} onChange={(event) => setEditName(event.target.value)} aria-label="Category name" className="h-8 text-xs" />
                <div className="flex gap-2">
                  <select value={editType} onChange={(event) => setEditType(event.target.value as 'EXPENSE' | 'INCOME')} className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-xs" aria-label="Category type">
                    <option value="EXPENSE">Expense</option>
                    <option value="INCOME">Income</option>
                  </select>
                  <Button type="button" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => saveEdit(category.id)} disabled={updateCat.isPending}>
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Save
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={() => setEditingId(null)} aria-label="Cancel editing">
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
                <IconPicker value={editIcon} onChange={setEditIcon} />
                <ColorPicker value={editColor} onChange={setEditColor} />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${getCategoryColorClasses(category.color).background}`}>
                    <CategoryIcon name={category.icon || category.name} color={category.color} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{category.name}</p>
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{category.type || 'EXPENSE'}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => startEdit(category)} aria-label={`Edit ${category.name}`}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => archiveCat.mutate(category.id)} aria-label={`Archive ${category.name}`}>
                    <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-muted-foreground">Icon</p>
      <div className="grid grid-cols-8 gap-1" role="group" aria-label="Category icon">
        {CATEGORY_ICON_OPTIONS.map(([key, Icon]) => (
          <button
            key={key}
            type="button"
            aria-label={key}
            aria-pressed={value === key}
            title={key}
            onClick={() => onChange(key)}
            className={`flex h-8 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === key ? 'border-primary bg-primary/10 text-primary' : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground'}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-medium text-muted-foreground">Color</p>
      <div className="grid grid-cols-8 gap-1" role="group" aria-label="Category color">
        {CATEGORY_COLOR_OPTIONS.map(([key, label, , , dot]) => (
          <button
            key={key}
            type="button"
            aria-label={label}
            aria-pressed={value === key}
            title={label}
            onClick={() => onChange(key)}
            className={`flex h-8 items-center justify-center rounded-md border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${value === key ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border hover:bg-muted'}`}
          >
            <span className={`h-4 w-4 rounded-full ${dot}`} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
