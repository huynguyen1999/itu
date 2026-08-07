import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, Plus, Play, Calendar, Flame, Trophy, Clock, Layers } from 'lucide-react';
import { useJournalEntries } from '../journalQueries';
import type { JournalEntry } from '../journal.types';

const PRESET_ROUTINES = [
  { id: 'routine-push-a', name: 'Push A', exerciseCount: 6, targetSets: 18, muscleGroups: 'Chest, Shoulders, Triceps' },
  { id: 'routine-pull-a', name: 'Pull A', exerciseCount: 7, targetSets: 21, muscleGroups: 'Back, Biceps, Rear Delts' },
  { id: 'routine-legs-a', name: 'Legs A', exerciseCount: 5, targetSets: 15, muscleGroups: 'Quads, Hamstrings, Calves' },
];

export function GymDashboardPage() {
  const navigate = useNavigate();
  const { data: entries = [], isLoading } = useJournalEntries({ kind: 'WORKOUT' });

  const workoutEntries = entries.filter((e) => e.kind === 'WORKOUT' && e.workout);

  // Compute weekly stats
  let totalWorkouts = workoutEntries.length;
  let totalSets = 0;
  let totalVolume = 0;

  for (const entry of workoutEntries) {
    if (!entry.workout?.exercises) continue;
    for (const ex of entry.workout.exercises) {
      for (const set of ex.sets || []) {
        totalSets++;
        totalVolume += (set.weight || 0) * (set.reps || 0);
      }
    }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
            <Dumbbell className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Gym Tracker</h1>
            <p className="text-xs text-muted-foreground">Workouts, routines & training progress</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => navigate('/journal/gym/active/new')}
          className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-md"
        >
          <Plus className="w-4 h-4" />
          Start workout
        </button>
      </div>

      {/* Weekly Stats Overview */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          This Week Summary
        </span>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-border/60 bg-muted/20 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-500">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-foreground">{totalWorkouts}</p>
              <p className="text-xs text-muted-foreground font-medium">Workouts completed</p>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border/60 bg-muted/20 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-foreground">{totalSets}</p>
              <p className="text-xs text-muted-foreground font-medium">Total sets logged</p>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border/60 bg-muted/20 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-500">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-foreground">
                {totalVolume > 0 ? `${(totalVolume / 1000).toFixed(1)}k` : '0'} kg
              </p>
              <p className="text-xs text-muted-foreground font-medium">Total volume lifted</p>
            </div>
          </div>
        </div>
      </div>

      {/* Routines Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
            Routines
          </h3>
          <span className="text-xs text-muted-foreground">Reusable training plans</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PRESET_ROUTINES.map((routine) => (
            <div
              key={routine.id}
              className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm hover:border-emerald-500/40 transition-all space-y-3 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-base font-bold text-foreground">{routine.name}</h4>
                  <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
                    {routine.exerciseCount} exercises
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{routine.muscleGroups}</p>
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

      {/* Recent Workouts History */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
          Recent Workouts
        </h3>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Loading workout history...
          </div>
        ) : workoutEntries.length === 0 ? (
          <div className="text-center py-12 rounded-2xl border border-dashed border-border bg-card/40 p-8 space-y-3">
            <Dumbbell className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium text-foreground">No workouts recorded yet</p>
            <p className="text-xs text-muted-foreground">Start a session to log your training.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/80 bg-card divide-y divide-border/40 overflow-hidden shadow-sm">
            {workoutEntries.map((entry) => {
              const workout = entry.workout!;
              const exercisesCount = workout.exercises?.length || 0;
              let setsCount = 0;
              let volume = 0;

              for (const ex of workout.exercises || []) {
                for (const set of ex.sets || []) {
                  setsCount++;
                  volume += (set.weight || 0) * (set.reps || 0);
                }
              }

              return (
                <div
                  key={entry.id}
                  onClick={() => navigate(`/journal/gym/active/${entry.id}`)}
                  className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Dumbbell className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">{entry.title || 'Workout Session'}</p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {entry.entryDate}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {workout.durationMinutes ? `${workout.durationMinutes} min` : '45 min'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <p className="font-bold text-foreground">{setsCount} sets ({exercisesCount} exercises)</p>
                    <p className="text-[11px] font-mono text-emerald-400">{volume.toLocaleString()} kg volume</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
