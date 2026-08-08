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
    mutationFn: (patch: Record<string, any>) => api.updateMoneyPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-16">
      <PageHeader
        kicker="Tracking"
        title="Budget & Finances"
        description="Track expenses, income, monthly category limits, and financial overview"
      >
        <FeatureSettingsButton title="Budget settings">
          <BudgetSettingsPopover
            preferences={userPreferences.data?.money}
            onChange={(patch) => updateBudgetPref.mutate(patch)}
          />
        </FeatureSettingsButton>
      </PageHeader>
      <BudgetLocalNav />
      <Outlet />
    </div>
  );
}
