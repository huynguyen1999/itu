import { useMemo, useState } from 'react';
import { Plus, Search, Star, X } from 'lucide-react';
import type { ExerciseMetricType, GymExercise } from '../gymQueries';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';

const metricOptions: ExerciseMetricType[] = ['WEIGHT_REPS', 'REPS', 'DURATION', 'DISTANCE_DURATION'];

export function ExercisePickerDialog({
  open,
  exercises,
  recentIds,
  favoriteIds,
  isLoading,
  isCreating,
  onClose,
  onAdd,
  onCreateCustom,
  onToggleFavorite,
}: {
  open: boolean;
  exercises: GymExercise[];
  recentIds: Set<string>;
  favoriteIds: Set<string>;
  isLoading: boolean;
  isCreating: boolean;
  onClose: () => void;
  onAdd: (exercise: GymExercise) => void;
  onCreateCustom: (name: string) => Promise<void>;
  onToggleFavorite: (exerciseId: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'recent' | 'favorites' | 'all'>('all');
  const [muscleFilter, setMuscleFilter] = useState('ALL');
  const [equipmentFilter, setEquipmentFilter] = useState('ALL');
  const [metricFilter, setMetricFilter] = useState('ALL');
  const [customName, setCustomName] = useState('');

  const muscleOptions = useMemo(
    () => Array.from(new Set(exercises.map((item) => item.primaryMuscleGroup).filter((value): value is string => Boolean(value)))),
    [exercises],
  );
  const equipmentOptions = useMemo(
    () => Array.from(new Set(exercises.map((item) => item.equipment).filter((value): value is string => Boolean(value)))),
    [exercises],
  );
  const filteredExercises = useMemo(() => {
    const query = search.trim().toLowerCase();
    return exercises.filter((exercise) => {
      const favorite = favoriteIds.has(exercise.id) || Boolean(exercise.isFavorite || exercise.favorite);
      const matchesTab = tab === 'all' || (tab === 'favorites' ? favorite : recentIds.has(exercise.id));
      return (
        matchesTab &&
        (!query || exercise.name.toLowerCase().includes(query)) &&
        (muscleFilter === 'ALL' || exercise.primaryMuscleGroup === muscleFilter) &&
        (equipmentFilter === 'ALL' || exercise.equipment === equipmentFilter) &&
        (metricFilter === 'ALL' || exercise.metricType === metricFilter)
      );
    });
  }, [equipmentFilter, exercises, favoriteIds, metricFilter, muscleFilter, recentIds, search, tab]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <Card
        className="w-full max-w-lg space-y-4 p-5"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-exercise-title"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="add-exercise-title" className="text-sm font-semibold">
              Add exercise
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Recent, favorite, or all exercises.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} aria-label="Close add exercise dialog">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exercises" className="pl-8" />
        </div>
        <div className="flex gap-2">
          <Input
            value={customName}
            onChange={(event) => setCustomName(event.target.value)}
            placeholder="New custom exercise name"
            aria-label="Custom exercise name"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const name = customName.trim();
              void onCreateCustom(name).then(() => setCustomName(''));
            }}
            disabled={!customName.trim() || isCreating}
          >
            Create custom
          </Button>
        </div>
        <div className="flex flex-wrap gap-1">
          <div className="flex rounded-md border p-0.5">
            {(['recent', 'favorites', 'all'] as const).map((value) => (
              <Button key={value} type="button" variant={tab === value ? 'secondary' : 'ghost'} size="sm" onClick={() => setTab(value)}>
                {value[0].toUpperCase() + value.slice(1)}
              </Button>
            ))}
          </div>
          <select value={muscleFilter} onChange={(event) => setMuscleFilter(event.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="ALL">Muscle</option>
            {muscleOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={equipmentFilter} onChange={(event) => setEquipmentFilter(event.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="ALL">Equipment</option>
            {equipmentOptions.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
          <select value={metricFilter} onChange={(event) => setMetricFilter(event.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
            <option value="ALL">Metric</option>
            {metricOptions.map((value) => <option key={value} value={value}>{value.replace('_', ' ')}</option>)}
          </select>
        </div>
        {isLoading ? (
          <p className="py-8 text-center text-xs text-muted-foreground">Loading exercise library…</p>
        ) : (
          <div className="max-h-[min(24rem,60vh)] space-y-1 overflow-y-auto pr-1">
            {filteredExercises.map((exercise) => (
              <div
                key={exercise.id}
                role="button"
                tabIndex={0}
                className="flex w-full items-center justify-between gap-3 rounded-md border border-transparent p-3 text-left text-xs hover:border-primary/20 hover:bg-primary/5"
                onClick={() => onAdd(exercise)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onAdd(exercise);
                  }
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{exercise.name}</span>
                  <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                    {exercise.primaryMuscleGroup || 'General'} · {exercise.equipment || 'Bodyweight'}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <span
                    role="button"
                    tabIndex={0}
                    className="rounded p-1 text-muted-foreground hover:text-amber-500"
                    aria-label={`${favoriteIds.has(exercise.id) ? 'Remove' : 'Add'} ${exercise.name} ${favoriteIds.has(exercise.id) ? 'from' : 'to'} favorites`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onToggleFavorite(exercise.id);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        event.stopPropagation();
                        onToggleFavorite(exercise.id);
                      }
                    }}
                  >
                    <Star className={`h-4 w-4 ${favoriteIds.has(exercise.id) ? 'fill-amber-400 text-amber-500' : ''}`} />
                  </span>
                  <Plus className="h-4 w-4 text-primary" />
                </span>
              </div>
            ))}
            {filteredExercises.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">No exercises match these filters.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
