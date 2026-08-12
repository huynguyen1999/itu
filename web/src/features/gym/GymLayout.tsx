import { Outlet, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { PageHeader } from '@/shared/ui/PageHeader';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import { GymSettingsPopover } from './GymSettingsPopover';
import { GymLocalNav } from './GymLocalNav';
import { findActiveGymWorkout } from './GymLocalNav';
import { useGymOverview } from './gymQueries';
import { processGymExerciseImageQueue } from './exerciseImageQueue';
import { useSync } from '@/shared/sync/SyncProvider';
import { useEffect } from 'react';

export function GymLayout() {
  const { pathname } = useLocation();
  const { state: syncState } = useSync();
  const gymOverview = useGymOverview();
  const activeWorkout = findActiveGymWorkout(gymOverview.data?.recentWorkouts);
  useEffect(() => {
    void processGymExerciseImageQueue();
    const retry = () => void processGymExerciseImageQueue();
    window.addEventListener('online', retry);
    const interval = window.setInterval(retry, 15_000);
    return () => {
      window.removeEventListener('online', retry);
      window.clearInterval(interval);
    };
  }, []);
  // A successful sync acknowledgement is the signal that the exercise now
  // exists server-side; retry queued media immediately while still online.
  useEffect(() => {
    if (syncState.phase === 'up-to-date') void processGymExerciseImageQueue();
  }, [syncState.phase]);
  const queryClient = useQueryClient();
  const userPreferences = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.getPreferences(),
  });
  const updateGymPref = useMutation({
    mutationFn: (patch: Record<string, any>) => api.updateGymPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });
  const header = pathname.startsWith('/gym/workouts/')
    ? { title: 'Active workout', description: 'Log sets and keep your current workout moving.' }
    : pathname === '/gym/history'
      ? { title: 'Workout history', description: 'Completed sessions, progress, and personal bests.' }
      : pathname === '/gym/exercises'
        ? { title: 'Exercise library', description: 'Browse exercises and keep your training toolkit organized.' }
        : { title: 'Gym & Fitness', description: 'Immediate workout logging, exercise library, set metrics, and training history' };

  return (
    <div className="grid h-full min-h-0 min-w-0 w-full gap-0 pb-16 lg:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="itu-secondary-rail gym-layout__rail" aria-label="Gym navigation">
        <header className="itu-secondary-rail__header">
          <p className="itu-secondary-rail__kicker">Tracking</p>
          <h2 className="itu-secondary-rail__title">Gym</h2>
        </header>
        <GymLocalNav activeWorkout={activeWorkout} />
      </aside>
      <main className="min-h-0 min-w-0 space-y-4 overflow-y-auto px-4 py-4 md:px-6 md:py-6">
        <PageHeader
          kicker="Tracking"
          title={header.title}
          description={header.description}
          stickyControls={
            <div className="lg:hidden min-w-0">
              <GymLocalNav mobile activeWorkout={activeWorkout} />
            </div>
          }
        >
          <FeatureSettingsButton title="Gym settings">
            <GymSettingsPopover
              preferences={userPreferences.data?.gym}
              onChange={(patch) => updateGymPref.mutate(patch)}
            />
          </FeatureSettingsButton>
        </PageHeader>
        <Outlet />
      </main>
    </div>
  );
}
