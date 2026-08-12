import { Outlet, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { PageHeader } from '@/shared/ui/PageHeader';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import { BudgetSettingsPopover } from './BudgetSettingsPopover';
import { BudgetLocalNav } from './BudgetLocalNav';

export function BudgetLayout() {
  const { pathname } = useLocation();
  const queryClient = useQueryClient();
  const userPreferences = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.getPreferences(),
  });
  const updateBudgetPref = useMutation({
    mutationFn: (patch: Record<string, any>) => api.updateBudgetPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });
  const header = pathname === '/budget/transactions'
      ? { title: 'Transactions', description: 'Review and manage recorded income and expenses.' }
      : pathname === '/budget/budgets'
        ? { title: 'Budgets', description: 'Set monthly category limits and monitor progress.' }
        : pathname === '/budget/categories'
          ? { title: 'Categories', description: 'Organize the categories used by your budget.' }
          : { title: 'Budget & Finances', description: 'Track expenses, income, monthly category limits, and financial overview' };

  return (
    <div className="grid h-full min-h-0 w-full gap-0 pb-16 md:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="itu-secondary-rail" aria-label="Budget navigation">
        <header className="itu-secondary-rail__header">
          <p className="itu-secondary-rail__kicker">Tracking</p>
          <h2 className="itu-secondary-rail__title">Budget</h2>
        </header>
        <BudgetLocalNav />
      </aside>
      <main className="min-h-0 min-w-0 space-y-4 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <PageHeader
          kicker="Tracking"
          title={header.title}
          description={header.description}
          stickyControls={<div className="md:hidden"><BudgetLocalNav mobile /></div>}
        >
          <FeatureSettingsButton title="Budget settings">
            <BudgetSettingsPopover
              preferences={userPreferences.data?.budget || userPreferences.data?.money}
              onChange={(patch) => updateBudgetPref.mutate(patch)}
            />
          </FeatureSettingsButton>
        </PageHeader>
        <Outlet />
      </main>
    </div>
  );
}
