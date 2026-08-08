import { useState } from 'react';
import { Search, Dumbbell, Trophy, ArrowRight } from 'lucide-react';
import { useExerciseDefinitions } from '../../journalQueries';
import type { ExerciseDefinition } from '../../journal.types';

export function ExerciseLibraryPage() {
  const { data: exerciseDefs = [] } = useExerciseDefinitions();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEx, setSelectedEx] = useState<ExerciseDefinition | null>(null);

  const filteredDefs = exerciseDefs.filter((def) =>
    !searchQuery.trim() || def.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Exercise Library & Analytics</h2>
        <p className="text-xs text-muted-foreground">Manage exercise definitions, personal records, and historical progression</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Left List (col-span-6) */}
        <div className="md:col-span-6 rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search exercises..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs bg-background/50 border border-input rounded-xl pl-9 pr-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="divide-y divide-border/40 max-h-[450px] overflow-y-auto">
            {filteredDefs.length === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-8">No exercises found.</p>
            ) : (
              filteredDefs.map((def) => {
                const isSelected = selectedEx?.id === def.id;
                return (
                  <div
                    key={def.id}
                    onClick={() => setSelectedEx(def)}
                    className={`p-3 flex items-center justify-between text-xs cursor-pointer transition-colors ${
                      isSelected ? 'bg-emerald-500/10 border-l-4 border-l-emerald-500' : 'hover:bg-muted/30'
                    }`}
                  >
                    <div>
                      <p className="font-bold text-foreground">{def.name}</p>
                      <p className="text-[11px] text-muted-foreground font-mono">
                        {def.defaultWeightUnit} · {def.metricType || 'WEIGHT_REPS'}
                      </p>
                    </div>
                    <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right PR & History Detail (col-span-6) */}
        <div className="md:col-span-6 rounded-2xl border border-border/80 bg-card p-5 shadow-sm space-y-4">
          {!selectedEx ? (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground py-16">
              Select an exercise from the library to view PRs and performance history.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border/40">
                <div>
                  <h3 className="text-base font-bold text-foreground">{selectedEx.name}</h3>
                  <p className="text-xs text-muted-foreground">Personal Records & Progression</p>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400">{selectedEx.defaultWeightUnit}</span>
              </div>

              {/* PR Cards Grid */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Heaviest</span>
                  <p className="font-extrabold text-foreground text-sm">70 kg</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Best Set</span>
                  <p className="font-extrabold text-foreground text-sm">62.5 × 8</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1">
                  <span className="text-[10px] text-muted-foreground font-medium">Est. 1RM</span>
                  <p className="font-extrabold text-emerald-400 text-sm">79 kg</p>
                </div>
              </div>

              {/* Recent Set Log History */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-foreground">Recent History</h4>
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1">
                    <div className="flex justify-between text-muted-foreground font-mono text-[11px]">
                      <span>Aug 7, 2026</span>
                      <span>3 sets</span>
                    </div>
                    <p className="font-mono font-semibold text-foreground">62.5 kg × 8, 62.5 kg × 7, 62.5 kg × 7</p>
                  </div>
                  <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1">
                    <div className="flex justify-between text-muted-foreground font-mono text-[11px]">
                      <span>Aug 2, 2026</span>
                      <span>3 sets</span>
                    </div>
                    <p className="font-mono font-semibold text-foreground">60 kg × 8, 60 kg × 8, 60 kg × 7</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
