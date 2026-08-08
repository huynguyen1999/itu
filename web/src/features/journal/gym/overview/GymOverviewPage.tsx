import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, Plus, Flame, Layers, Trophy, Clock, Calendar, ArrowRight } from 'lucide-react';
import { useJournalEntries } from '../../journalQueries';

export function GymOverviewPage() {
  const navigate = useNavigate();
  const { data: entries = [], isLoading } = useJournalEntries({ kind: 'WORKOUT' });

  const workoutEntries = entries.filter((e) => e.kind === 'WORKOUT' && e.workout);

  let totalWorkouts = workoutEntries.length;
  let totalSets = 0;
  let totalVolume = 0;
  let totalPRs = 0;

  for (const entry of workoutEntries) {
    if (!entry.workout?.exercises) continue;
    for (const ex of entry.workout.exercises) {
      for (const set of ex.sets || []) {
        totalSets++;
        totalVolume += (set.weight || 0) * (set.reps || 0);
      }
    }
  }

  const recentWorkouts = [...workoutEntries]
    .sort((a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime())
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Hero Action Card: Start Empty Workout */}
      <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-card to-card p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1 max-w-md">
          <div className="flex items-center gap-2 text-emerald-400">
            <Dumbbell className="w-5 h-5" />
            <h2 className="text-lg font-bold">Start Workout</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Spontaneous logging first. Log exercises, sets, weights, and rest periods on the fly.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate('/journal/gym/active/new')}
          className="flex items-center gap-2 px-6 py-3 text-sm font-extrabold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-98"
        >
          <Plus className="w-5 h-5 stroke-[2.5]" />
          Start Empty Workout
        </button>
      </div>

      {/* Weekly Stats Summary */}
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
              <p className="text-xs text-muted-foreground font-medium">Workouts logged</p>
            </div>
          </div>

          <div className="p-4 rounded-xl border border-border/60 bg-muted/20 flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-500">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-2xl font-extrabold text-foreground">{totalSets}</p>
              <p className="text-xs text-muted-foreground font-medium">Total sets</p>
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
              <p className="text-xs text-muted-foreground font-medium">Volume lifted</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Workouts */}
      <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">Recent Workouts</h3>
          <button
            type="button"
            onClick={() => navigate('/journal/gym/history')}
            className="flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            View all history
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {recentWorkouts.length === 0 ? (
          <div className="text-center py-8 text-xs text-muted-foreground">
            No workouts logged yet. Click "Start Empty Workout" above.
          </div>
        ) : (
          <div className="divide-y divide-border/40">
            {recentWorkouts.map((e) => {
              const workout = e.workout!;
              let setsCount = 0;
              let vol = 0;
              for (const ex of workout.exercises || []) {
                for (const s of ex.sets || []) {
                  setsCount++;
                  vol += (s.weight || 0) * (s.reps || 0);
                }
              }
              return (
                <div
                  key={e.id}
                  onClick={() => navigate(`/journal/gym/active/${e.id}`)}
                  className="py-3 flex items-center justify-between cursor-pointer hover:bg-muted/20 transition-colors rounded-lg px-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      <Dumbbell className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">{e.title || 'Workout Session'}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {e.entryDate} · {workout.exercises?.length || 0} exercises
                      </p>
                    </div>
                  </div>

                  <div className="text-right text-xs">
                    <p className="font-bold text-foreground">{setsCount} sets</p>
                    <p className="font-mono text-[11px] text-emerald-400">{vol.toLocaleString()} kg</p>
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
