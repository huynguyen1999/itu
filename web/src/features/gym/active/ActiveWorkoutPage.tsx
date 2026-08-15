import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Dumbbell,
  MoreHorizontal,
  Plus,
  RefreshCw,
  StopCircle,
  Trash2,
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { api, type GymPreferences } from '@/shared/api/client';
import { DEFAULT_GYM_PREFERENCES } from '@/shared/api/preferencesApi';
import {
  useGymExercises,
  useGymWorkout,
  useGymWorkouts,
  type ExerciseMetricType,
  type GymExercise,
  type GymWorkoutExercise,
  type GymWorkoutSet,
} from '../gymQueries';
import {
  useAbandonGymWorkout,
  useCompleteGymWorkoutSet,
  useCreateGymExercise,
  useCreateGymWorkoutExercise,
  useCreateGymWorkoutSet,
  useDeleteGymWorkoutExercise,
  useDeleteGymWorkoutSet,
  useFinishGymWorkout,
  useUpdateGymWorkoutTitle,
  useUpdateGymWorkoutExercise,
  useUpdateGymWorkoutSet,
  useCreateRoutineFromWorkout,
  useUpdateRoutineFromWorkout,
} from '../gymMutations';
import { useSync } from '@/shared/sync/SyncProvider';
import { playGymTone, RestTimer } from '../RestTimer';
import { formatVolume } from '../weightUnits';
import { ExercisePickerDialog } from './ExercisePickerDialog';
import { WorkoutExerciseList } from './WorkoutExerciseList';

