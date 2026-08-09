import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  AlertTriangle,
  Ban,
  Check,
  Dumbbell,
  Plus,
  RefreshCw,
  StopCircle,
  Trash2,
  X,
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { useGymExercises, useGymWorkout, type ExerciseMetricType, type GymWorkoutExercise, type GymWorkoutSet, type GymWorkoutUpdate } from '../gymQueries';
import { useAbandonGymWorkout, useCompleteGymWorkout, useUpdateGymWorkout } from '../gymMutations';
import { useSync } from '@/shared/sync/SyncProvider';
import { RestTimer } from '../RestTimer';

type NumericSetField = 'weight' | 'reps' | 'durationSeconds' | 'distanceMeters' | 'rpe';
type SaveFeedback = 'idle' | 'saved' | 'error';

const metricFields: Record<ExerciseMetricType, Array<{ field: NumericSetField; label: string; step?: string }>> = {
  WEIGHT_REPS: [
    { field: 'weight', label: 'Weight', step: '0.01' },
    { field: 'reps', label: 'Reps' },
  ],
  REPS: [{ field: 'reps', label: 'Reps' }],
  DURATION: [{ field: 'durationSeconds', label: 'Duration (sec)' }],
  DISTANCE_DURATION: [
    { field: 'distanceMeters', label: 'Distance (m)', step: '0.01' },
    { field: 'durationSeconds', label: 'Duration (sec)' },
  ],
};

