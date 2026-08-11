import { Outlet } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { PageHeader } from '@/shared/ui/PageHeader';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import { BudgetSettingsPopover } from './BudgetSettingsPopover';
import { BudgetLocalNav } from './BudgetLocalNav';

export function BudgetLayout() {
  const queryClient = useQueryClient();
  const userPreferences = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.getPreferences(),
  });
  const updateBudgetPref = useMutation({
    mutationFn: (patch: Record<string, any>) => api.updateBudgetPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });

  return (
    <div className="grid w-full gap-6 pb-16 md:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="itu-secondary-rail" aria-label="Budget navigation">
        <header className="itu-secondary-rail__header">
          <p className="itu-secondary-rail__kicker">Tracking</p>
          <h2 className="itu-secondary-rail__title">Budget</h2>
        </header>
        <BudgetLocalNav />
      </aside>
      <main className="min-w-0 space-y-4 px-4 py-4 md:px-6 md:py-6">
        <PageHeader
          kicker="Tracking"
          title="Budget & Finances"
          description="Track expenses, income, monthly category limits, and financial overview"
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
