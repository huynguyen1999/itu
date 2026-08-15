import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, MoreVertical, Edit2, Trash2, Archive, ClipboardList, Dumbbell, Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { PageHeader } from '@/shared/ui/PageHeader';
import { useGymRoutines, useGymWorkouts } from '../gymQueries';
import type { GymRoutine } from '../gymQueries';
import {
  useStartWorkoutFromRoutine,
  useDeleteGymRoutine,
  useArchiveGymRoutine,
  useStartGymWorkout,
} from '../gymMutations';
import { RoutineEditorDialog } from './RoutineEditorDialog';

export function GymRoutinesPage() {
  const navigate = useNavigate();
  const { data: routines = [], isLoading } = useGymRoutines();
  const { data: workouts = [] } = useGymWorkouts({ limit: 1 });
  const startRoutine = useStartWorkoutFromRoutine();
  const startEmpty = useStartGymWorkout();
  const deleteRoutine = useDeleteGymRoutine();
  const archiveRoutine = useArchiveGymRoutine();

  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedRoutine, setSelectedRoutine] = useState<GymRoutine | null>(null);

  const activeWorkout = workouts.find((w) => w.status === 'IN_PROGRESS' || w.status === 'ACTIVE');

  const handleStartRoutine = async (routineId: string) => {
    if (activeWorkout) {
      navigate(`/gym/workouts/${activeWorkout.id}`);
      return;
    }
    const workout = await startRoutine.mutateAsync(routineId);
    navigate(`/gym/workouts/${workout.id}`);
  };

  const handleStartEmpty = async () => {
    if (activeWorkout) {
      navigate(`/gym/workouts/${activeWorkout.id}`);
      return;
    }
    const workout = await startEmpty.mutateAsync({ title: 'Workout' });
    navigate(`/gym/workouts/${workout.id}`);
  };

  const handleEdit = (routine: GymRoutine) => {
    setSelectedRoutine(routine);
    setEditorOpen(true);
  };

  const handleNew = () => {
    setSelectedRoutine(null);
    setEditorOpen(true);
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto p-4 sm:p-6">
      <PageHeader
        title="Workout Routines"
        description="Organize your training split with templates for instant logging."
      >
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleStartEmpty} className="gap-1.5">
            <Play className="w-3.5 h-3.5" />
            Empty Workout
          </Button>
          <Button onClick={handleNew} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" />
            New Routine
          </Button>
        </div>
      </PageHeader>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="h-40 animate-pulse bg-muted/40" />
          ))}
        </div>
      ) : routines.length === 0 ? (
        <Card className="border-dashed p-10 text-center space-y-4">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3 text-primary">
              <ClipboardList className="w-8 h-8" />
            </div>
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold">No workout routines created yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              Routines let you start your favorite workout splits with one click and prefilled exercises.
            </p>
          </div>
          <div className="flex justify-center gap-2 pt-2">
            <Button onClick={handleNew} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Create First Routine
            </Button>
            <Button variant="outline" onClick={handleStartEmpty}>
              Start Empty Workout
            </Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {routines.map((routine) => {
            const totalSets = (routine.exercises || []).reduce((acc, ex) => acc + (ex.setCount || 3), 0);
            return (
              <Card
                key={routine.id}
                className="group relative flex flex-col justify-between hover:border-primary/50 transition-all shadow-sm"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base font-semibold flex items-center gap-2">
                        {routine.name}
                      </CardTitle>
                      {routine.description && (
                        <CardDescription className="text-xs mt-0.5 line-clamp-1">
                          {routine.description}
                        </CardDescription>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0 opacity-80 group-hover:opacity-100">
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(routine)} className="gap-2">
                          <Edit2 className="w-3.5 h-3.5" />
                          Edit Routine
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => archiveRoutine.mutate(routine.id)} className="gap-2">
                          <Archive className="w-3.5 h-3.5" />
                          Archive Routine
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => deleteRoutine.mutate(routine.id)}
                          className="gap-2 text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete Routine
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4 pt-0">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                      <span>{routine.exercises?.length || 0} exercises</span>
                      <span>•</span>
                      <span>{totalSets} target sets</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {(routine.exercises || []).slice(0, 5).map((re, idx) => (
                        <span
                          key={re.id || idx}
                          className="inline-flex items-center rounded-md bg-muted/60 px-2 py-0.5 text-xs text-muted-foreground font-medium"
                        >
                          {re.exercise?.name || 'Exercise'} ({re.setCount || 3})
                        </span>
                      ))}
                      {(routine.exercises?.length || 0) > 5 && (
                        <span className="inline-flex items-center rounded-md bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground">
                          +{(routine.exercises?.length || 0) - 5} more
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="pt-2 border-t flex items-center justify-between gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(routine)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Edit Routine
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleStartRoutine(routine.id)}
                      className="gap-1.5 font-semibold"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Start Workout
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {editorOpen && (
        <RoutineEditorDialog
          open={editorOpen}
          routine={selectedRoutine}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </div>
  );
}
