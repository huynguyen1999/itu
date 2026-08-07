import { useState } from 'react';
import { Dumbbell, Plus, Trash2 } from 'lucide-react';
import { useExerciseDefinitions } from '../journalQueries';
import type { JournalWorkout, JournalWorkoutExercise, JournalWorkoutSet } from '../journal.types';
import { api } from '../../../shared/api/client';
import { useQueryClient } from '@tanstack/react-query';
import { createUlid } from '../../../shared/sync/syncIdentity';

interface WorkoutEditorProps {
  workout?: JournalWorkout | null;
  onChange: (workout: Partial<JournalWorkout>) => void;
}

export function WorkoutEditor({ workout, onChange }: WorkoutEditorProps) {
  const { data: exerciseDefs = [] } = useExerciseDefinitions();
  const queryClient = useQueryClient();
  const [selectedExDefId, setSelectedExDefId] = useState('');
  const [newExName, setNewExName] = useState('');

  const exercises = workout?.exercises || [];

  const handleAddExercise = async () => {
    let exerciseId = selectedExDefId;
    let exerciseName = exerciseDefs.find((e) => e.id === selectedExDefId)?.name;

    if (!exerciseId && newExName.trim()) {
      try {
        const res = await api.post('/journal/tags', {}); // placeholder or search/create exercise
        const exercises = (await api.get<any[]>('/journal/exercises')).data;
        const created = exercises.find(
          (e: any) => e.name.toLowerCase() === newExName.trim().toLowerCase(),
        );
        if (created) {
          exerciseId = created.id;
          exerciseName = created.name;
        }
      } catch (err) {
        console.error('Failed to create exercise definition', err);
      }
    }

    if (!exerciseId && newExName.trim()) {
      exerciseId = createUlid();
      exerciseName = newExName.trim();
    }

    if (!exerciseId) return;

    const newExercise: JournalWorkoutExercise = {
      id: createUlid(),
      workoutEntryId: workout?.entryId || '',
      exerciseId,
      exerciseName: exerciseName || 'Exercise',
      sortOrder: exercises.length,
      sets: [
        {
          id: createUlid(),
          workoutExerciseId: '',
          sortOrder: 0,
          reps: 10,
          weight: 20,
        },
      ],
    };

    onChange({
      ...workout,
      exercises: [...exercises, newExercise],
    });
    setSelectedExDefId('');
    setNewExName('');
  };

  const handleRemoveExercise = (exIndex: number) => {
    const updated = exercises.filter((_, idx) => idx !== exIndex);
    onChange({ ...workout, exercises: updated });
  };

  const handleAddSet = (exIndex: number) => {
    const ex = exercises[exIndex];
    const lastSet = ex.sets[ex.sets.length - 1];
    const newSet: JournalWorkoutSet = {
      id: createUlid(),
      workoutExerciseId: ex.id,
      sortOrder: ex.sets.length,
      reps: lastSet ? lastSet.reps : 10,
      weight: lastSet ? lastSet.weight : 20,
    };
    const updatedEx = { ...ex, sets: [...ex.sets, newSet] };
    const updatedExercises = [...exercises];
    updatedExercises[exIndex] = updatedEx;
    onChange({ ...workout, exercises: updatedExercises });
  };

  const handleSetChange = (exIndex: number, setIndex: number, field: 'reps' | 'weight', val: number) => {
    const ex = exercises[exIndex];
    const updatedSets = [...ex.sets];
    updatedSets[setIndex] = { ...updatedSets[setIndex], [field]: val };
    const updatedExercises = [...exercises];
    updatedExercises[exIndex] = { ...ex, sets: updatedSets };
    onChange({ ...workout, exercises: updatedExercises });
  };

  const handleRemoveSet = (exIndex: number, setIndex: number) => {
    const ex = exercises[exIndex];
    const updatedSets = ex.sets.filter((_, idx) => idx !== setIndex);
    const updatedExercises = [...exercises];
    updatedExercises[exIndex] = { ...ex, sets: updatedSets };
    onChange({ ...workout, exercises: updatedExercises });
  };

  return (
    <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800/80 space-y-4 shadow-inner">
      <div className="flex items-center justify-between text-xs font-semibold text-sky-400">
        <span className="flex items-center gap-1.5">
          <Dumbbell className="w-4 h-4" />
          Gym Workout Details
        </span>
        <span className="text-[10px] text-slate-400 font-normal">Synced as aggregate workout structure</span>
      </div>

      <div className="space-y-3">
        {exercises.map((ex, exIdx) => (
          <div key={ex.id || exIdx} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs font-medium text-slate-200">
              <span>
                {exIdx + 1}. {ex.exerciseName || 'Exercise'}
              </span>
              <button
                type="button"
                onClick={() => handleRemoveExercise(exIdx)}
                className="text-slate-500 hover:text-rose-400 transition-colors p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="space-y-1 text-xs">
              <div className="grid grid-cols-12 gap-2 text-[10px] text-slate-500 font-medium uppercase px-1">
                <span className="col-span-2">Set</span>
                <span className="col-span-4">Weight (kg)</span>
                <span className="col-span-4">Reps</span>
                <span className="col-span-2"></span>
              </div>

              {ex.sets.map((set, setIdx) => (
                <div key={set.id || setIdx} className="grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-2 text-slate-400 font-mono text-center">{setIdx + 1}</span>
                  <input
                    type="number"
                    step="any"
                    value={set.weight || ''}
                    onChange={(e) => handleSetChange(exIdx, setIdx, 'weight', parseFloat(e.target.value) || 0)}
                    className="col-span-4 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                  />
                  <input
                    type="number"
                    value={set.reps || ''}
                    onChange={(e) => handleSetChange(exIdx, setIdx, 'reps', parseInt(e.target.value) || 0)}
                    className="col-span-4 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1 text-slate-100 font-mono text-xs focus:outline-none focus:border-sky-500"
                  />
                  <div className="col-span-2 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemoveSet(exIdx, setIdx)}
                      className="text-slate-600 hover:text-rose-400 p-1 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => handleAddSet(exIdx)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 transition-colors font-medium"
              >
                <Plus className="w-3 h-3" />
                Add Set
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-2 border-t border-slate-800/60 flex flex-wrap gap-2 items-center text-xs">
        <select
          value={selectedExDefId}
          onChange={(e) => setSelectedExDefId(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 flex-1 min-w-[140px]"
        >
          <option value="">Choose exercise...</option>
          {exerciseDefs.map((def) => (
            <option key={def.id} value={def.id}>
              {def.name}
            </option>
          ))}
        </select>

        <span className="text-slate-500 text-[11px]">or</span>

        <input
          type="text"
          placeholder="New exercise name..."
          value={newExName}
          onChange={(e) => setNewExName(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-sky-500 flex-1 min-w-[140px]"
        />

        <button
          type="button"
          onClick={() => void handleAddExercise()}
          className="px-3 py-1.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white font-medium transition-colors inline-flex items-center gap-1"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Exercise
        </button>
      </div>
    </div>
  );
}
