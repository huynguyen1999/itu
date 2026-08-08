import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useGymWorkout, useGymExercises } from '../gymQueries';
import { useUpdateGymWorkout, useCompleteGymWorkout, useAbandonGymWorkout } from '../gymMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { RestTimer } from '../RestTimer';
import { Check, Plus, Trash2, StopCircle, Ban, Dumbbell } from 'lucide-react';

export function ActiveWorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: workout, isLoading } = useGymWorkout(id || '');
  const { data: exercisesList = [] } = useGymExercises();

  const updateWorkout = useUpdateGymWorkout();
  const completeWorkout = useCompleteGymWorkout();
  const abandonWorkout = useAbandonGymWorkout();

  const [title, setTitle] = useState('');
  const [exercises, setExercises] = useState<any[]>([]);
  const [showAddExModal, setShowAddExModal] = useState(false);
  const [restSeconds, setRestSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (workout) {
      setTitle(workout.title || 'Workout');
      setExercises(workout.exercises || []);
    }
  }, [workout]);

  // Debounced auto-save workout edits
  const saveWorkoutState = (updatedExercises: any[], newTitle?: string) => {
    if (!id) return;
    updateWorkout.mutate({
      id,
      data: {
        title: newTitle !== undefined ? newTitle : title,
        exercises: updatedExercises.map((ex, exIdx) => ({
          id: ex.id,
          exerciseId: ex.exerciseId,
          sortOrder: exIdx,
          note: ex.note || undefined,
          restSeconds: ex.restSeconds || undefined,
          sets: (ex.sets || []).map((s: any, sIdx: number) => ({
            id: s.id,
            sortOrder: sIdx,
            type: s.type || 'NORMAL',
            reps: s.reps != null ? Number(s.reps) : undefined,
            weight: s.weight != null ? Number(s.weight) : undefined,
            durationSeconds: s.durationSeconds != null ? Number(s.durationSeconds) : undefined,
            distanceMeters: s.distanceMeters != null ? Number(s.distanceMeters) : undefined,
            rpe: s.rpe != null ? Number(s.rpe) : undefined,
            completedAt: s.completedAt || undefined,
          })),
        })),
      },
    });
  };

  const handleAddExerciseToWorkout = (exDef: any) => {
    const newEx = {
      exerciseId: exDef.id,
      exercise: exDef,
      sortOrder: exercises.length,
      note: '',
      sets: [
        {
          sortOrder: 0,
          type: 'NORMAL',
          reps: 10,
          weight: 0,
        },
      ],
    };
    const next = [...exercises, newEx];
    setExercises(next);
    setShowAddExModal(false);
    saveWorkoutState(next);
  };

  const handleAddSet = (exIndex: number) => {
    const next = [...exercises];
    const targetEx = next[exIndex];
    const lastSet = targetEx.sets[targetEx.sets.length - 1];
    const newSet = {
      sortOrder: targetEx.sets.length,
      type: 'NORMAL',
      reps: lastSet?.reps ?? 10,
      weight: lastSet?.weight ?? 0,
    };
    targetEx.sets = [...targetEx.sets, newSet];
    setExercises(next);
    saveWorkoutState(next);
  };

  const handleDeleteSet = (exIndex: number, setIndex: number) => {
    const next = [...exercises];
    next[exIndex].sets.splice(setIndex, 1);
    setExercises(next);
    saveWorkoutState(next);
  };

  const handleSetChange = (exIndex: number, setIndex: number, field: string, value: any) => {
    const next = [...exercises];
    next[exIndex].sets[setIndex][field] = value;
    setExercises(next);
    saveWorkoutState(next);
  };

  const handleToggleSetComplete = (exIndex: number, setIndex: number) => {
    const next = [...exercises];
    const targetSet = next[exIndex].sets[setIndex];
    targetSet.completedAt = targetSet.completedAt ? null : new Date().toISOString();
    setExercises(next);
    saveWorkoutState(next);

    if (targetSet.completedAt) {
      setRestSeconds(60);
    }
  };

  const handleFinish = () => {
    if (!id) return;
    completeWorkout.mutate(id, {
      onSuccess: () => navigate('/gym/history'),
    });
  };

  const handleAbandon = () => {
    if (!id) return;
    if (window.confirm('Are you sure you want to abandon this workout?')) {
      abandonWorkout.mutate(id, {
        onSuccess: () => navigate('/gym'),
      });
    }
  };

  if (isLoading || !workout) {
    return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading active workout...</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-20">
      {/* Top Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            saveWorkoutState(exercises, e.target.value);
          }}
          className="text-lg font-bold font-mono w-64 bg-transparent border-none p-0 focus:ring-0"
          placeholder="Workout Title"
        />

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleAbandon} className="gap-1.5 text-xs text-destructive">
            <Ban className="w-3.5 h-3.5" />
            Abandon
          </Button>
          <Button size="sm" onClick={handleFinish} disabled={completeWorkout.isPending} className="gap-1.5">
            <StopCircle className="w-4 h-4" />
            Finish Workout
          </Button>
        </div>
      </div>

      {restSeconds && <RestTimer initialSeconds={restSeconds} onClose={() => setRestSeconds(null)} />}

      {/* Exercises Container */}
      {exercises.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <Dumbbell className="w-8 h-8 mx-auto text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">No exercises added to this workout yet.</p>
          <Button size="sm" onClick={() => setShowAddExModal(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Add Exercise
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {exercises.map((ex: any, exIdx: number) => {
            const metric = ex.exercise?.metricType || 'WEIGHT_REPS';

            return (
              <Card key={ex.id || exIdx} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-foreground">
                    {ex.exercise?.name || 'Exercise'}
                  </h4>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => {
                      const next = exercises.filter((_, idx) => idx !== exIdx);
                      setExercises(next);
                      saveWorkoutState(next);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>

                {/* Sets Table */}
                <div className="space-y-1.5 text-xs">
                  <div className="grid grid-cols-12 gap-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2">
                    <span className="col-span-2">SET</span>
                    {metric === 'WEIGHT_REPS' && (
                      <>
                        <span className="col-span-3">KG</span>
                        <span className="col-span-3">REPS</span>
                      </>
                    )}
                    {metric === 'REPS' && <span className="col-span-6">REPS</span>}
                    {metric === 'DURATION' && <span className="col-span-6">SECS</span>}
                    {metric === 'DISTANCE_DURATION' && (
                      <>
                        <span className="col-span-3">METERS</span>
                        <span className="col-span-3">SECS</span>
                      </>
                    )}
                    <span className="col-span-2">RPE</span>
                    <span className="col-span-2 text-right">DONE</span>
                  </div>

                  {ex.sets?.map((s: any, sIdx: number) => (
                    <div
                      key={s.id || sIdx}
                      className={`grid grid-cols-12 gap-2 items-center p-1.5 rounded-md ${
                        s.completedAt ? 'bg-emerald-500/10' : 'bg-muted/30'
                      }`}
                    >
                      <span className="col-span-2 font-mono text-[11px] font-semibold text-muted-foreground">
                        {sIdx + 1}
                      </span>

                      {metric === 'WEIGHT_REPS' && (
                        <>
                          <Input
                            type="number"
                            value={s.weight ?? ''}
                            onChange={(e) => handleSetChange(exIdx, sIdx, 'weight', e.target.value)}
                            className="col-span-3 h-7 text-xs font-mono"
                            placeholder="0"
                          />
                          <Input
                            type="number"
                            value={s.reps ?? ''}
                            onChange={(e) => handleSetChange(exIdx, sIdx, 'reps', e.target.value)}
                            className="col-span-3 h-7 text-xs font-mono"
                            placeholder="0"
                          />
                        </>
                      )}

                      {metric === 'REPS' && (
                        <Input
                          type="number"
                          value={s.reps ?? ''}
                          onChange={(e) => handleSetChange(exIdx, sIdx, 'reps', e.target.value)}
                          className="col-span-6 h-7 text-xs font-mono"
                          placeholder="0"
                        />
                      )}

                      {metric === 'DURATION' && (
                        <Input
                          type="number"
                          value={s.durationSeconds ?? ''}
                          onChange={(e) => handleSetChange(exIdx, sIdx, 'durationSeconds', e.target.value)}
                          className="col-span-6 h-7 text-xs font-mono"
                          placeholder="Secs"
                        />
                      )}

                      {metric === 'DISTANCE_DURATION' && (
                        <>
                          <Input
                            type="number"
                            value={s.distanceMeters ?? ''}
                            onChange={(e) => handleSetChange(exIdx, sIdx, 'distanceMeters', e.target.value)}
                            className="col-span-3 h-7 text-xs font-mono"
                            placeholder="Meters"
                          />
                          <Input
                            type="number"
                            value={s.durationSeconds ?? ''}
                            onChange={(e) => handleSetChange(exIdx, sIdx, 'durationSeconds', e.target.value)}
                            className="col-span-3 h-7 text-xs font-mono"
                            placeholder="Secs"
                          />
                        </>
                      )}

                      <Input
                        type="number"
                        step="0.5"
                        value={s.rpe ?? ''}
                        onChange={(e) => handleSetChange(exIdx, sIdx, 'rpe', e.target.value)}
                        className="col-span-2 h-7 text-xs font-mono"
                        placeholder="RPE"
                      />

                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant={s.completedAt ? 'default' : 'outline'}
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleToggleSetComplete(exIdx, sIdx)}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteSet(exIdx, sIdx)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleAddSet(exIdx)}
                  className="w-full gap-1 text-xs mt-2"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Set
                </Button>
              </Card>
            );
          })}

          <Button size="sm" onClick={() => setShowAddExModal(true)} className="w-full gap-1.5">
            <Plus className="w-4 h-4" />
            Add Exercise
          </Button>
        </div>
      )}

      {/* Add Exercise Modal */}
      {showAddExModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <Card className="p-5 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">Select Exercise</h3>
              <Button variant="ghost" size="sm" onClick={() => setShowAddExModal(false)}>
                Cancel
              </Button>
            </div>

            <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
              {exercisesList.map((exDef: any) => (
                <div
                  key={exDef.id}
                  className="p-3 border rounded-lg hover:bg-muted/40 cursor-pointer flex items-center justify-between text-xs"
                  onClick={() => handleAddExerciseToWorkout(exDef)}
                >
                  <div>
                    <p className="font-semibold text-foreground">{exDef.name}</p>
                    <p className="text-[10px] text-muted-foreground">{exDef.primaryMuscleGroup || 'General'}</p>
                  </div>
                  <Plus className="w-4 h-4 text-emerald-500" />
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
