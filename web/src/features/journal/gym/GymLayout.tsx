import { Outlet } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { PageHeader } from '@/shared/ui/PageHeader';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import { GymSettingsPopover } from './GymSettingsPopover';
import { GymLocalNav } from './GymLocalNav';
import type { GymPreferences } from '@/shared/api/preferencesApi';

export function GymLayout() {
  const queryClient = useQueryClient();
  const userPreferences = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.getPreferences(),
  });
  const updateGymPref = useMutation({
    mutationFn: (patch: Partial<GymPreferences>) => api.updateGymPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-16">
      <PageHeader
        kicker="Journal & Health"
        title="Gym & Workouts"
        description="Units, workout logging defaults, rest timer, and weekly workout goals"
      >
        <FeatureSettingsButton title="Gym settings">
          <GymSettingsPopover
            preferences={userPreferences.data?.gym}
            onChange={(patch) => updateGymPref.mutate(patch)}
          />
        </FeatureSettingsButton>
      </PageHeader>
      <GymLocalNav />
      <Outlet />
    </div>
  );
}