function numericValue(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function setForMetric(metric: ExerciseMetricType, previous?: GymWorkoutSet): GymWorkoutSet {
  const base = {
    sortOrder: 0,
    type: previous?.type || 'NORMAL' as const,
    rpe: previous?.rpe ?? null,
  };

  if (metric === 'WEIGHT_REPS') {
    return { ...base, weight: previous?.weight ?? 0, reps: previous?.reps ?? 8 };
  }
  if (metric === 'REPS') {
    return { ...base, reps: previous?.reps ?? 10 };
  }
  if (metric === 'DISTANCE_DURATION') {
    return {
      ...base,
      distanceMeters: previous?.distanceMeters ?? 0,
      durationSeconds: previous?.durationSeconds ?? 60,
    };
  }
  return { ...base, durationSeconds: previous?.durationSeconds ?? 60 };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function ActiveWorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const workoutQuery = useGymWorkout(id || '');
  const exercisesQuery = useGymExercises();
  const updateWorkout = useUpdateGymWorkout();
  const completeWorkout = useCompleteGymWorkout();
  const abandonWorkout = useAbandonGymWorkout();
  const { conflicts, keepServer, keepMine } = useSync();

  const [title, setTitle] = useState('Workout');
  const [exercises, setExercises] = useState<GymWorkoutExercise[]>([]);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<SaveFeedback>('idle');
  const [saveQueued, setSaveQueued] = useState(false);
  const [restTimerSeconds, setRestTimerSeconds] = useState<number | null>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPayloadRef = useRef<GymWorkoutUpdate | null>(null);

  useEffect(() => {
    if (!workoutQuery.data) return;
    setTitle(workoutQuery.data.title || 'Workout');
    setExercises(workoutQuery.data.exercises || []);
  }, [workoutQuery.data]);

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, []);

  const buildPayload = (nextExercises: GymWorkoutExercise[], nextTitle = title): GymWorkoutUpdate => ({
    title: nextTitle.trim() || 'Workout',
    exercises: nextExercises.map((exercise, exerciseIndex) => ({
      id: exercise.id,
      exerciseId: exercise.exerciseId,
      sortOrder: exerciseIndex,
      note: exercise.note?.trim() || undefined,
      restSeconds: exercise.restSeconds ?? undefined,
      sets: exercise.sets.map((set, setIndex) => ({
        id: set.id,
        sortOrder: setIndex,
        type: set.type || 'NORMAL',
        reps: numericValue(set.reps),
        weight: numericValue(set.weight),
        durationSeconds: numericValue(set.durationSeconds),
        distanceMeters: numericValue(set.distanceMeters),
        rpe: numericValue(set.rpe),
        completedAt: set.completedAt || undefined,
      })),
    })),
  });

  const saveWorkout = (nextExercises: GymWorkoutExercise[], nextTitle = title) => {
    if (!id) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveQueued(false);
    const payload = buildPayload(nextExercises, nextTitle);
    lastPayloadRef.current = payload;
    setSaveFeedback('idle');
    updateWorkout.mutate(
      { id, data: payload },
      {
        onSuccess: () => setSaveFeedback('saved'),
        onError: () => setSaveFeedback('error'),
      },
    );
  };

  const queueSave = (nextExercises: GymWorkoutExercise[], nextTitle = title) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveQueued(true);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      saveWorkout(nextExercises, nextTitle);
    }, 500);
  };

  const updateExercise = (exerciseIndex: number, update: (exercise: GymWorkoutExercise) => GymWorkoutExercise, immediate = false) => {
    const next = exercises.map((exercise, index) => (index === exerciseIndex ? update(exercise) : exercise));
    setExercises(next);
    if (immediate) saveWorkout(next);
    else queueSave(next);
  };

  const updateSet = (exerciseIndex: number, setIndex: number, update: (set: GymWorkoutSet) => GymWorkoutSet, immediate = false) => {
    updateExercise(
      exerciseIndex,
      (exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set, index) => (index === setIndex ? update(set) : set)),
      }),
      immediate,
    );
  };

  const addExercise = (exercise: NonNullable<typeof exercisesQuery.data>[number]) => {
    const metric = exercise.metricType || 'WEIGHT_REPS';
    const next = [
      ...exercises,
      {
        exerciseId: exercise.id,
        exercise,
        sortOrder: exercises.length,
        note: '',
        sets: [setForMetric(metric)],
      },
    ];
    setExercises(next);
    setShowAddExercise(false);
    saveWorkout(next);
  };

  const addSet = (exerciseIndex: number) => {
    const exercise = exercises[exerciseIndex];
    if (!exercise) return;
    const metric = exercise.exercise?.metricType || 'WEIGHT_REPS';
    const previous = exercise.sets[exercise.sets.length - 1];
    updateExercise(
      exerciseIndex,
      (current) => ({
        ...current,
        sets: [...current.sets, { ...setForMetric(metric, previous), sortOrder: current.sets.length }],
      }),
      true,
    );
  };

  const removeSet = (exerciseIndex: number, setIndex: number) => {
    updateExercise(
      exerciseIndex,
      (exercise) => ({ ...exercise, sets: exercise.sets.filter((_, index) => index !== setIndex) }),
      true,
    );
  };

  const toggleSet = (exerciseIndex: number, setIndex: number) => {
    const currentSet = exercises[exerciseIndex]?.sets[setIndex];
    updateSet(
      exerciseIndex,
      setIndex,
      (set) => ({ ...set, completedAt: set.completedAt ? null : new Date().toISOString() }),
      true,
    );
    if (currentSet && !currentSet.completedAt) {
      const exercise = exercises[exerciseIndex];
      setRestTimerSeconds(exercise?.restSeconds ?? exercise?.exercise?.defaultRestSeconds ?? 60);
    }
  };

  const removeExercise = (exerciseIndex: number) => {
    const next = exercises.filter((_, index) => index !== exerciseIndex);
    setExercises(next);
    saveWorkout(next);
  };

  const moveExercise = (exerciseIndex: number, direction: -1 | 1) => {
    const targetIndex = exerciseIndex + direction;
    if (targetIndex < 0 || targetIndex >= exercises.length) return;
    const next = [...exercises];
    [next[exerciseIndex], next[targetIndex]] = [next[targetIndex], next[exerciseIndex]];
    setExercises(next);
    saveWorkout(next);
  };

  const retrySave = () => {
    if (!lastPayloadRef.current || !id) return;
    setSaveFeedback('idle');
    updateWorkout.mutate(
      { id, data: lastPayloadRef.current },
      {
        onSuccess: () => setSaveFeedback('saved'),
        onError: () => setSaveFeedback('error'),
      },
    );
  };

  const finishWorkout = () => {
    if (!id) return;
    completeWorkout.mutate(id, {
      onSuccess: () => navigate('/gym/history'),
    });
  };

  const abandonWorkoutSession = () => {
    if (!id || !window.confirm('Abandon this workout?')) return;
    abandonWorkout.mutate(id, {
      onSuccess: () => navigate('/gym'),
    });
  };

  if (workoutQuery.isLoading) {
    return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading active workout…</div>;
  }

  if (workoutQuery.isError || !workoutQuery.data) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center space-y-4" role="alert">
        <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">This workout could not be loaded</h2>
          <p className="text-xs text-muted-foreground">The session may be unavailable or your connection may be offline.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void workoutQuery.refetch()} disabled={workoutQuery.isFetching}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          {workoutQuery.isFetching ? 'Retrying…' : 'Retry'}
        </Button>
      </Card>
    );
  }

  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const availableExercises = exercisesQuery.data ?? [];
  const workoutConflicts = conflicts.filter(
    (conflict) => conflict.entityId === id && (conflict.entityType === 'gymworkout' || conflict.entityType === 'journalworkout'),
  );
  const saveStatus = offline
    ? 'Offline — changes may not sync until you reconnect'
    : updateWorkout.isPending || saveQueued
      ? 'Saving…'
      : saveFeedback === 'error'
        ? 'Save failed'
        : saveFeedback === 'saved'
          ? 'Saved'
          : 'Changes save automatically';

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-20">
      {restTimerSeconds !== null && (
        <RestTimer
          key={restTimerSeconds}
          initialSeconds={restTimerSeconds}
          onClose={() => setRestTimerSeconds(null)}
        />
      )}
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Active workout</p>
            <Input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                queueSave(exercises, event.target.value);
              }}
              aria-label="Workout title"
              className="mt-1 h-auto max-w-xl border-0 bg-transparent px-0 text-xl font-bold shadow-none focus-visible:ring-0"
              placeholder="Workout title"
            />
            <p className="mt-1 text-[11px] text-muted-foreground" aria-live="polite">
              {saveStatus}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={abandonWorkoutSession} disabled={abandonWorkout.isPending}>
              <Ban className="h-3.5 w-3.5" aria-hidden="true" />
              {abandonWorkout.isPending ? 'Abandoning…' : 'Abandon'}
            </Button>
            <Button type="button" size="sm" onClick={finishWorkout} disabled={completeWorkout.isPending}>
              <StopCircle className="h-3.5 w-3.5" aria-hidden="true" />
              {completeWorkout.isPending ? 'Finishing…' : 'Finish workout'}
            </Button>
          </div>
        </div>

        {(saveFeedback === 'error' || updateWorkout.isError) && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
            <span>{errorMessage(updateWorkout.error, 'Workout changes could not be saved.')}</span>
            <Button type="button" variant="outline" size="sm" onClick={retrySave} disabled={updateWorkout.isPending}>
              Retry save
            </Button>
          </div>
        )}
        {workoutConflicts.map((conflict) => (
          <div key={conflict.mutationId} className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-xs" role="alert">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
              <div>
                <p className="font-semibold text-foreground">Workout changed on another device</p>
                <p className="mt-1 text-muted-foreground">This whole workout aggregate has competing edits. Choose which version to keep.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-6">
              <Button type="button" variant="outline" size="sm" onClick={() => void keepServer(conflict.mutationId)}>Keep server</Button>
              <Button type="button" size="sm" onClick={() => void keepMine(conflict.mutationId)}>Keep my workout</Button>
            </div>
          </div>
        ))}
        {completeWorkout.isError && <p className="text-xs text-destructive" role="alert">{errorMessage(completeWorkout.error, 'Workout could not be completed.')}</p>}
        {abandonWorkout.isError && <p className="text-xs text-destructive" role="alert">{errorMessage(abandonWorkout.error, 'Workout could not be abandoned.')}</p>}
      </div>

      {exercises.length === 0 ? (
        <Card className="p-10 text-center">
          <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
          <h2 className="mt-3 text-sm font-semibold">Start with an exercise</h2>
          <p className="mt-1 text-xs text-muted-foreground">Add your first exercise, then log each set as you go.</p>
          <Button type="button" size="sm" className="mt-4" onClick={() => setShowAddExercise(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add exercise
          </Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {exercises.map((exercise, exerciseIndex) => {
            const metric = exercise.exercise?.metricType || 'WEIGHT_REPS';
            const fields = metricFields[metric];
            return (
              <Card key={exercise.id || `${exercise.exerciseId}-${exerciseIndex}`} className="overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-label={`Exercise ${exerciseIndex + 1}`}>
                      {exerciseIndex + 1}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold">{exercise.exercise?.name || 'Exercise'}</h2>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {metric === 'WEIGHT_REPS' ? 'Weight + reps' : metric === 'DISTANCE_DURATION' ? 'Distance + duration' : metric === 'DURATION' ? 'Duration' : 'Reps'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveExercise(exerciseIndex, -1)} disabled={exerciseIndex === 0} aria-label={`Move ${exercise.exercise?.name || 'exercise'} up`}>
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => moveExercise(exerciseIndex, 1)} disabled={exerciseIndex === exercises.length - 1} aria-label={`Move ${exercise.exercise?.name || 'exercise'} down`}>
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeExercise(exerciseIndex)} aria-label={`Remove ${exercise.exercise?.name || 'exercise'}`}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </div>

                <div className="space-y-2 p-4">
                  <label className="block space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Exercise notes</span>
                    <Textarea
                      value={exercise.note || ''}
                      onChange={(event) => updateExercise(exerciseIndex, (current) => ({ ...current, note: event.target.value }))}
                      aria-label={`Notes for ${exercise.exercise?.name || 'exercise'}`}
                      placeholder="Form cues, equipment, or anything to remember"
                      rows={2}
                      className="min-h-0 resize-y text-xs"
                    />
                  </label>

                  <div className="space-y-2" aria-label={`${exercise.exercise?.name || 'Exercise'} sets`}>
                    <div className="hidden items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:flex">
                      <span className="w-8">Set</span>
                      <span className="flex-1">Metrics</span>
                      <span className="w-20 text-center">Done</span>
                      <span className="w-8" />
                    </div>
                    {exercise.sets.map((set, setIndex) => (
                      <div key={set.id || `${exerciseIndex}-${setIndex}`} className={`flex flex-wrap items-end gap-2 rounded-md border p-2 ${set.completedAt ? 'border-primary/30 bg-primary/5' : 'border-border/60 bg-muted/20'}`}>
                        <span className="w-8 pb-2 text-center font-mono text-xs font-semibold text-muted-foreground">{setIndex + 1}</span>
                        <div className="flex min-w-[220px] flex-1 flex-wrap gap-2">
                          {fields.map(({ field, label, step }, fieldIndex) => (
                            <label key={field} className="min-w-[94px] flex-1 space-y-1">
                              <span className="text-[10px] font-medium text-muted-foreground sm:hidden">{label}</span>
                              <Input
                                type="number"
                                min="0"
                                step={step}
                                value={set[field] ?? ''}
                                onChange={(event) => updateSet(exerciseIndex, setIndex, (current) => ({ ...current, [field]: event.target.value === '' ? null : Number(event.target.value) }))}
                                aria-label={`${exercise.exercise?.name || 'Exercise'} set ${setIndex + 1} ${label}`}
                                autoFocus={exerciseIndex === 0 && setIndex === 0 && fieldIndex === 0}
                                className="h-9 text-xs font-mono"
                                placeholder="—"
                              />
                            </label>
                          ))}
                          <label className="min-w-[72px] flex-1 space-y-1">
                            <span className="text-[10px] font-medium text-muted-foreground sm:hidden">RPE</span>
                            <Input
                              type="number"
                              min="0"
                              max="10"
                              step="0.5"
                              value={set.rpe ?? ''}
                              onChange={(event) => updateSet(exerciseIndex, setIndex, (current) => ({ ...current, rpe: event.target.value === '' ? null : Number(event.target.value) }))}
                              aria-label={`${exercise.exercise?.name || 'Exercise'} set ${setIndex + 1} RPE`}
                              className="h-9 text-xs font-mono"
                              placeholder="RPE"
                            />
                          </label>
                        </div>
                        <div className="flex w-20 justify-end gap-1 pb-0.5">
                          <Button type="button" variant={set.completedAt ? 'default' : 'outline'} size="icon" className="h-9 w-9" onClick={() => toggleSet(exerciseIndex, setIndex)} aria-label={`${set.completedAt ? 'Mark' : 'Complete'} set ${setIndex + 1}`}>
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                          <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive" onClick={() => removeSet(exerciseIndex, setIndex)} aria-label={`Remove set ${setIndex + 1}`}>
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => addSet(exerciseIndex)}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add set
                  </Button>
                </div>
              </Card>
            );
          })}

          <Button type="button" size="sm" className="w-full" onClick={() => setShowAddExercise(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add exercise
          </Button>
        </div>
      )}

      {showAddExercise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowAddExercise(false)}>
          <Card
            className="w-full max-w-lg space-y-4 p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-exercise-title"
            onKeyDown={(event) => event.key === 'Escape' && setShowAddExercise(false)}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="add-exercise-title" className="text-sm font-semibold">Add exercise</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Choose an exercise from your library.</p>
              </div>
              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowAddExercise(false)} aria-label="Close add exercise dialog">
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {exercisesQuery.isLoading ? (
              <p className="py-8 text-center text-xs text-muted-foreground animate-pulse">Loading exercise library…</p>
            ) : exercisesQuery.isError ? (
              <div className="space-y-3 py-6 text-center" role="alert">
                <p className="text-xs text-destructive">Exercise library could not be loaded.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void exercisesQuery.refetch()} disabled={exercisesQuery.isFetching}>Retry</Button>
              </div>
            ) : availableExercises.length === 0 ? (
              <div className="space-y-3 py-6 text-center">
                <p className="text-xs text-muted-foreground">Your exercise library is empty.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowAddExercise(false); navigate('/gym/exercises'); }}>Open exercise library</Button>
              </div>
            ) : (
              <div className="max-h-[min(24rem,60vh)] space-y-1 overflow-y-auto pr-1">
                {availableExercises.map((exercise) => (
                  <button
                    key={exercise.id}
                    type="button"
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent p-3 text-left text-xs transition-colors hover:border-primary/20 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => addExercise(exercise)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{exercise.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{exercise.primaryMuscleGroup || 'General'} · {exercise.metricType === 'DISTANCE_DURATION' ? 'Distance + duration' : exercise.metricType === 'WEIGHT_REPS' ? 'Weight + reps' : exercise.metricType || 'Reps'}</span>
                    </span>
                    <Plus className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
