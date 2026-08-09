import { useState } from 'react';
import { useBudgetOverview, useBudgetCategories } from '../budgetQueries';
import { useUpdateBudgetPeriodLimit, useUpdateBudgetCategoryLimit } from '../budgetMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Save, Edit3 } from 'lucide-react';
import { currentBudgetPeriod } from '../budgetPeriod';

export function BudgetPage() {
  const [period] = useState(currentBudgetPeriod);
  const { data: overview, isLoading } = useBudgetOverview(period);
  const { data: categories = [] } = useBudgetCategories();

  const updateOverall = useUpdateBudgetPeriodLimit();
  const updateCatLimit = useUpdateBudgetCategoryLimit();

  const [editingOverall, setEditingOverall] = useState(false);
  const [overallLimitInput, setOverallLimitInput] = useState('');

  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catLimitInput, setCatLimitInput] = useState('');

  const formatCurrency = (val: number, curr = 'VND') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: curr, maximumFractionDigits: 0 }).format(val);
  };

  const handleSaveOverall = () => {
    const parsed = parseFloat(overallLimitInput);
    if (!isNaN(parsed) && parsed >= 0) {
      updateOverall.mutate({ period, overallLimit: parsed });
    }
    setEditingOverall(false);
  };

  const handleSaveCatLimit = (catId: string) => {
    const parsed = parseFloat(catLimitInput);
    if (!isNaN(parsed) && parsed >= 0) {
      updateCatLimit.mutate({ period, categoryId: catId, limit: parsed });
    }
    setEditingCatId(null);
  };

  if (isLoading || !overview) {
    return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading budget limits...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Existing overall target remains available while category assignments drive the plan. */}
      <Card className="p-5 border-primary/20 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Monthly funding target</h3>
            <p className="text-xs text-muted-foreground">Optional planning target for {overview.period}</p>
          </div>

          {!editingOverall ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOverallLimitInput(String(overview.overallBudget));
                setEditingOverall(true);
              }}
              className="gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Target
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={overallLimitInput}
                onChange={(e) => setOverallLimitInput(e.target.value)}
                className="w-36 font-mono text-xs font-bold"
              />
              <Button size="sm" onClick={handleSaveOverall} disabled={updateOverall.isPending}>
                <Save className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>

        <p className="text-2xl font-bold font-mono text-primary">
          {formatCurrency(overview.overallBudget, overview.currency)}
        </p>
      </Card>

      {/* Category Budgets List */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          Category Assignments
        </h3>

        {categories.length === 0 ? (
          <Card className="p-8 text-center text-xs text-muted-foreground">No categories available.</Card>
        ) : (
          categories.map((cat: any) => {
            const catStat = overview.categories.find((c: any) => c.category.id === cat.id);
            const currentLimit = catStat ? catStat.budget : 0;
            const currentSpent = catStat ? catStat.spent : 0;

            const isEditingThis = editingCatId === cat.id;

            return (
              <Card key={cat.id} className="p-4 flex items-center justify-between gap-4">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-foreground">{cat.name}</span>
                    <span className="font-mono text-muted-foreground">
                      Assigned {formatCurrency(currentLimit, overview.currency)} · Activity {formatCurrency(currentSpent, overview.currency)}
                    </span>
                  </div>

                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-300"
                      style={{ width: `${currentLimit > 0 ? Math.min(100, (currentSpent / currentLimit) * 100) : 0}%` }}
                    />
                  </div>
                </div>

                <div className="shrink-0">
                  {!isEditingThis ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCatLimitInput(String(currentLimit));
                        setEditingCatId(cat.id);
                      }}
                      className="gap-1 text-xs"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Assign Money
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number"
                        value={catLimitInput}
                        onChange={(e) => setCatLimitInput(e.target.value)}
                        className="w-28 font-mono text-xs"
                      />
                      <Button size="sm" onClick={() => handleSaveCatLimit(cat.id)} disabled={updateCatLimit.isPending}>
                        Save
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
