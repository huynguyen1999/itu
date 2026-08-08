import { Outlet } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { PageHeader } from '@/shared/ui/PageHeader';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import { GymSettingsPopover } from './GymSettingsPopover';
import { GymLocalNav } from './GymLocalNav';

export function GymLayout() {
  const queryClient = useQueryClient();
  const userPreferences = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.getPreferences(),
  });
  const updateGymPref = useMutation({
    mutationFn: (patch: Record<string, any>) => api.updateGymPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-16">
      <PageHeader
        kicker="Tracking"
        title="Gym & Fitness"
        description="Immediate workout logging, exercise library, set metrics, and training history"
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
