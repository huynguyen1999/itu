import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Play, BookOpen, Clock, Dumbbell } from 'lucide-react';

interface RoutineItem {
  id: string;
  name: string;
  exerciseCount: number;
  estimatedMinutes: number;
  muscleGroups: string;
  lastUsed: string;
}

const sampleRoutines: RoutineItem[] = [
  { id: 'r1', name: 'Push A', exerciseCount: 6, estimatedMinutes: 55, muscleGroups: 'Chest, Shoulders, Triceps', lastUsed: 'Aug 4' },
  { id: 'r2', name: 'Pull A', exerciseCount: 7, estimatedMinutes: 60, muscleGroups: 'Back, Biceps, Rear Delts', lastUsed: 'Aug 2' },
  { id: 'r3', name: 'Legs A', exerciseCount: 5, estimatedMinutes: 50, muscleGroups: 'Quads, Hamstrings, Calves', lastUsed: 'Jul 29' },
];

export function RoutinesPage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-foreground">Workout Routines</h2>
          <p className="text-xs text-muted-foreground">Reusable routine templates for consistent training</p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/journal/gym/active/new')}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Routine
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {sampleRoutines.map((routine) => (
          <div
            key={routine.id}
            className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-foreground">{routine.name}</h3>
                <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
                  ~{routine.estimatedMinutes} min
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{routine.muscleGroups}</p>
              <p className="text-[11px] text-muted-foreground font-mono">
                {routine.exerciseCount} exercises · Last used: {routine.lastUsed}
              </p>
            </div>

            <button
              type="button"
              onClick={() => navigate('/journal/gym/active/new')}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-sm"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start Routine
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
