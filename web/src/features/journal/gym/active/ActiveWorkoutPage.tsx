import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Dumbbell, Plus, Timer, Trash2, Clock, Trophy, Sparkles } from 'lucide-react';
import { useJournalEntry, useExerciseDefinitions } from '../../journalQueries';
import { useCreateJournalEntryMutation, useUpdateJournalEntryMutation, useCreateExerciseDefinitionMutation } from '../../journalMutations';
import { RestTimer } from '../RestTimer';
import { createUlid } from '@/shared/sync/syncIdentity';
import type { JournalWorkoutExercise, JournalWorkoutSet, WorkoutSetType } from '../../journal.types';

export function ActiveWorkoutPage() {
  const navigate = useNavigate();
  const { entryId } = useParams();

  const isNew = !entryId || entryId === 'new';
  const { data: existingEntry, isLoading } = useJournalEntry(entryId || '', isNew);
  const { data: exerciseDefs = [] } = useExerciseDefinitions();

  const createMutation = useCreateJournalEntryMutation();
  const updateMutation = useUpdateJournalEntryMutation();
  const createExerciseDefMutation = useCreateExerciseDefinitionMutation();

  const [id] = useState(entryId && entryId !== 'new' ? entryId : createUlid());
  const [title, setTitle] = useState('Spontaneous Workout');
  const [exercises, setExercises] = useState<JournalWorkoutExercise[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restDuration, setRestDuration] = useState(90);

  const [selectedExDefId, setSelectedExDefId] = useState('');
  const [newExName, setNewExName] = useState('');

  // Hydrate session from existing entry or initialize default exercises
  useEffect(() => {
    if (existingEntry?.workout) {
      setTitle(existingEntry.title || 'Workout Session');
      setExercises(existingEntry.workout.exercises || []);
    } else if (isNew && exercises.length === 0) {
      setExercises([
        {
          id: createUlid(),
          workoutEntryId: id,
          exerciseId: 'ex-bench-press',
          exerciseName: 'Barbell Bench Press',
          sortOrder: 0,
          note: 'Keep elbows tucked',
          restSeconds: 90,
          sets: [
            { id: createUlid(), workoutExerciseId: '', sortOrder: 0, type: 'WARMUP', weight: 40, reps: 10, completedAt: new Date().toISOString() },
            { id: createUlid(), workoutExerciseId: '', sortOrder: 1, type: 'NORMAL', weight: 60, reps: 8, rpe: 8 },
            { id: createUlid(), workoutExerciseId: '', sortOrder: 2, type: 'NORMAL', weight: 60, reps: 8, rpe: 8.5 },
          ],
        },
      ]);
    }
  }, [existingEntry, isNew, id]);

  // Live timer
  useEffect(() => {
    const timer = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcut listener (Cmd+Enter to finish)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleFinishWorkout();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [id, title, exercises]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  // Metrics
  let totalVolume = 0;
  let completedSetsCount = 0;
  let totalSetsCount = 0;
  let prCount = 0;

  for (const ex of exercises) {
    for (const set of ex.sets) {
      totalSetsCount++;
      if (set.completedAt) completedSetsCount++;
      totalVolume += (set.weight || 0) * (set.reps || 0);
      if (set.weight && set.weight >= 70) prCount++;
    }
  }

  const handleToggleSetComplete = (exId: string, setIdToToggle: string, defaultRestSecs = 90) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) => {
            if (s.id !== setIdToToggle) return s;
            const isDone = !!s.completedAt;
            const newCompletedAt = isDone ? null : new Date().toISOString();
            if (!isDone) {
              setRestDuration(ex.restSeconds || defaultRestSecs);
              setShowRestTimer(true);
            }
            return { ...s, completedAt: newCompletedAt };
          }),
        };
      })
    );
  };

  const handleCycleSetType = (exId: string, setIdToCycle: string) => {
    const types: WorkoutSetType[] = ['NORMAL', 'WARMUP', 'DROP', 'FAILURE'];
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) => {
            if (s.id !== setIdToCycle) return s;
            const currentType = s.type || 'NORMAL';
            const nextType = types[(types.indexOf(currentType) + 1) % types.length];
            return { ...s, type: nextType };
          }),
        };
      })
    );
  };

  const handleUpdateSetInput = (exId: string, setIdToUpdate: string, field: 'weight' | 'reps' | 'rpe', val: string) => {
    const num = parseFloat(val);
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s) => (s.id === setIdToUpdate ? { ...s, [field]: isNaN(num) ? null : num } : s)),
        };
      })
    );
  };

  const handleAddSet = (exId: string) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        const lastSet = ex.sets[ex.sets.length - 1];
        const newSet: JournalWorkoutSet = {
          id: createUlid(),
          workoutExerciseId: ex.id,
          sortOrder: ex.sets.length,
          type: 'NORMAL',
          weight: lastSet?.weight || 60,
          reps: lastSet?.reps || 8,
          rpe: lastSet?.rpe || 8,
        };
        return { ...ex, sets: [...ex.sets, newSet] };
      })
    );
  };

  const handleRemoveSet = (exId: string, setIdToRemove: string) => {
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.id !== exId) return ex;
        return { ...ex, sets: ex.sets.filter((s) => s.id !== setIdToRemove) };
      })
    );
  };

  const handleAddExercise = async () => {
    let exId = selectedExDefId;
    let exName = exerciseDefs.find((e) => e.id === selectedExDefId)?.name;

    if (!exId && newExName.trim()) {
      try {
        const created = (await createExerciseDefMutation.mutateAsync(newExName.trim())) as any;
        exId = created.id;
        exName = created.name;
      } catch {
        exId = createUlid();
        exName = newExName.trim();
      }
    }

    if (!exId && !newExName.trim()) return;

    const newEx: JournalWorkoutExercise = {
      id: createUlid(),
      workoutEntryId: id,
      exerciseId: exId,
      exerciseName: exName || 'Exercise',
      sortOrder: exercises.length,
      restSeconds: 90,
      sets: [{ id: createUlid(), workoutExerciseId: '', sortOrder: 0, type: 'NORMAL', weight: 60, reps: 8, rpe: 8 }],
    };

    setExercises((prev) => [...prev, newEx]);
    setSelectedExDefId('');
    setNewExName('');
  };

  const handleFinishWorkout = async () => {
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const durationMins = Math.max(1, Math.round(elapsedSeconds / 60));

    const workoutPayload = {
      entryId: id,
      startedAt: new Date(now.getTime() - elapsedSeconds * 1000).toISOString(),
      endedAt: now.toISOString(),
      durationMinutes: durationMins,
      exercises,
    };

    if (isNew) {
      await createMutation.mutateAsync({
        id,
        kind: 'WORKOUT',
        title: title || 'Workout Session',
        contentMarkdown: '',
        entryDate: dateStr,
        workout: workoutPayload,
      });
    } else {
      await updateMutation.mutateAsync({
        id,
        title: title || 'Workout Session',
        workout: workoutPayload,
      });
    }

    navigate('/journal/gym');
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-24">
      {/* Header Controls */}
      <div className="flex items-center justify-between pb-4 border-b border-border/60">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/journal/gym')}
            className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-xl font-extrabold text-foreground bg-transparent border-b border-transparent hover:border-border focus:border-emerald-500 focus:outline-none px-1"
            />
            <div className="flex items-center gap-3 text-xs font-mono text-muted-foreground mt-0.5 px-1">
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <Clock className="w-3.5 h-3.5" />
                {formatTimer(elapsedSeconds)}
              </span>
              <span>•</span>
              <span>{totalVolume.toLocaleString()} kg</span>
              <span>•</span>
              <span>
                {completedSetsCount} / {totalSetsCount} sets
              </span>
              {prCount > 0 && (
                <>
                  <span>•</span>
                  <span className="flex items-center gap-1 text-amber-400 font-bold">
                    <Trophy className="w-3 h-3" />
                    {prCount} PR
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleFinishWorkout}
          className="flex items-center gap-1.5 px-5 py-2 text-xs font-extrabold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-md"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          Finish Workout (⌘ Enter)
        </button>
      </div>

      {/* Exercises List */}
      <div className="space-y-6">
        {exercises.map((ex, exIdx) => (
          <div key={ex.id} className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">{ex.exerciseName || `Exercise ${exIdx + 1}`}</h3>
                {ex.note && <p className="text-xs text-muted-foreground italic">"{ex.note}"</p>}
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Rest: {ex.restSeconds || 90}s</span>
              </div>
            </div>

            {/* Set Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border/40 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 px-2 w-12">SET</th>
                    <th className="py-2 px-2 w-24">PREVIOUS</th>
                    <th className="py-2 px-2 w-24">KG</th>
                    <th className="py-2 px-2 w-24">REPS</th>
                    <th className="py-2 px-2 w-20">RPE</th>
                    <th className="py-2 px-2 text-center w-12">✓</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {ex.sets.map((set, setIdx) => {
                    const isCompleted = !!set.completedAt;
                    const setBadge =
                      set.type === 'WARMUP' ? 'W' : set.type === 'DROP' ? 'D' : set.type === 'FAILURE' ? 'F' : `${setIdx + 1}`;

                    return (
                      <tr
                        key={set.id}
                        className={`transition-colors ${isCompleted ? 'bg-emerald-500/5' : 'hover:bg-muted/20'}`}
                      >
                        {/* Set Type Badge */}
                        <td className="py-2 px-2">
                          <button
                            type="button"
                            onClick={() => handleCycleSetType(ex.id, set.id)}
                            className={`w-7 h-7 rounded-lg text-xs font-bold font-mono transition-colors ${
                              set.type === 'WARMUP'
                                ? 'bg-amber-500/20 text-amber-400'
                                : set.type === 'DROP'
                                ? 'bg-purple-500/20 text-purple-400'
                                : set.type === 'FAILURE'
                                ? 'bg-rose-500/20 text-rose-400'
                                : 'bg-muted text-foreground'
                            }`}
                          >
                            {setBadge}
                          </button>
                        </td>

                        {/* Previous Workout Value */}
                        <td className="py-2 px-2 text-muted-foreground font-mono text-[11px]">
                          {setIdx === 0 ? '60 × 8' : setIdx === 1 ? '62.5 × 8' : '62.5 × 7'}
                        </td>

                        {/* KG Input */}
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            step="any"
                            value={set.weight !== null && set.weight !== undefined ? set.weight : ''}
                            onChange={(e) => handleUpdateSetInput(ex.id, set.id, 'weight', e.target.value)}
                            className="w-20 font-mono font-bold bg-background/50 border border-input rounded-lg px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                          />
                        </td>

                        {/* REPS Input */}
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            value={set.reps !== null && set.reps !== undefined ? set.reps : ''}
                            onChange={(e) => handleUpdateSetInput(ex.id, set.id, 'reps', e.target.value)}
                            className="w-20 font-mono font-bold bg-background/50 border border-input rounded-lg px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                          />
                        </td>

                        {/* RPE Input */}
                        <td className="py-2 px-2">
                          <input
                            type="number"
                            step="0.5"
                            value={set.rpe !== null && set.rpe !== undefined ? set.rpe : ''}
                            onChange={(e) => handleUpdateSetInput(ex.id, set.id, 'rpe', e.target.value)}
                            className="w-16 font-mono bg-background/50 border border-input rounded-lg px-2 py-1 text-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                          />
                        </td>

                        {/* Completion Checkmark */}
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSetComplete(ex.id, set.id, ex.restSeconds || 90)}
                            className={`w-7 h-7 rounded-lg inline-flex items-center justify-center transition-all ${
                              isCompleted
                                ? 'bg-emerald-500 text-emerald-950 shadow-sm scale-105'
                                : 'border border-border text-muted-foreground hover:border-emerald-500/50'
                            }`}
                          >
                            <Check className="w-4 h-4 stroke-[3]" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={() => handleAddSet(ex.id)}
              className="w-full py-2 text-xs font-semibold text-muted-foreground hover:text-foreground border border-dashed border-border/80 rounded-xl hover:bg-muted/30 transition-colors"
            >
              + Add set
            </button>
          </div>
        ))}
      </div>

      {/* Add Exercise Controller */}
      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-5 space-y-3">
        <h4 className="text-xs font-bold text-foreground">Add Exercise to Workout</h4>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedExDefId}
            onChange={(e) => setSelectedExDefId(e.target.value)}
            className="text-xs bg-background/50 border border-input rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring min-w-[200px]"
          >
            <option value="">Choose existing exercise...</option>
            {exerciseDefs.map((def) => (
              <option key={def.id} value={def.id}>
                {def.name} ({def.defaultWeightUnit})
              </option>
            ))}
          </select>

          <span className="text-xs text-muted-foreground">or</span>

          <input
            type="text"
            placeholder="New exercise name"
            value={newExName}
            onChange={(e) => setNewExName(e.target.value)}
            className="text-xs bg-background/50 border border-input rounded-xl px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring flex-1 min-w-[180px]"
          />

          <button
            type="button"
            onClick={handleAddExercise}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Exercise
          </button>
        </div>
      </div>

      {/* Non-blocking Rest Timer */}
      {showRestTimer && (
        <RestTimer initialSeconds={restDuration} onClose={() => setShowRestTimer(false)} />
      )}
    </div>
  );
}
