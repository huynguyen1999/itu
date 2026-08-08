import { Outlet } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { PageHeader } from '@/shared/ui/PageHeader';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import { MoneySettingsPopover } from './MoneySettingsPopover';
import { MoneyLocalNav } from './MoneyLocalNav';
import type { MoneyPreferences } from '@/shared/api/preferencesApi';

export function MoneyLayout() {
  const queryClient = useQueryClient();
  const userPreferences = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.getPreferences(),
  });
  const updateMoneyPref = useMutation({
    mutationFn: (patch: Partial<MoneyPreferences>) => api.updateMoneyPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-16">
      <PageHeader
        kicker="Journal & Finance"
        title="Money & Expenses"
        description="Currency defaults, quick add suggestions, and budget alerts"
      >
        <FeatureSettingsButton title="Money settings">
          <MoneySettingsPopover
            preferences={userPreferences.data?.money}
            onChange={(patch) => updateMoneyPref.mutate(patch)}
          />
        </FeatureSettingsButton>
      </PageHeader>
      <MoneyLocalNav />
      <Outlet />
    </div>
  );
}
