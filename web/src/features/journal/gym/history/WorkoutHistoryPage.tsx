import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dumbbell, Calendar, Clock, Trophy, Edit3, ArrowLeft } from 'lucide-react';
import { useJournalEntries } from '../../journalQueries';
import type { JournalEntry } from '../../journal.types';

export function WorkoutHistoryPage() {
  const navigate = useNavigate();
  const { data: entries = [], isLoading } = useJournalEntries({ kind: 'WORKOUT' });
  const [selectedEntry, setSelectedEntry] = useState<JournalEntry | null>(null);

  const workoutEntries = entries.filter((e) => e.kind === 'WORKOUT' && e.workout);
  const sortedWorkouts = [...workoutEntries].sort(
    (a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime()
  );

  return (
    <div className="space-y-6">
      {!selectedEntry ? (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Workout History</h2>
            <p className="text-xs text-muted-foreground">Read-only view of logged workout sessions</p>
          </div>

          {sortedWorkouts.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground">No workouts found in history.</div>
          ) : (
            <div className="rounded-2xl border border-border/80 bg-card divide-y divide-border/40 overflow-hidden shadow-sm">
              {sortedWorkouts.map((entry) => {
                const workout = entry.workout!;
                let totalSets = 0;
                let volume = 0;
                for (const ex of workout.exercises || []) {
                  for (const set of ex.sets || []) {
                    totalSets++;
                    volume += (set.weight || 0) * (set.reps || 0);
                  }
                }

                return (
                  <div
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className="p-4 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <Dumbbell className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">{entry.title || 'Workout Session'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {entry.entryDate} · {workout.exercises?.length || 0} exercises
                        </p>
                      </div>
                    </div>

                    <div className="text-right text-xs">
                      <p className="font-bold text-foreground">{totalSets} sets</p>
                      <p className="font-mono text-[11px] text-emerald-400">{volume.toLocaleString()} kg</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Read-only Workout Detail View */
        <div className="space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-border/60">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="p-2 rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-foreground">{selectedEntry.title || 'Workout Session'}</h2>
                <p className="text-xs text-muted-foreground font-mono">
                  Completed on {selectedEntry.entryDate} · {selectedEntry.workout?.durationMinutes || 45} mins
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => navigate(`/journal/gym/active/${selectedEntry.id}`)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-emerald-950 bg-emerald-500 hover:bg-emerald-400 rounded-xl transition-colors shadow-sm"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit Workout
            </button>
          </div>

          {/* Exercise Sets Read-only cards */}
          <div className="space-y-4">
            {selectedEntry.workout?.exercises.map((ex, i) => (
              <div key={ex.id} className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-3">
                <h4 className="text-sm font-bold text-foreground">
                  {i + 1}. {ex.exerciseName || 'Exercise'}
                </h4>
                <div className="space-y-1 text-xs">
                  {ex.sets.map((set, sIdx) => (
                    <div key={set.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/20">
                      <span className="font-mono font-semibold text-muted-foreground">Set {sIdx + 1}</span>
                      <span className="font-mono font-bold text-foreground">
                        {set.weight || 0} kg × {set.reps || 0} reps {set.rpe ? `(RPE ${set.rpe})` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
