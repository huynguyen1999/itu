import { useState, useMemo } from 'react';
import { useGymExercises, type GymExercise } from '../gymQueries';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Activity, Dumbbell, Plus, Search, Star, Filter } from 'lucide-react';
import { CreateExerciseForm } from './CreateExerciseForm';
import { ExerciseInspector } from './ExerciseInspector';

export function ExerciseLibraryPage() {
  const { data: exercises = [], isLoading } = useGymExercises();
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [muscleFilter, setMuscleFilter] = useState('ALL');
  const [equipmentFilter, setEquipmentFilter] = useState('ALL');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const muscleOptions = useMemo(() => {
    const set = new Set<string>();
    exercises.forEach((ex) => {
      if (ex.primaryMuscleGroup) set.add(ex.primaryMuscleGroup);
    });
    return Array.from(set).sort();
  }, [exercises]);

  const equipmentOptions = useMemo(() => {
    const set = new Set<string>();
    exercises.forEach((ex) => {
      if (ex.equipment) set.add(ex.equipment);
    });
    return Array.from(set).sort();
  }, [exercises]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return exercises.filter((ex) => {
      const matchSearch = !query || ex.name.toLowerCase().includes(query);
      const matchMuscle = muscleFilter === 'ALL' || ex.primaryMuscleGroup === muscleFilter;
      const matchEquipment = equipmentFilter === 'ALL' || ex.equipment === equipmentFilter;
      const matchFavorite = !favoriteOnly || Boolean(ex.isFavorite || ex.favorite);
      return matchSearch && matchMuscle && matchEquipment && matchFavorite;
    });
  }, [exercises, search, muscleFilter, equipmentFilter, favoriteOnly]);

  const selectedExercise = exercises.find((ex) => ex.id === selectedExerciseId) || filtered[0] || null;

  return (
    <div className="space-y-4 max-w-7xl mx-auto p-4 sm:p-6">
      {/* Header and Search Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 flex-1 max-w-2xl">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search exercises..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs h-9"
            />
          </div>

          <select
            value={muscleFilter}
            onChange={(e) => setMuscleFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            aria-label="Filter by muscle"
          >
            <option value="ALL">All Muscles</option>
            {muscleOptions.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={equipmentFilter}
            onChange={(e) => setEquipmentFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-2 text-xs"
            aria-label="Filter by equipment"
          >
            <option value="ALL">All Equipment</option>
            {equipmentOptions.map((eq) => (
              <option key={eq} value={eq}>
                {eq}
              </option>
            ))}
          </select>

          <Button
            variant={favoriteOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFavoriteOnly((prev) => !prev)}
            className="h-9 px-2.5 text-xs gap-1.5"
            title="Show only favorites"
          >
            <Star className={`w-3.5 h-3.5 ${favoriteOnly ? 'fill-current' : ''}`} />
            <span className="hidden md:inline">Favorites</span>
          </Button>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {filtered.length} of {exercises.length}
          </span>
          <Button
            size="sm"
            onClick={() => setShowCreate((value) => !value)}
            className="gap-1.5 font-semibold"
          >
            <Plus className="w-4 h-4" />
            New Exercise
          </Button>
        </div>
      </div>

      {showCreate && <CreateExerciseForm onClose={() => setShowCreate(false)} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-1.5 pr-1 lg:col-span-5 lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">
              Loading exercise library...
            </div>
          ) : filtered.length === 0 ? (
            <EmptyExerciseState />
          ) : (
            filtered.map((exercise) => {
              const isFav = Boolean(exercise.isFavorite || exercise.favorite);
              const isSelected = selectedExercise?.id === exercise.id;

              return (
                <Card
                  key={exercise.id}
                  className={`p-3 cursor-pointer transition-all ${
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-xs'
                      : 'hover:bg-muted/40'
                  }`}
                  onClick={() => setSelectedExerciseId(exercise.id)}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-foreground truncate">{exercise.name}</p>
                        {isFav && <Star className="w-3 h-3 text-amber-500 fill-amber-500 shrink-0" />}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {exercise.primaryMuscleGroup || 'General'} &bull; {exercise.equipment || 'Bodyweight'}
                      </p>
                    </div>
                    <Dumbbell className="w-4 h-4 text-muted-foreground/60 shrink-0" />
                  </div>
                </Card>
              );
            })
          )}
        </div>

        <div className="lg:col-span-7">
          {selectedExercise ? (
            <ExerciseInspector exercise={selectedExercise} />
          ) : (
            <Card className="p-12 text-center text-xs text-muted-foreground">
              Select an exercise from the list to view performance history and PRs.
            </Card>
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
        <Activity className="w-5 h-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-semibold text-foreground">No matching exercises found</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
          Try clearing filters or search term to see more exercises.
        </p>
      </div>
    </Card>
  );
}
