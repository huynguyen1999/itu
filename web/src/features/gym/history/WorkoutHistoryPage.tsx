import { useNavigate } from 'react-router-dom';
import { useGymWorkouts } from '../gymQueries';
import { useDeleteGymWorkout } from '../gymMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { History, ChevronRight, Trash2 } from 'lucide-react';

export function WorkoutHistoryPage() {
  const navigate = useNavigate();
  const { data: workouts = [], isLoading } = useGymWorkouts();
  const deleteWorkout = useDeleteGymWorkout();

  if (isLoading) {
    return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading history...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <History className="w-4 h-4 text-emerald-500" />
          Workout History
        </h3>
      </div>

      {workouts.length === 0 ? (
        <Card className="p-8 text-center text-xs text-muted-foreground">No workouts in history.</Card>
      ) : (
        <div className="space-y-2">
          {workouts.map((w: any) => (
            <Card
              key={w.id}
              className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors"
            >
              <div
                className="space-y-1 min-w-0 flex-1 cursor-pointer"
                onClick={() => navigate(`/gym/workouts/${w.id}`)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-foreground">{w.title || 'Workout'}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
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

              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteWorkout.mutate(w.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => navigate(`/gym/workouts/${w.id}`)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
