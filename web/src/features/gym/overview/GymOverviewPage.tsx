import { useNavigate, Link } from 'react-router-dom';
import { useGymOverview } from '../gymQueries';
import { useCreateGymWorkout } from '../gymMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Dumbbell, History, Activity, ChevronRight } from 'lucide-react';

export function GymOverviewPage() {
  const navigate = useNavigate();
  const { data: overview, isLoading } = useGymOverview();
  const startWorkout = useCreateGymWorkout();
  const activeWorkout = overview?.recentWorkouts?.find((workout: any) => workout.status === 'ACTIVE' || workout.status === 'IN_PROGRESS');

  const recordWorkout = () => {
    if (activeWorkout) {
      navigate(`/gym/workouts/${activeWorkout.id}`);
      return;
    }

    startWorkout.mutate({ title: 'Workout' }, {
      onSuccess: (workout: any) => {
        if (workout?.id) navigate(`/gym/workouts/${workout.id}`);
      },
    });
  };

  const logCompletedWorkout = () => {
    startWorkout.mutate({ title: 'Workout', status: 'COMPLETED', endedAt: new Date().toISOString() }, {
      onSuccess: () => navigate('/gym/history'),
    });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading gym overview...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-foreground">Ready to train?</h2>
          <p className="mt-1 text-xs text-muted-foreground">Start a session and record your exercises, sets, and progress.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={recordWorkout} disabled={startWorkout.isPending} className="shrink-0">
            {startWorkout.isPending ? 'Starting...' : activeWorkout ? 'Continue workout' : 'Start workout'}
          </Button>
          {!activeWorkout && (
            <Button type="button" variant="outline" onClick={logCompletedWorkout} disabled={startWorkout.isPending} className="shrink-0">
              Log completed
            </Button>
          )}
        </div>
      </div>
      {startWorkout.isError && (
        <p role="alert" className="text-xs text-destructive">Couldn’t start a workout. Please try again.</p>
      )}

      {/* Weekly Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4 space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            THIS WEEK WORKOUTS
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">{overview?.weeklyWorkoutsCount ?? 0}</p>
        </Card>

        <Card className="p-4 space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <Dumbbell className="w-3.5 h-3.5 text-blue-500" />
            TOTAL SETS
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">{overview?.weeklySetsCount ?? 0}</p>
        </Card>

        <Card className="p-4 space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
            <History className="w-3.5 h-3.5 text-amber-500" />
            TOTAL VOLUME
          </span>
          <p className="text-2xl font-bold font-mono text-foreground">
            {(overview?.weeklyVolumeKg ?? 0).toLocaleString()} kg
          </p>
        </Card>
      </div>

      {/* Recent Workouts */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-500" />
            Recent Workouts
          </h3>
          <Link to="/gym/history" className="text-xs text-primary hover:underline font-medium">
            View full history &rarr;
          </Link>
        </div>

        {(!overview?.recentWorkouts || overview.recentWorkouts.length === 0) ? (
          <Card className="p-8 text-center text-xs text-muted-foreground">
            No workouts recorded yet. Your history will appear here after your first session.
          </Card>
        ) : (
          <div className="space-y-2">
            {overview.recentWorkouts.map((w: any) => (
              <Card
                key={w.id}
                className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer"
                onClick={() => navigate(`/gym/workouts/${w.id}`)}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-foreground">{w.title || 'Workout'}</span>
                    <span
                        className={`text-xs font-mono px-1.5 py-0.5 rounded ${
                        w.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : w.status === 'ACTIVE' || w.status === 'IN_PROGRESS'
                          ? 'bg-blue-500/10 text-blue-500'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {w.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground font-mono">
                    {new Date(w.startedAt).toLocaleDateString()} &bull; {w.exercises.length} exercises &bull;{' '}
                    {w.durationMinutes || 0} min
                  </p>
                </div>

                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
