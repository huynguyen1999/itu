import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Dumbbell,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Star,
  StopCircle,
  Trash2,
  X,
} from 'lucide-react';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
} from '../gymMutations';
import { useSync } from '@/shared/sync/SyncProvider';
import { playGymTone, RestTimer } from '../RestTimer';
import { formatVolume, formatWeight, fromDisplayWeight, toDisplayWeight, weightUnitLabel } from '../weightUnits';

type NumericSetField = 'weight' | 'reps' | 'durationSeconds' | 'distanceMeters' | 'rpe';
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

function previousSummary(
  previous: GymWorkoutSet['previous'],
  metric: ExerciseMetricType,
  weightUnit: 'KG' | 'LBS',
): string {
  if (!previous) return '';
  const fields =
    metric === 'WEIGHT_REPS'
      ? [
          previous.weight !== undefined && previous.weight !== null ? formatWeight(previous.weight, weightUnit) : null,
          previous.reps !== undefined && previous.reps !== null ? `${previous.reps} reps` : null,
        ]
      : metric === 'REPS'
        ? [previous.reps !== undefined && previous.reps !== null ? `${previous.reps} reps` : null]
        : metric === 'DISTANCE_DURATION'
          ? [
              previous.distanceMeters !== undefined && previous.distanceMeters !== null
                ? `${previous.distanceMeters}m`
                : null,
              previous.durationSeconds !== undefined && previous.durationSeconds !== null
                ? `${previous.durationSeconds}s`
                : null,
            ]
          : [
              previous.durationSeconds !== undefined && previous.durationSeconds !== null
                ? `${previous.durationSeconds}s`
                : null,
            ];
  return [...fields, previous.rpe !== undefined && previous.rpe !== null ? `RPE ${previous.rpe}` : null]
    .filter(Boolean)
    .join(' · ');
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
  const { conflicts, keepServer, keepMine } = useSync();
  const prefs = { ...DEFAULT_GYM_PREFERENCES, ...(preferencesQuery.data?.gym || {}) };
  // Keep compatibility with older preference payloads while allowing the explicit toggle.
  if (!prefs.showPrevious) prefs.previousPerformanceMode = '' as 'EXERCISE';
  const [title, setTitle] = useState('Workout');
  const [exercises, setExercises] = useState<GymWorkoutExercise[]>([]);
  const [showAddExercise, setShowAddExercise] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState('');
  const [pickerTab, setPickerTab] = useState<'recent' | 'favorites' | 'all'>('all');
  const [muscleFilter, setMuscleFilter] = useState('ALL');
  const [equipmentFilter, setEquipmentFilter] = useState('ALL');
  const [metricFilter, setMetricFilter] = useState('ALL');
  const [customName, setCustomName] = useState('');
  const [saveFeedback, setSaveFeedback] = useState<'idle' | 'saved' | 'error'>('idle');
  const [saveQueued, setSaveQueued] = useState(false);
  const [restTimerSeconds, setRestTimerSeconds] = useState<number | null>(null);
  const [showFinishReview, setShowFinishReview] = useState(false);
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
    setExerciseSearch('');
  };

  const addCustomExercise = async () => {
    const name = customName.trim();
    if (!name) return;
    const definition = await createExercise.mutateAsync({ name, metricType: 'WEIGHT_REPS' });
    setCustomName('');
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
  const confirmFinish = () => {
    if (!id) return;
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
  const muscleOptions = useMemo(
    () =>
      Array.from(
        new Set(
          availableExercises.map((item) => item.primaryMuscleGroup).filter((value): value is string => Boolean(value)),
        ),
      ),
    [availableExercises],
  );
  const equipmentOptions = useMemo(
    () =>
      Array.from(
        new Set(availableExercises.map((item) => item.equipment).filter((value): value is string => Boolean(value))),
      ),
    [availableExercises],
  );
  const filteredExercises = useMemo(() => {
    const query = exerciseSearch.trim().toLowerCase();
    return availableExercises.filter((exercise) => {
      const favorite = favoriteIds.has(exercise.id) || Boolean(exercise.isFavorite || exercise.favorite);
      const matchesTab = pickerTab === 'all' || (pickerTab === 'favorites' ? favorite : recentIds.has(exercise.id));
      return (
        matchesTab &&
        (!query || exercise.name.toLowerCase().includes(query)) &&
        (muscleFilter === 'ALL' || exercise.primaryMuscleGroup === muscleFilter) &&
        (equipmentFilter === 'ALL' || exercise.equipment === equipmentFilter) &&
        (metricFilter === 'ALL' || exercise.metricType === metricFilter)
      );
    });
  }, [
    availableExercises,
    favoriteIds,
    exerciseSearch,
    pickerTab,
    recentIds,
    muscleFilter,
    equipmentFilter,
    metricFilter,
  ]);
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
      <div className="flex flex-col gap-4 border-b border-border/60 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">Active workout</p>
            <Input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                persistTitle(event.target.value);
              }}
              aria-label="Workout title"
              className="mt-1 h-auto max-w-xl border-0 bg-transparent px-0 text-xl font-bold shadow-none focus-visible:ring-0"
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
        <div className="space-y-4">
          {exercises.map((exercise, exerciseIndex) => {
            const metric = exercise.exercise?.metricType || 'WEIGHT_REPS';
            const fields = metricFields[metric];
            return (
              <Card key={exercise.id || `${exercise.exerciseId}-${exerciseIndex}`} className="overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {exerciseIndex + 1}
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-semibold">{exercise.exercise?.name || 'Exercise'}</h2>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {metric.replace('_', ' + ').toLowerCase()}
                      </p>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Exercise actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => moveExercise(exerciseIndex, -1)} disabled={exerciseIndex === 0}>
                        <ArrowUp className="h-4 w-4" />
                        Move up
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => moveExercise(exerciseIndex, 1)}
                        disabled={exerciseIndex === exercises.length - 1}
                      >
                        <ArrowDown className="h-4 w-4" />
                        Move down
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => void removeExercise(exerciseIndex)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove exercise
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-2 p-4">
                  <label className="block space-y-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Exercise notes
                    </span>
                    <Textarea
                      value={exercise.note || ''}
                      onChange={(event) => patchExercise(exerciseIndex, { note: event.target.value })}
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
                    </div>
                    {exercise.sets.map((set, setIndex) => (
                      <div
                        key={set.id || `${exerciseIndex}-${setIndex}`}
                        className={`flex flex-wrap items-end gap-2 rounded-md border p-2 ${set.completedAt ? 'border-primary/30 bg-primary/5' : 'border-border/60 bg-muted/20'}`}
                      >
                        <span className="w-8 pb-2 text-center font-mono text-xs font-semibold text-muted-foreground">
                          {setIndex + 1}
                        </span>
                        <div className="flex min-w-[220px] flex-1 flex-wrap gap-2">
                          {fields.map(({ field, label, step }) => {
                            const displayLabel =
                              field === 'weight' ? `Weight (${weightUnitLabel(prefs.weightUnit)})` : label;
                            return (
                              <label key={field} className="min-w-[94px] flex-1 space-y-1">
                                <span className="text-[10px] font-medium text-muted-foreground sm:hidden">
                                  {displayLabel}
                                </span>
                                <Input
                                  type="number"
                                  min="0"
                                  step={step}
                                  value={
                                    field === 'weight'
                                      ? (toDisplayWeight((set as any)[field], prefs.weightUnit) ?? '')
                                      : ((set as any)[field] ?? '')
                                  }
                                  onChange={(event) =>
                                    patchSet(exerciseIndex, setIndex, {
                                      [field]:
                                        event.target.value === ''
                                          ? null
                                          : field === 'weight'
                                            ? fromDisplayWeight(Number(event.target.value), prefs.weightUnit)
                                            : Number(event.target.value),
                                    })
                                  }
                                  aria-label={`${exercise.exercise?.name || 'Exercise'} set ${setIndex + 1} ${displayLabel}`}
                                  className="h-9 text-xs font-mono"
                                  placeholder="—"
                                />
                              </label>
                            );
                          })}
                          {prefs.showRpe && (
                            <label className="min-w-[72px] flex-1 space-y-1">
                              <span className="text-[10px] font-medium text-muted-foreground sm:hidden">RPE</span>
                              <Input
                                type="number"
                                min="0"
                                max="10"
                                step="0.5"
                                value={set.rpe ?? ''}
                                onChange={(event) =>
                                  patchSet(exerciseIndex, setIndex, {
                                    rpe: event.target.value === '' ? null : Number(event.target.value),
                                  })
                                }
                                aria-label={`${exercise.exercise?.name || 'Exercise'} set ${setIndex + 1} RPE`}
                                className="h-9 text-xs font-mono"
                                placeholder="RPE"
                              />
                            </label>
                          )}
                          <label className="min-w-[96px] flex-1 space-y-1">
                            <span className="text-[10px] font-medium text-muted-foreground sm:hidden">Set type</span>
                            <select
                              value={set.type === 'WARMUP' ? 'WARM_UP' : set.type || 'NORMAL'}
                              onChange={(event) => patchSet(exerciseIndex, setIndex, { type: event.target.value })}
                              aria-label={`Set ${setIndex + 1} type`}
                              className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                            >
                              <option value="NORMAL">Normal</option>
                              <option value="WARM_UP">Warm-up</option>
                              <option value="DROP">Drop</option>
                              <option value="FAILURE">Failure</option>
                            </select>
                          </label>
                        </div>
                        <div className="flex w-20 justify-end gap-1 pb-0.5">
                          <Button
                            data-gym-set-complete={String(Boolean(set.completedAt))}
                            type="button"
                            variant={set.completedAt ? 'default' : 'outline'}
                            size="icon"
                            className="h-9 w-9"
                            onClick={() => void toggleSet(exerciseIndex, setIndex)}
                            aria-label={`${set.completedAt ? 'Uncomplete' : 'Complete'} set ${setIndex + 1}`}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-muted-foreground hover:text-destructive"
                            onClick={() => void removeSet(exerciseIndex, setIndex)}
                            aria-label={`Remove set ${setIndex + 1}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {prefs.previousPerformanceMode && set.previous && (
                          <p className="w-full pl-10 text-[10px] text-muted-foreground">
                            Previous: {previousSummary(set.previous, metric, prefs.weightUnit)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => void addSet(exerciseIndex)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add set
                  </Button>
                </div>
              </Card>
            );
          })}
          <Button type="button" size="sm" className="w-full" onClick={() => setShowAddExercise(true)}>
            <Plus className="h-4 w-4" />
            Add exercise
          </Button>
        </div>
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
            <div className="flex justify-end gap-2">
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
      {showAddExercise && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setShowAddExercise(false)}
        >
          <Card
            className="w-full max-w-lg space-y-4 p-5"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-exercise-title"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 id="add-exercise-title" className="text-sm font-semibold">
                  Add exercise
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Recent, favorite, or all exercises.</p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowAddExercise(false)}
                aria-label="Close add exercise dialog"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={exerciseSearch}
                  onChange={(event) => setExerciseSearch(event.target.value)}
                  placeholder="Search exercises"
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Input
                value={customName}
                onChange={(event) => setCustomName(event.target.value)}
                placeholder="New custom exercise name"
                aria-label="Custom exercise name"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void addCustomExercise()}
                disabled={!customName.trim() || createExercise.isPending}
              >
                Create custom
              </Button>
            </div>
            <div className="flex flex-wrap gap-1">
              <div className="flex rounded-md border p-0.5">
                {(['recent', 'favorites', 'all'] as const).map((tab) => (
                  <Button
                    key={tab}
                    type="button"
                    variant={pickerTab === tab ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setPickerTab(tab)}
                  >
                    {tab[0].toUpperCase() + tab.slice(1)}
                  </Button>
                ))}
              </div>
              <select
                value={muscleFilter}
                onChange={(event) => setMuscleFilter(event.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <option value="ALL">Muscle</option>
                {muscleOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                value={equipmentFilter}
                onChange={(event) => setEquipmentFilter(event.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <option value="ALL">Equipment</option>
                {equipmentOptions.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
              <select
                value={metricFilter}
                onChange={(event) => setMetricFilter(event.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-xs"
              >
                <option value="ALL">Metric</option>
                {Object.keys(metricFields).map((value) => (
                  <option key={value} value={value}>
                    {value.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            {exercisesQuery.isLoading ? (
              <p className="py-8 text-center text-xs text-muted-foreground">Loading exercise library…</p>
            ) : (
              <div className="max-h-[min(24rem,60vh)] space-y-1 overflow-y-auto pr-1">
                {filteredExercises.map((exercise) => (
                  <div
                    key={exercise.id}
                    role="button"
                    tabIndex={0}
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent p-3 text-left text-xs hover:border-primary/20 hover:bg-primary/5"
                    onClick={() => void addExercise(exercise)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        void addExercise(exercise);
                      }
                    }}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{exercise.name}</span>
                      <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                        {exercise.primaryMuscleGroup || 'General'} · {exercise.equipment || 'Bodyweight'}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      <span
                        role="button"
                        tabIndex={0}
                        className="rounded p-1 text-muted-foreground hover:text-amber-500"
                        aria-label={`${favoriteIds.has(exercise.id) ? 'Remove' : 'Add'} ${exercise.name} ${favoriteIds.has(exercise.id) ? 'from' : 'to'} favorites`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleFavorite(exercise.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            event.stopPropagation();
                            toggleFavorite(exercise.id);
                          }
                        }}
                      >
                        <Star
                          className={`h-4 w-4 ${favoriteIds.has(exercise.id) ? 'fill-amber-400 text-amber-500' : ''}`}
                        />
                      </span>
                      <Plus className="h-4 w-4 text-primary" />
                    </span>
                  </div>
                ))}
                {filteredExercises.length === 0 && (
                  <p className="py-8 text-center text-xs text-muted-foreground">No exercises match these filters.</p>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
