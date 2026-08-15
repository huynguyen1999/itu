import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  ChevronRight,
  Medal,
  Trash2,
  TrendingUp,
  Repeat,
  Trophy,
  Play,
  ClipboardList,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { useGymWorkouts, type GymWorkout, type GymWorkoutSet } from '../gymQueries';
import { useDeleteGymWorkout, useRepeatGymWorkout } from '../gymMutations';
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
  const repeatWorkout = useRepeatGymWorkout();

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

  const handleRepeat = async (workoutId: string) => {
    const active = workouts.find((w) => w.status === 'IN_PROGRESS' || w.status === 'ACTIVE');
    if (active) {
      navigate(`/gym/workouts/${active.id}`);
      return;
    }
    const newWorkout = await repeatWorkout.mutateAsync(workoutId);
    navigate(`/gym/workouts/${newWorkout.id}`);
  };

  if (isLoading)
    return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading history…</div>;

  return (
    <div className="space-y-5 max-w-5xl mx-auto p-4 sm:p-6">
      {finishedSummary && (
        <Card className="border-emerald-500/30 bg-emerald-500/5 p-4" role="status">
          <p className="text-sm font-semibold">Workout saved</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {finishedSummary.durationMinutes} min · {finishedSummary.exercises} exercises ·{' '}
            {finishedSummary.completedSets} completed sets · {formatVolume(finishedSummary.volume, weightUnit)}
          </p>
        </Card>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-base font-semibold">Training Log & History</h2>
        <div className="flex rounded-md border p-0.5 bg-muted/30">
          <Button
            type="button"
            size="sm"
            variant={filter === 'completed' ? 'secondary' : 'ghost'}
            onClick={() => setFilter('completed')}
            className="h-7 text-xs"
          >
            Completed ({completed.length})
          </Button>
          <Button
            type="button"
            size="sm"
            variant={filter === 'all' ? 'secondary' : 'ghost'}
            onClick={() => setFilter('all')}
            className="h-7 text-xs"
          >
            All sessions ({workouts.length})
          </Button>
        </div>
      </div>

      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card className="p-4 space-y-1">
          <p className="text-[11px] text-muted-foreground font-semibold uppercase">Total Sessions</p>
          <p className="text-2xl font-bold font-mono">{completed.length}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="text-[11px] text-muted-foreground font-semibold uppercase">Working Sets</p>
          <p className="text-2xl font-bold font-mono">{stats.sets}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground font-semibold uppercase">
            <Medal className="h-3.5 w-3.5" />
            Heaviest Lift
          </p>
          <p className="text-2xl font-bold font-mono">{formatWeight(stats.heaviestWeight || null, weightUnit)}</p>
        </Card>
        <Card className="p-4 space-y-1">
          <p className="flex items-center gap-1 text-[11px] text-muted-foreground font-semibold uppercase">
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            Estimated 1RM
          </p>
          <p className="text-2xl font-bold font-mono text-primary">{formatWeight(stats.estimated1RM || null, weightUnit, 0)}</p>
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
                <span className="truncate text-[10px] text-muted-foreground font-mono">{item.label}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {visible.length === 0 ? (
        <Card className="p-8 text-center text-xs text-muted-foreground border-dashed">
          No workouts in this view yet.
        </Card>
      ) : (
        <div className="space-y-2.5">
          {visible.map((workout) => {
            const isCompleted = workout.status === 'COMPLETED';
            return (
              <Card
                key={workout.id}
                className="flex items-center justify-between gap-3 p-4 transition-all hover:border-primary/40 shadow-xs"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 cursor-pointer text-left space-y-1"
                  onClick={() => navigate(`/gym/workouts/${workout.id}`)}
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold">{workout.title || 'Workout'}</span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-medium ${
                        isCompleted
                          ? 'bg-emerald-500/10 text-emerald-600'
                          : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {workout.status}
                    </span>
                    {workout.routineId && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                        <ClipboardList className="w-2.5 h-2.5" />
                        Routine
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {workout.startedAt ? new Date(workout.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown date'} ·{' '}
                    {(workout.exercises || []).length} exercises · {completedSets(workout).length} sets ·{' '}
                    {workoutDurationMinutes(workout) ?? '—'} min · {formatVolume(workoutVolume(workout), weightUnit)}
                  </p>
                </button>

                <div className="flex items-center gap-1.5">
                  {isCompleted && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleRepeat(workout.id)}
                      className="h-8 px-2.5 text-xs gap-1"
                      title="Repeat this workout"
                    >
                      <Repeat className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Repeat</span>
                    </Button>
                  )}
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
            );
          })}
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
