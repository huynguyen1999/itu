import { useState } from 'react';
import { useGymExercises, type GymExercise } from '../gymQueries';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Activity, Dumbbell, Plus, Search } from 'lucide-react';
import { CreateExerciseForm } from './CreateExerciseForm';
import { ExerciseInspector } from './ExerciseInspector';

export function ExerciseLibraryPage() {
  const { data: exercises = [], isLoading } = useGymExercises();
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const filtered = exercises.filter((exercise) => exercise.name.toLowerCase().includes(search.toLowerCase()));
  const selectedExercise = exercises.find((exercise) => exercise.id === selectedExerciseId) || filtered[0] || null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full min-w-0 sm:max-w-xs sm:flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search exercises..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-8 text-xs h-9"
          />
        </div>

        <div className="flex w-full items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}
          </span>
          <Button
            size="sm"
            onClick={() => setShowCreate((value) => !value)}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Add Exercise
          </Button>
        </div>
      </div>

      {showCreate && <CreateExerciseForm onClose={() => setShowCreate(false)} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-2 pr-1 lg:col-span-5 lg:max-h-[600px] lg:overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading exercises...</div>
          ) : filtered.length === 0 ? (
            <EmptyExerciseState />
          ) : (
            filtered.map((exercise) => (
              <Card
                key={exercise.id}
                className={`p-3 cursor-pointer transition-colors ${
                  selectedExercise?.id === exercise.id ? 'border-emerald-500 bg-emerald-500/5' : 'hover:bg-muted/30'
                }`}
                onClick={() => setSelectedExerciseId(exercise.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">{exercise.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {exercise.primaryMuscleGroup || 'General'} &bull; {exercise.equipment || 'Bodyweight'}
                    </p>
                  </div>
                  <Dumbbell className="w-4 h-4 text-muted-foreground" />
                </div>
              </Card>
            ))
          )}
        </div>

        <div className="lg:col-span-7">
          {selectedExercise ? (
            <ExerciseInspector exercise={selectedExercise} />
          ) : (
            <Card className="p-12 text-center text-xs text-muted-foreground">Select an exercise to view details.</Card>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyExerciseState() {
  return (
    <Card className="p-8 text-center space-y-3 bg-card border-border/80">
      <div className="w-11 h-11 mx-auto rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground border border-border/50">
        <Activity className="w-5 h-5 text-emerald-500" />
      </div>
      <div>
        <p className="font-display text-sm font-semibold text-foreground">No exercises in the library yet</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
          Exercises you create will show up here, ready to add to any workout.
        </p>
      </div>
    </Card>
  );
}
