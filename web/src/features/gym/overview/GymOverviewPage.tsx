import { useNavigate, Link } from 'react-router-dom';
import { useGymOverview } from '../gymQueries';
import { useCreateGymWorkout } from '../gymMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Play, Dumbbell, History, Activity, ChevronRight } from 'lucide-react';

export function GymOverviewPage() {
  const navigate = useNavigate();
  const { data: overview, isLoading } = useGymOverview();
  const createWorkout = useCreateGymWorkout();

  const handleStartWorkout = () => {
    createWorkout.mutate(
      { title: 'Workout' },
      {
        onSuccess: (workout: any) => {
          navigate(`/gym/workouts/${workout.id}`);
        },
      },
    );
  };

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading gym overview...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Primary CTA Hero Card */}
      <Card className="p-6 border-emerald-500/20 bg-emerald-500/5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="space-y-1 text-center md:text-left">
          <h3 className="text-lg font-bold text-foreground">Ready to train?</h3>
          <p className="text-xs text-muted-foreground">Start an empty workout and log your exercises and sets directly.</p>
        </div>

        <Button size="lg" className="gap-2 px-6 font-bold" onClick={handleStartWorkout} disabled={createWorkout.isPending}>
          <Play className="w-5 h-5 fill-current" />
          Start Workout
        </Button>
      </Card>

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
            No workouts recorded yet. Click &quot;Start Workout&quot; to begin!
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
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                        w.status === 'COMPLETED'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : w.status === 'ACTIVE'
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
