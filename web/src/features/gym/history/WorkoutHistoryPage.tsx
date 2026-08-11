import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Activity, ChevronRight, History, Medal, Trash2, TrendingUp } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useGymWorkouts, type GymWorkout, type GymWorkoutSet } from '../gymQueries';
import { useDeleteGymWorkout } from '../gymMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { formatVolume, formatWeight } from '../weightUnits';

function completedSets(workout: GymWorkout): GymWorkoutSet[] {
  return (workout.exercises || []).flatMap((exercise) => exercise.sets || []).filter((set) => Boolean(set.completedAt));
}

function workoutVolume(workout: GymWorkout) {
  return completedSets(workout).reduce((total, set) => total + (set.weight || 0) * (set.reps || 0), 0);
}

function workoutDurationMinutes(workout: GymWorkout): number | null {
  if (workout.durationMinutes != null) return workout.durationMinutes;
  if (!workout.startedAt || !workout.endedAt) return null;
  return Math.max(0, Math.round((new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) / 60000));
}

type FinishedSummary = { durationMinutes: number; exercises: number; completedSets: number; volume: number };

export function WorkoutHistoryPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: workouts = [], isLoading } = useGymWorkouts({ limit: 100 });
  const preferencesQuery = useQuery({ queryKey: ['user-preferences'], queryFn: () => api.getPreferences() });
  const weightUnit = preferencesQuery.data?.gym?.weightUnit ?? 'KG';
  const deleteWorkout = useDeleteGymWorkout();
  const [deleteTarget, setDeleteTarget] = useState<GymWorkout | null>(null);
  const [filter, setFilter] = useState<'completed' | 'all'>('completed');
  const finishedSummary = (location.state as { finishedSummary?: FinishedSummary } | null)?.finishedSummary;
  const completed = workouts.filter((workout) => workout.status === 'COMPLETED');
  const visible = filter === 'completed' ? completed : workouts;
  const stats = useMemo(() => {
    const sets = completed.flatMap(completedSets);
    const heaviestWeight = sets.reduce((best, set) => Math.max(best, set.weight || 0), 0);
    const estimated1RM = sets.reduce((best, set) => Math.max(best, (set.weight || 0) * (1 + (set.reps || 0) / 30)), 0);
    const volume = completed.reduce((total, workout) => total + workoutVolume(workout), 0);
    return { heaviestWeight, estimated1RM, volume, sets: sets.length };
  }, [completed]);
  const trend = useMemo(
    () =>
      completed
        .slice(0, 7)
        .reverse()
        .map((workout) => ({
          label: workout.startedAt
            ? new Date(workout.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
            : '—',
          volume: workoutVolume(workout),
        })),
    [completed],
  );
  const maxTrend = Math.max(...trend.map((item) => item.volume), 1);

  if (isLoading)
    return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading history…</div>;
  return (
    <div className="space-y-5">
      {finishedSummary && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 p-4" role="status">
          <p className="text-sm font-semibold">Workout saved</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {finishedSummary.durationMinutes} min · {finishedSummary.exercises} exercises ·{' '}
            {finishedSummary.completedSets} completed sets · {formatVolume(finishedSummary.volume, weightUnit)}
          </p>
        </Card>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <History className="h-4 w-4 text-emerald-500" />
            Workout history
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">Completed sessions, progress, and personal bests.</p>
        </div>
        <div className="flex rounded-md border p-0.5">
          <Button
            type="button"
            size="sm"
            variant={filter === 'completed' ? 'secondary' : 'ghost'}
            onClick={() => setFilter('completed')}
          >
            Completed
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filter === 'all' ? 'secondary' : 'ghost'}
            onClick={() => setFilter('all')}
          >
            All sessions
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] text-muted-foreground">Completed</p>
          <p className="mt-1 text-2xl font-bold">{completed.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] text-muted-foreground">Logged sets</p>
          <p className="mt-1 text-2xl font-bold">{stats.sets}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Medal className="h-3.5 w-3.5" />
            Best weight
          </p>
          <p className="mt-1 text-2xl font-bold">{formatWeight(stats.heaviestWeight || null, weightUnit)}</p>
        </Card>
        <Card className="p-4">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Estimated 1RM
          </p>
          <p className="mt-1 text-2xl font-bold">{formatWeight(stats.estimated1RM || null, weightUnit, 0)}</p>
        </Card>
      </div>
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Volume trend</h2>
            <p className="text-xs text-muted-foreground">Completed set volume across recent sessions.</p>
          </div>
          <Activity className="h-4 w-4 text-primary" />
        </div>
        {trend.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Complete a workout to see your trend.</p>
        ) : (
          <div className="mt-4 flex h-28 items-end gap-2">
            {trend.map((item) => (
              <div key={item.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t bg-primary/70"
                  style={{ height: `${Math.max(8, (item.volume / maxTrend) * 88)}px` }}
                  title={formatVolume(item.volume, weightUnit)}
                />
                <span className="truncate text-[10px] text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
      {visible.length === 0 ? (
        <Card className="p-8 text-center text-xs text-muted-foreground">No workouts in this view yet.</Card>
      ) : (
        <div className="space-y-2">
          {visible.map((workout) => (
            <Card
              key={workout.id}
              className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-muted/30"
            >
              <button
                type="button"
                className="min-w-0 flex-1 cursor-pointer text-left"
                onClick={() => navigate(`/gym/workouts/${workout.id}`)}
              >
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-semibold">{workout.title || 'Workout'}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${workout.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-muted text-muted-foreground'}`}
                  >
                    {workout.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {workout.startedAt ? new Date(workout.startedAt).toLocaleDateString() : 'Unknown date'} ·{' '}
                  {(workout.exercises || []).length} exercises · {completedSets(workout).length} sets ·{' '}
                  {workoutDurationMinutes(workout) ?? '—'} min · {formatVolume(workoutVolume(workout), weightUnit)}
                </p>
              </button>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => setDeleteTarget(workout)}
                  aria-label={`Delete ${workout.title || 'workout'}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => navigate(`/gym/workouts/${workout.id}`)}
                  aria-label="Open workout"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && !deleteWorkout.isPending && setDeleteTarget(null)}
        title="Move workout to Trash?"
        description={deleteTarget ? `“${deleteTarget.title || 'This workout'}” can be restored from Trash.` : ''}
        confirmLabel="Move to Trash"
        isPending={deleteWorkout.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteWorkout.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        }}
      />
    </div>
  );
}
