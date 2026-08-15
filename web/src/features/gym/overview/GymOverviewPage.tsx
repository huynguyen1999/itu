import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useGymOverview, useGymRoutines, useGymWorkouts } from '../gymQueries';
import {
  useStartGymWorkout,
  useStartWorkoutFromRoutine,
  useRepeatGymWorkout,
} from '../gymMutations';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import {
  Dumbbell,
  History,
  Activity,
  ChevronRight,
  Flame,
  Trophy,
  Clock,
  Play,
  Repeat,
  Sparkles,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  ClipboardList,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { formatVolume } from '../weightUnits';

export function GymOverviewPage() {
  const navigate = useNavigate();
  const { data: overview, isLoading } = useGymOverview();
  const { data: routines = [] } = useGymRoutines();
  const preferencesQuery = useQuery({ queryKey: ['user-preferences'], queryFn: () => api.getPreferences() });
  const weightUnit = preferencesQuery.data?.gym?.weightUnit ?? 'KG';

  const startWorkout = useStartGymWorkout();
  const startRoutine = useStartWorkoutFromRoutine();
  const repeatWorkout = useRepeatGymWorkout();

  const activeWorkout = overview?.recentWorkouts?.find(
    (workout) => workout.status === 'ACTIVE' || workout.status === 'IN_PROGRESS',
  );

  const handleStartEmpty = async () => {
    if (activeWorkout) {
      navigate(`/gym/workouts/${activeWorkout.id}`);
      return;
    }
    const workout = await startWorkout.mutateAsync({ title: 'Workout' });
    navigate(`/gym/workouts/${workout.id}`);
  };

  const handleStartRoutine = async (routineId: string) => {
    if (activeWorkout) {
      navigate(`/gym/workouts/${activeWorkout.id}`);
      return;
    }
    const workout = await startRoutine.mutateAsync(routineId);
    navigate(`/gym/workouts/${workout.id}`);
  };

  const handleRepeat = async (workoutId: string) => {
    if (activeWorkout) {
      navigate(`/gym/workouts/${activeWorkout.id}`);
      return;
    }
    const workout = await repeatWorkout.mutateAsync(workoutId);
    navigate(`/gym/workouts/${workout.id}`);
  };

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading training overview...</div>;
  }

  const prev = overview?.previousWeek;
  const currentVolume = overview?.weeklyVolumeKg ?? 0;
  const prevVolume = prev?.weeklyVolumeKg ?? 0;
  const volumeDelta = prevVolume > 0 ? ((currentVolume - prevVolume) / prevVolume) * 100 : null;

  const currentWorkouts = overview?.weeklyWorkoutsCount ?? 0;
  const targetWorkouts = overview?.weeklyWorkoutTarget ?? 3;
  const streak = overview?.consistencyStreakWeeks ?? 0;
  const prsThisWeek = overview?.prCount ?? 0;

  const muscleSets = overview?.muscleSets ?? {};
  const totalMuscleSets = Object.values(muscleSets).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto p-4 sm:p-6">
      {/* Active Workout Banner or Quick Start Hero */}
      {activeWorkout ? (
        <div className="flex flex-col gap-3 rounded-xl border border-primary/30 bg-primary/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary"></span>
              </span>
              <h2 className="text-base font-semibold text-foreground">Workout in progress</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              {activeWorkout.title || 'Workout'} started{' '}
              {activeWorkout.startedAt ? new Date(activeWorkout.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
            </p>
          </div>
          <Button onClick={() => navigate(`/gym/workouts/${activeWorkout.id}`)} className="gap-2 font-semibold">
            <Play className="w-4 h-4 fill-current" />
            Continue Workout
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-5 sm:flex-row sm:items-center sm:justify-between shadow-sm">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">Ready to train?</h2>
            <p className="text-xs text-muted-foreground">
              Start an empty log or choose one of your structured routines.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {routines.slice(0, 2).map((r) => (
              <Button
                key={r.id}
                variant="outline"
                size="sm"
                onClick={() => handleStartRoutine(r.id)}
                className="gap-1.5 text-xs font-medium"
              >
                <ClipboardList className="w-3.5 h-3.5" />
                {r.name}
              </Button>
            ))}
            <Button size="sm" onClick={handleStartEmpty} className="gap-1.5 font-semibold">
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Empty Workout
            </Button>
          </div>
        </div>
      )}

      {/* This Week KPI Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider">Consistency</span>
            <Flame className={`w-4 h-4 ${streak > 0 ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground'}`} />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-1.5 font-mono">
              <span className="text-2xl font-bold text-foreground">{currentWorkouts}</span>
              <span className="text-xs text-muted-foreground">/ {targetWorkouts} workouts</span>
            </div>
            <p className="text-[11px] text-muted-foreground font-medium">
              {streak > 0 ? `${streak} week streak 🔥` : 'Start your weekly streak'}
            </p>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider">Working Sets</span>
            <Dumbbell className="w-4 h-4 text-primary" />
          </div>
          <div className="space-y-0.5">
            <p className="text-2xl font-bold font-mono text-foreground">{overview?.weeklySetsCount ?? 0}</p>
            <p className="text-[11px] text-muted-foreground">
              {prev?.weeklySetsCount !== undefined && (
                <span>
                  {overview?.weeklySetsCount ?? 0 >= prev.weeklySetsCount ? '+' : ''}
                  {(overview?.weeklySetsCount ?? 0) - prev.weeklySetsCount} vs last week
                </span>
              )}
            </p>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider">Volume</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="space-y-0.5">
            <p className="text-2xl font-bold font-mono text-foreground">
              {formatVolume(currentVolume, weightUnit)}
            </p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              {volumeDelta !== null && (
                <span className={`inline-flex items-center font-medium ${volumeDelta >= 0 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
                  {volumeDelta >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(Math.round(volumeDelta))}% vs last week
                </span>
              )}
            </p>
          </div>
        </Card>

        <Card className="p-4 space-y-2">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-[11px] font-bold uppercase tracking-wider">Records & Time</span>
            <Trophy className="w-4 h-4 text-amber-500" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-baseline gap-2 font-mono">
              <span className="text-2xl font-bold text-amber-500">{prsThisWeek}</span>
              <span className="text-xs text-muted-foreground">PRs</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {overview?.trainingMinutes ?? 0} total training mins
            </p>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Muscle Group Distribution (This Week) */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Primary Muscle Volume (This Week)
            </h3>
          </div>

          <Card className="p-4 space-y-3">
            {totalMuscleSets === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground border border-dashed rounded-lg">
                No working sets logged this week yet.
              </div>
            ) : (
              <div className="space-y-2.5">
                {Object.entries(muscleSets)
                  .sort(([, a], [, b]) => b - a)
                  .map(([muscle, count]) => {
                    const percentage = Math.round((count / totalMuscleSets) * 100);
                    return (
                      <div key={muscle} className="space-y-1">
                        <div className="flex items-center justify-between text-xs font-medium">
                          <span>{muscle}</span>
                          <span className="font-mono text-muted-foreground">
                            {count} sets ({percentage}%)
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(5, percentage))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>
        </div>

        {/* Recent Workouts */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <History className="w-4 h-4 text-primary" />
              Recent Training Sessions
            </h3>
            <Link to="/gym/history" className="text-xs text-primary hover:underline font-medium">
              View all history &rarr;
            </Link>
          </div>

          {!overview?.recentWorkouts || overview.recentWorkouts.length === 0 ? (
            <Card className="p-8 text-center text-xs text-muted-foreground border-dashed">
              No completed workouts recorded yet. Start your first session above!
            </Card>
          ) : (
            <div className="space-y-2.5">
              {overview.recentWorkouts.slice(0, 5).map((w: any) => {
                const exerciseCount = w.exercises?.length || 0;
                const totalSets = (w.exercises || []).reduce((acc: number, ex: any) => acc + (ex.sets?.length || 0), 0);

                return (
                  <Card
                    key={w.id}
                    className="group flex min-w-0 items-center justify-between gap-3 p-3.5 transition-all hover:border-primary/50"
                  >
                    <div
                      className="min-w-0 flex-1 cursor-pointer space-y-1"
                      onClick={() => navigate(`/gym/workouts/${w.id}`)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                          {w.title || 'Workout'}
                        </span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-medium ${
                            w.status === 'COMPLETED'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : 'bg-primary/10 text-primary'
                          }`}
                        >
                          {w.status}
                        </span>
                      </div>
                      <p className="text-[11px] font-mono text-muted-foreground">
                        {w.startedAt ? new Date(w.startedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''} &bull;{' '}
                        {exerciseCount} exercises &bull; {totalSets} sets &bull; {w.durationMinutes || 0} min
                      </p>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRepeat(w.id)}
                        className="h-8 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground"
                        title="Repeat this workout"
                      >
                        <Repeat className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Repeat</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => navigate(`/gym/workouts/${w.id}`)}
                      >
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
