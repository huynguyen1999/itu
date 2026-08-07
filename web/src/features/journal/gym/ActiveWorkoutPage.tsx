import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Dumbbell, Plus, Timer, Trash2, Clock } from 'lucide-react';
import { useJournalEntry, useExerciseDefinitions } from '../journalQueries';
import { useCreateJournalEntryMutation, useUpdateJournalEntryMutation, useCreateExerciseDefinitionMutation } from '../journalMutations';
import { RestTimer } from './RestTimer';
import { createUlid } from '@/shared/sync/syncIdentity';
import type { JournalWorkoutExercise, JournalWorkoutSet } from '../journal.types';

export function ActiveWorkoutPage() {
  const navigate = useNavigate();
  const { entryId } = useParams();

  const isNew = !entryId || entryId === 'new';
  const { data: existingEntry, isLoading } = useJournalEntry(entryId || '', isNew);
  const { data: exerciseDefs = [] } = useExerciseDefinitions();

  const createMutation = useCreateJournalEntryMutation();
  const updateMutation = useUpdateJournalEntryMutation();
  const createExerciseDefMutation = useCreateExerciseDefinitionMutation();

  const [id, setId] = useState(entryId || createUlid());
  const [title, setTitle] = useState('Push A');
  const [exercises, setExercises] = useState<JournalWorkoutExercise[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const [showRestTimer, setShowRestTimer] = useState(false);
  const [restDuration, setRestDuration] = useState(120);

  const [selectedExDefId, setSelectedExDefId] = useState('');
  const [newExName, setNewExName] = useState('');

  useEffect(() => {
    if (existingEntry?.workout) {
      setTitle(existingEntry.title || 'Active Workout');
      setExercises(existingEntry.workout.exercises || []);
    } else if (isNew) {
      // Default exercise set
      setExercises([
        {
          id: createUlid(),
          workoutEntryId: id,
          exerciseId: 'ex-bench-press',
          exerciseName: 'Barbell Bench Press',
          sortOrder: 0,
          note: 'Keep elbows tucked, focus on chest drive',
          sets: [
            { id: createUlid(), workoutExerciseId: '', sortOrder: 0, weight: 60, reps: 10 },
            { id: createUlid(), workoutExerciseId: '', sortOrder: 1, weight: 70, reps: 8 },
            { id: createUlid(), workoutExerciseId: '', sortOrder: 2, weight: 70, reps: 8 },
          ],
        },
      ]);
    }
  }, [existingEntry, isNew, id]);

  // Live session duration timer
  useEffect(() => {
    const interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
  };

  // Compute metrics
  let totalVolume = 0;
  let completedSetsCount = 0;
  let totalSetsCount = 0;

  for (const ex of exercises) {
    for (const set of ex.sets) {
      totalSetsCount++;
      if ((set as any).completed) completedSetsCount++;
      totalVolume += (set.weight || 0) * (set.reps || 0);
    }
  }

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
      exerciseId: exId || createUlid(),
      exerciseName: exName || newExName.trim() || 'Exercise',
      sortOrder: exercises.length,
      note: '',
      sets: [
        { id: createUlid(), workoutExerciseId: '', sortOrder: 0, weight: 20, reps: 10 },
      ],
    };

    setExercises([...exercises, newEx]);
    setSelectedExDefId('');
    setNewExName('');
  };

  const handleToggleSetCompletion = (exIdx: number, setIdx: number) => {
    const updated = [...exercises];
    const targetSet = { ...updated[exIdx].sets[setIdx] } as any;
    targetSet.completed = !targetSet.completed;
    updated[exIdx].sets[setIdx] = targetSet;
    setExercises(updated);

    if (targetSet.completed) {
      setShowRestTimer(true);
      setRestDuration(120);
    }
  };

  const handleEndWorkout = async () => {
    const durationMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    const workoutData = {
      startedAt: new Date().toISOString(),
      durationMinutes,
      exercises,
    };

    if (isNew) {
      await createMutation.mutateAsync({
        id,
        kind: 'WORKOUT',
        title: title || 'Workout Session',
        entryDate: new Date().toISOString().split('T')[0],
        workout: workoutData,
      });
    } else {
      await updateMutation.mutateAsync({
        id,
        title,
        workout: workoutData,
      });
    }

    navigate('/journal/gym');
  };

  if (isLoading) {
    return <div className="text-center py-16 text-muted-foreground text-sm">Loading active workout...</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-24">
      {/* Session Top Header */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border/80 bg-background/90 backdrop-blur px-4 py-3 rounded-2xl shadow-md">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/journal/gym')}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-base font-bold text-foreground bg-transparent outline-none"
            />
            <p className="text-[10px] text-muted-foreground">Active Training Session</p>
          </div>
        </div>

        {/* Live Metrics Header */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-1.5 text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
            <Clock className="w-3.5 h-3.5" />
            <span className="font-bold">{formatTimer(elapsedSeconds)}</span>
          </div>

          <div className="hidden sm:block text-muted-foreground">
            Sets: <span className="font-bold text-foreground">{completedSetsCount}/{totalSetsCount}</span>
          </div>

          <div className="hidden sm:block text-muted-foreground">
            Volume: <span className="font-bold text-foreground">{totalVolume.toLocaleString()} kg</span>
          </div>

          <button
            type="button"
            onClick={() => void handleEndWorkout()}
            className="px-4 py-1.5 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-lg transition-colors shadow-md"
          >
            End Workout
          </button>
        </div>
      </div>

      {/* Exercises List */}
      <div className="space-y-6">
        {exercises.map((ex, exIdx) => (
          <div key={ex.id || exIdx} className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-foreground">{ex.exerciseName || 'Exercise'}</h3>
                <input
                  type="text"
                  placeholder="Contextual note (e.g. 'Keep elbows tucked')..."
                  value={ex.note || ''}
                  onChange={(e) => {
                    const updated = [...exercises];
                    updated[exIdx].note = e.target.value;
                    setExercises(updated);
                  }}
                  className="w-full text-xs text-muted-foreground bg-transparent outline-none placeholder:text-muted-foreground/40 mt-0.5"
                />
              </div>

              <button
                type="button"
                onClick={() => setExercises(exercises.filter((_, i) => i !== exIdx))}
                className="p-1 text-destructive/70 hover:text-destructive hover:bg-destructive/10 rounded-lg"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Set Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="border-b border-border/40 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 px-2 w-12">Set</th>
                    <th className="py-2 px-2">Previous</th>
                    <th className="py-2 px-2 w-24">kg</th>
                    <th className="py-2 px-2 w-24">Reps</th>
                    <th className="py-2 px-2 text-center w-16">✓</th>
                    <th className="py-2 px-2 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {ex.sets.map((set, setIdx) => {
                    const isCompleted = Boolean((set as any).completed);
                    return (
                      <tr
                        key={set.id || setIdx}
                        className={`transition-colors ${isCompleted ? 'bg-emerald-500/5' : 'hover:bg-muted/20'}`}
                      >
                        <td className="py-2.5 px-2 font-mono font-bold text-muted-foreground">{setIdx + 1}</td>
                        <td className="py-2.5 px-2 font-mono text-muted-foreground/80">
                          {setIdx === 0 ? '60kg × 10' : setIdx === 1 ? '70kg × 8' : '70kg × 8'}
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            value={set.weight}
                            onChange={(e) => {
                              const updated = [...exercises];
                              updated[exIdx].sets[setIdx].weight = parseFloat(e.target.value) || 0;
                              setExercises(updated);
                            }}
                            className="w-20 rounded-md border border-input bg-background/50 px-2 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="py-2.5 px-2">
                          <input
                            type="number"
                            value={set.reps}
                            onChange={(e) => {
                              const updated = [...exercises];
                              updated[exIdx].sets[setIdx].reps = parseInt(e.target.value, 10) || 0;
                              setExercises(updated);
                            }}
                            className="w-20 rounded-md border border-input bg-background/50 px-2 py-1 text-xs text-foreground font-mono focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleSetCompletion(exIdx, setIdx)}
                            className={`p-1.5 rounded-lg border transition-all ${
                              isCompleted
                                ? 'border-emerald-500 bg-emerald-500 text-emerald-950 shadow-sm'
                                : 'border-border text-muted-foreground hover:bg-muted'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5 stroke-[3]" />
                          </button>
                        </td>
                        <td className="py-2.5 px-2">
                          <button
                            type="button"
                            onClick={() => {
                              const updated = [...exercises];
                              updated[exIdx].sets = updated[exIdx].sets.filter((_, i) => i !== setIdx);
                              setExercises(updated);
                            }}
                            className="p-1 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
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
              onClick={() => {
                const updated = [...exercises];
                const lastSet = ex.sets[ex.sets.length - 1];
                updated[exIdx].sets.push({
                  id: createUlid(),
                  workoutExerciseId: '',
                  sortOrder: ex.sets.length,
                  weight: lastSet ? lastSet.weight : 20,
                  reps: lastSet ? lastSet.reps : 10,
                });
                setExercises(updated);
              }}
              className="flex items-center gap-1 text-xs text-emerald-500 font-semibold hover:underline pt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Set
            </button>
          </div>
        ))}
      </div>

      {/* Add Exercise Controller */}
      <div className="rounded-2xl border border-dashed border-border bg-card/60 p-4 flex flex-wrap items-center gap-3">
        <select
          value={selectedExDefId}
          onChange={(e) => setSelectedExDefId(e.target.value)}
          className="rounded-xl border border-input bg-background/50 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 min-w-[200px]"
        >
          <option value="">Select Existing Exercise...</option>
          {exerciseDefs.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>

        <span className="text-xs text-muted-foreground font-medium">OR</span>

        <input
          type="text"
          placeholder="New Exercise Name..."
          value={newExName}
          onChange={(e) => setNewExName(e.target.value)}
          className="rounded-xl border border-input bg-background/50 px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500 flex-1 min-w-[180px]"
        />

        <button
          type="button"
          onClick={() => void handleAddExercise()}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add Exercise
        </button>
      </div>

      {/* Floating Rest Timer */}
      {showRestTimer && (
        <RestTimer
          initialSeconds={restDuration}
          onClose={() => setShowRestTimer(false)}
          onFinish={() => setShowRestTimer(false)}
        />
      )}
    </div>
  );
}