function numericValue(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function setForMetric(metric: ExerciseMetricType, previous?: GymWorkoutSet): GymWorkoutSet {
  const base = { sortOrder: 0, type: previous?.type || ('NORMAL' as const), rpe: previous?.rpe ?? null };
  if (metric === 'WEIGHT_REPS') return { ...base, weight: previous?.weight ?? null, reps: previous?.reps ?? null };
  if (metric === 'REPS') return { ...base, reps: previous?.reps ?? null };
  if (metric === 'DISTANCE_DURATION')
    return {
      ...base,
      distanceMeters: previous?.distanceMeters ?? null,
      durationSeconds: previous?.durationSeconds ?? null,
    };
  return { ...base, durationSeconds: previous?.durationSeconds ?? null };
}

function setPayload(workoutExerciseId: string, seed: GymWorkoutSet, sortOrder: number) {
  return {
    workoutExerciseId,
    sortOrder,
    type:
      seed.type === 'WARMUP'
        ? ('WARM_UP' as const)
        : seed.type === 'WARM_UP'
          ? ('WARM_UP' as const)
          : seed.type === 'DROP'
            ? ('DROP' as const)
            : seed.type === 'FAILURE'
              ? ('FAILURE' as const)
              : ('NORMAL' as const),
    reps: seed.reps,
    weight: seed.weight,
    durationSeconds: seed.durationSeconds,
    distanceMeters: seed.distanceMeters,
    rpe: seed.rpe,
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ActiveWorkoutPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const workoutQuery = useGymWorkout(id || '');
  const exercisesQuery = useGymExercises();
  const completedWorkoutsQuery = useGymWorkouts({ status: 'COMPLETED', limit: 50 });
  const queryClient = useQueryClient();
  const preferencesQuery = useQuery({ queryKey: ['user-preferences'], queryFn: () => api.getPreferences() });
  const updatePreferences = useMutation({
    mutationFn: (patch: Partial<GymPreferences>) => api.updateGymPreferences(patch),
    onSuccess: (gym) =>
      queryClient.setQueryData(['user-preferences'], (current: any) => (current ? { ...current, gym } : current)),
  });
  const updateWorkout = useUpdateGymWorkoutTitle();
  const createWorkoutExercise = useCreateGymWorkoutExercise();
  const updateWorkoutExercise = useUpdateGymWorkoutExercise();
  const deleteWorkoutExercise = useDeleteGymWorkoutExercise();
  const createWorkoutSet = useCreateGymWorkoutSet();
  const updateWorkoutSet = useUpdateGymWorkoutSet();
  const completeWorkoutSet = useCompleteGymWorkoutSet();
  const deleteWorkoutSet = useDeleteGymWorkoutSet();
  const finishWorkout = useFinishGymWorkout();
  const abandonWorkout = useAbandonGymWorkout();
  const createExercise = useCreateGymExercise();
  const createRoutineFromWorkout = useCreateRoutineFromWorkout();
  const updateRoutineFromWorkout = useUpdateRoutineFromWorkout();
  const { conflicts, keepServer, keepMine } = useSync();
  const prefs = { ...DEFAULT_GYM_PREFERENCES, ...(preferencesQuery.data?.gym || {}) };
  // Keep compatibility with older preference payloads while allowing the explicit toggle.
  if (!prefs.showPrevious) prefs.previousPerformanceMode = '' as 'EXERCISE';
  const [title, setTitle] = useState('Workout');
  const [exercises, setExercises] = useState<GymWorkoutExercise[]>([]);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saved' | 'error'>('idle');
  const [saveQueued, setSaveQueued] = useState(false);
  const [restTimerSeconds, setRestTimerSeconds] = useState<number | null>(null);
  const [showFinishReview, setShowFinishReview] = useState(false);
  const [saveAsNewRoutine, setSaveAsNewRoutine] = useState(false);
  const [updateLinkedRoutine, setUpdateLinkedRoutine] = useState(false);
  const [newRoutineName, setNewRoutineName] = useState('');
  const [clockNow, setClockNow] = useState(() => Date.now());
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!workoutQuery.data?.startedAt) return;
    const timer = window.setInterval(() => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [workoutQuery.data?.startedAt]);

  const previousSets = useMemo(() => {
    const byExercise = new Map<string, GymWorkoutSet[]>();
    for (const workout of completedWorkoutsQuery.data ?? []) {
      for (const entry of workout.exercises ?? []) {
        if (!byExercise.has(entry.exerciseId)) {
          byExercise.set(
            entry.exerciseId,
            [...(entry.sets ?? [])].sort((left, right) => left.sortOrder - right.sortOrder),
          );
        }
      }
    }
    return byExercise;
  }, [completedWorkoutsQuery.data]);

  const elapsedSeconds = workoutQuery.data?.startedAt
    ? Math.max(0, Math.floor((clockNow - new Date(workoutQuery.data.startedAt).getTime()) / 1000))
    : 0;
  const elapsedLabel = `${Math.floor(elapsedSeconds / 3600)}:${String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, '0')}:${String(elapsedSeconds % 60).padStart(2, '0')}`;
  const loggedSets = exercises.flatMap((exercise) => exercise.sets).filter((set) => Boolean(set.completedAt));
  const sessionVolume = loggedSets.reduce((total, set) => total + (set.weight || 0) * (set.reps || 0), 0);
  const finishSummary = {
    durationMinutes: Math.max(1, Math.round(elapsedSeconds / 60)),
    exercises: exercises.filter((exercise) => exercise.sets.some((set) => Boolean(set.completedAt))).length,
    completedSets: loggedSets.length,
    unfinishedSets: exercises.flatMap((exercise) => exercise.sets).filter((set) => !set.completedAt).length,
    volume: sessionVolume,
  };

  useEffect(() => {
    if (!workoutQuery.data) return;
    setTitle(workoutQuery.data.title || 'Workout');
    setExercises(
      (workoutQuery.data.exercises || []).map((entry) => ({
        ...entry,
        sets: entry.sets.map((set, index) => ({
          ...set,
          previous: previousSets.get(entry.exerciseId)?.[index],
        })),
      })),
    );
  }, [workoutQuery.data, previousSets]);
  useEffect(
    () => () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    },
    [],
  );

  const persistTitle = (nextTitle: string) => {
    if (!id) return;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveQueued(true);
    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      updateWorkout.mutate(
        {
          id,
          title: nextTitle.trim() || 'Workout',
          version: workoutQuery.data?.version,
          baseValues: { title: workoutQuery.data?.title },
        },
        {
          onSuccess: () => {
            setSaveQueued(false);
            setSaveFeedback('saved');
          },
          onError: () => {
            setSaveQueued(false);
            setSaveFeedback('error');
          },
        },
      );
    }, 400);
  };

  const patchExercise = (exerciseIndex: number, patch: Record<string, unknown>) => {
    const current = exercises[exerciseIndex];
    if (!current) return;
    const next = exercises.map((exercise, index) => (index === exerciseIndex ? { ...exercise, ...patch } : exercise));
    setExercises(next);
    if (current.id)
      void updateWorkoutExercise
        .mutateAsync({
          id: current.id,
          data: {
            ...patch,
            version: current.version,
            baseValues: Object.fromEntries(Object.keys(patch).map((key) => [key, (current as any)[key]])),
          },
        })
        .catch(() => setSaveFeedback('error'));
  };

  const patchSet = (exerciseIndex: number, setIndex: number, patch: Record<string, unknown>, persist = true) => {
    const exercise = exercises[exerciseIndex];
    const current = exercise?.sets[setIndex];
    if (!exercise || !current) return;
    setExercises((items) =>
      items.map((item, i) =>
        i === exerciseIndex
          ? { ...item, sets: item.sets.map((set, j) => (j === setIndex ? { ...set, ...patch } : set)) }
          : item,
      ),
    );
    if (persist && current.id)
      void updateWorkoutSet
        .mutateAsync({
          id: current.id,
          data: {
            ...patch,
            version: current.version,
            baseValues: Object.fromEntries(Object.keys(patch).map((key) => [key, (current as any)[key]])),
          },
        })
        .catch(() => setSaveFeedback('error'));
  };

  const addExercise = async (definition: GymExercise) => {
    if (!id) return;
    const result = await createWorkoutExercise.mutateAsync({
      workoutId: id,
      exerciseId: definition.id,
      sortOrder: exercises.length,
      restSeconds: definition.defaultRestSeconds ?? prefs.defaultRestSeconds,
    });
    const firstSet = await createWorkoutSet.mutateAsync(
      setPayload(result.id, setForMetric(definition.metricType || 'WEIGHT_REPS'), 0),
    );
    setExercises((items) => [
      ...items,
      { ...result, id: result.id, exerciseId: definition.id, exercise: definition, sets: [firstSet] },
    ]);
    setShowAddExercise(false);
  };

  const addCustomExercise = async (name: string) => {
    if (!name) return;
    const definition = await createExercise.mutateAsync({ name, metricType: 'WEIGHT_REPS' });
    await addExercise(definition);
  };

  const addSet = async (exerciseIndex: number) => {
    const exercise = exercises[exerciseIndex];
    if (!exercise?.id) return;
    const metric = exercise.exercise?.metricType || 'WEIGHT_REPS';
    const created = await createWorkoutSet.mutateAsync(
      setPayload(exercise.id, setForMetric(metric, exercise.sets.at(-1)), exercise.sets.length),
    );
    setExercises((items) =>
      items.map((item, i) => (i === exerciseIndex ? { ...item, sets: [...item.sets, created] } : item)),
    );
  };

  const removeSet = async (exerciseIndex: number, setIndex: number) => {
    const current = exercises[exerciseIndex]?.sets[setIndex];
    if (current?.id) await deleteWorkoutSet.mutateAsync({ id: current.id, version: current.version });
    setExercises((items) =>
      items.map((item, i) =>
        i === exerciseIndex ? { ...item, sets: item.sets.filter((_, j) => j !== setIndex) } : item,
      ),
    );
  };

  const focusNextUnfinishedSet = () => {
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>('[data-gym-set-complete="false"]')?.focus();
    }, 0);
  };

  const toggleSet = async (exerciseIndex: number, setIndex: number) => {
    const current = exercises[exerciseIndex]?.sets[setIndex];
    if (!current?.id) return;
    const completed = !current.completedAt;
    if (completed) await completeWorkoutSet.mutateAsync({ id: current.id, version: current.version });
    else
      await updateWorkoutSet.mutateAsync({
        id: current.id,
        data: { completedAt: null, version: current.version, baseValues: { completedAt: current.completedAt } },
      });
    patchSet(exerciseIndex, setIndex, { completedAt: completed ? new Date().toISOString() : null }, false);
    if (completed) playGymTone(prefs.completionSoundEnabled ?? prefs.soundsEnabled, 520);
    if (completed && prefs.autoStartRestTimer)
      setRestTimerSeconds(exercises[exerciseIndex]?.restSeconds ?? prefs.defaultRestSeconds);
    if (completed) focusNextUnfinishedSet();
  };

  const removeExercise = async (exerciseIndex: number) => {
    const current = exercises[exerciseIndex];
    if (current?.id) await deleteWorkoutExercise.mutateAsync({ id: current.id, version: current.version });
    setExercises((items) => items.filter((_, index) => index !== exerciseIndex));
  };

  const moveExercise = (exerciseIndex: number, direction: -1 | 1) => {
    const target = exerciseIndex + direction;
    if (target < 0 || target >= exercises.length) return;
    const next = [...exercises];
    [next[exerciseIndex], next[target]] = [next[target], next[exerciseIndex]];
    setExercises(next);
    next.forEach((exercise, index) => {
      if (exercise.id)
        void updateWorkoutExercise.mutate({ id: exercise.id, data: { sortOrder: index, version: exercise.version } });
    });
  };

  const finish = () => {
    if (id) setShowFinishReview(true);
  };
  const confirmFinish = async () => {
    if (!id) return;
    try {
      if (workoutQuery.data?.routineId && updateLinkedRoutine) {
        await updateRoutineFromWorkout.mutateAsync({
          routineId: workoutQuery.data.routineId,
          workoutId: id,
        });
      } else if (saveAsNewRoutine && newRoutineName.trim()) {
        await createRoutineFromWorkout.mutateAsync({
          workoutId: id,
          name: newRoutineName.trim(),
        });
      }
    } catch (e) {
      console.error('Failed to save/update routine from workout', e);
    }

    finishWorkout.mutate(
      { id, version: workoutQuery.data?.version, durationMinutes: finishSummary.durationMinutes },
      {
        onSuccess: () => {
          setShowFinishReview(false);
          navigate('/gym/history', { state: { finishedSummary: finishSummary } });
        },
      },
    );
  };
  const discard = () => {
    if (id && window.confirm('Discard this workout? It will not appear in history.'))
      abandonWorkout.mutate(id, { onSuccess: () => navigate('/gym') });
  };

  const availableExercises = exercisesQuery.data ?? [];
  const favoriteIds = useMemo(() => new Set(prefs.favoriteExerciseIds ?? []), [prefs.favoriteExerciseIds]);
  const recentIds = useMemo(
    () =>
      new Set(
        (completedWorkoutsQuery.data ?? []).flatMap((workout) =>
          (workout.exercises ?? []).map((entry) => entry.exerciseId),
        ),
      ),
    [completedWorkoutsQuery.data],
  );
  const toggleFavorite = (exerciseId: string) => {
    const next = new Set(favoriteIds);
    if (next.has(exerciseId)) next.delete(exerciseId);
    else next.add(exerciseId);
    updatePreferences.mutate({ favoriteExerciseIds: [...next] });
  };
  const workoutEntityIds = useMemo(
    () =>
      new Set(
        [id, ...exercises.flatMap((exercise) => [exercise.id, ...exercise.sets.map((set) => set.id)])].filter(
          (value): value is string => Boolean(value),
        ),
      ),
    [id, exercises],
  );
  const workoutConflicts = conflicts.filter(
    (conflict) =>
      workoutEntityIds.has(conflict.entityId) &&
      ['gymworkout', 'workout', 'workout-exercise', 'workout-set', 'journalworkout'].includes(conflict.entityType),
  );
  const offline = typeof navigator !== 'undefined' && !navigator.onLine;
  const saving =
    saveQueued ||
    updateWorkout.isPending ||
    updateWorkoutExercise.isPending ||
    updateWorkoutSet.isPending ||
    createWorkoutSet.isPending ||
    createWorkoutExercise.isPending;
  const saveStatus = offline
    ? 'Offline — changes will sync when you reconnect'
    : saving
      ? 'Saving…'
      : saveFeedback === 'error'
        ? 'Save failed'
        : saveFeedback === 'saved'
          ? 'Saved'
          : 'Changes save automatically';

  if (workoutQuery.isLoading)
    return <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading active workout…</div>;
  if (workoutQuery.isError || !workoutQuery.data)
    return (
      <Card className="mx-auto max-w-lg p-8 text-center space-y-4" role="alert">
        <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground" />
        <h2 className="text-sm font-semibold">This workout could not be loaded</h2>
        <Button type="button" variant="outline" size="sm" onClick={() => void workoutQuery.refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Retry
        </Button>
      </Card>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-20">
      {restTimerSeconds !== null && (
        <RestTimer
          key={restTimerSeconds}
          initialSeconds={restTimerSeconds}
          soundEnabled={prefs.restSoundEnabled ?? prefs.soundsEnabled}
          onClose={() => setRestTimerSeconds(null)}
        />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              persistTitle(event.target.value);
            }}
            aria-label="Workout title"
            className="h-auto max-w-xl border-0 bg-transparent px-0 text-xl font-bold shadow-none focus-visible:ring-0"
          />
          <p className="mt-1 text-[11px] text-muted-foreground" aria-live="polite">
            {saveStatus}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground" aria-label="Workout summary">
              {elapsedLabel} elapsed · {finishSummary.exercises} exercises · {finishSummary.completedSets} completed
              sets · {formatVolume(finishSummary.volume, prefs.weightUnit)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" onClick={finish} disabled={finishWorkout.isPending}>
            <StopCircle className="h-3.5 w-3.5" />
            {finishWorkout.isPending ? 'Finishing…' : 'Finish workout'}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="Workout actions">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={discard}>
                <Trash2 className="h-4 w-4" />
                Discard workout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="space-y-3">
        {workoutConflicts.map((conflict) => (
          <div
            key={conflict.mutationId}
            className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-xs"
            role="alert"
          >
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span>
                <b>Workout changed on another device.</b> Choose the version to keep.
              </span>
            </div>
            <div className="flex gap-2 pl-6">
              <Button type="button" variant="outline" size="sm" onClick={() => void keepServer(conflict.mutationId)}>
                Keep server
              </Button>
              <Button type="button" size="sm" onClick={() => void keepMine(conflict.mutationId)}>
                Keep my workout
              </Button>
            </div>
          </div>
        ))}
        {(finishWorkout.isError || updateWorkout.isError) && (
          <p className="text-xs text-destructive" role="alert">
            {errorMessage(finishWorkout.error || updateWorkout.error, 'Workout changes could not be saved.')}
          </p>
        )}
      </div>
      {exercises.length === 0 ? (
        <Card className="p-10 text-center">
          <Dumbbell className="mx-auto h-8 w-8 text-muted-foreground/60" />
          <h2 className="mt-3 text-sm font-semibold">Ready for your first exercise?</h2>
          <p className="mt-1 text-xs text-muted-foreground">Your workout saves automatically while you train.</p>
          <Button type="button" size="sm" className="mt-4" onClick={() => setShowAddExercise(true)}>
            <Plus className="h-4 w-4" />
            Add exercise
          </Button>
        </Card>
      ) : (
        <WorkoutExerciseList
          exercises={exercises}
          prefs={prefs}
          onPatchExercise={patchExercise}
          onPatchSet={patchSet}
          onToggleSet={toggleSet}
          onRemoveSet={removeSet}
          onAddSet={addSet}
          onRemoveExercise={removeExercise}
          onMoveExercise={moveExercise}
          onRequestAddExercise={() => setShowAddExercise(true)}
        />
      )}
      {showFinishReview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="presentation">
          <Card className="w-full max-w-md space-y-4 p-5" role="dialog" aria-modal="true" aria-labelledby="finish-title">
            <div>
              <h2 id="finish-title" className="text-base font-semibold">
                Finish workout?
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">Only completed sets will be saved to workout history.</p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted/40 p-3"><span className="text-muted-foreground">Duration</span><br />{elapsedLabel}</div>
              <div className="rounded-md bg-muted/40 p-3"><span className="text-muted-foreground">Completed</span><br />{finishSummary.completedSets} sets</div>
              <div className="rounded-md bg-muted/40 p-3"><span className="text-muted-foreground">Exercises</span><br />{finishSummary.exercises}</div>
              <div className="rounded-md bg-muted/40 p-3"><span className="text-muted-foreground">Volume</span><br />{formatVolume(finishSummary.volume, prefs.weightUnit)}</div>
            </div>
            {finishSummary.unfinishedSets > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {finishSummary.unfinishedSets} unfinished {finishSummary.unfinishedSets === 1 ? 'set' : 'sets'} will be discarded.
              </p>
            )}
            {finishSummary.completedSets === 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-300">No completed sets yet. Finish this workout anyway?</p>
            )}

            <div className="border-t pt-3 space-y-2 text-xs">
              {workoutQuery.data?.routineId ? (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateLinkedRoutine}
                    onChange={(e) => setUpdateLinkedRoutine(e.target.checked)}
                    className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                  />
                  <span className="text-muted-foreground">Update linked routine template with today's exercises</span>
                </label>
              ) : (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveAsNewRoutine}
                      onChange={(e) => {
                        setSaveAsNewRoutine(e.target.checked);
                        if (e.target.checked && !newRoutineName) setNewRoutineName(title || 'Routine');
                      }}
                      className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                    />
                    <span className="text-muted-foreground">Save as a new Routine template</span>
                  </label>
                  {saveAsNewRoutine && (
                    <Input
                      placeholder="Routine name (e.g. Upper Body A)"
                      value={newRoutineName}
                      onChange={(e) => setNewRoutineName(e.target.value)}
                      className="h-8 text-xs"
                    />
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowFinishReview(false)}>
                Keep training
              </Button>
              <Button type="button" size="sm" onClick={confirmFinish} disabled={finishWorkout.isPending}>
                {finishWorkout.isPending ? 'Finishing…' : 'Finish workout'}
              </Button>
            </div>
          </Card>
        </div>
      )}
      <ExercisePickerDialog
        open={showAddExercise}
        exercises={availableExercises}
        recentIds={recentIds}
        favoriteIds={favoriteIds}
        isLoading={exercisesQuery.isLoading}
        isCreating={createExercise.isPending}
        onClose={() => setShowAddExercise(false)}
        onAdd={(exercise) => void addExercise(exercise)}
        onCreateCustom={addCustomExercise}
        onToggleFavorite={toggleFavorite}
      />
    </div>
  );
}
