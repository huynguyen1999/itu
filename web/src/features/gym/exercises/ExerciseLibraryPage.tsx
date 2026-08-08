import { useState } from 'react';
import { useGymExercises, useGymExerciseStats } from '../gymQueries';
import { useCreateGymExercise, useUpdateGymExercise, useArchiveGymExercise, useUploadGymExerciseImage } from '../gymMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Dumbbell, Plus, Search, Image as ImageIcon, Archive, Edit2, Activity } from 'lucide-react';

export function ExerciseLibraryPage() {
  const { data: exercises = [], isLoading } = useGymExercises();
  const [selectedExId, setSelectedExId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [metricType, setMetricType] = useState<any>('WEIGHT_REPS');
  const [equipment, setEquipment] = useState('');
  const [primaryMuscleGroup, setPrimaryMuscleGroup] = useState('');

  const createExercise = useCreateGymExercise();

  const filtered = exercises.filter((e: any) => e.name.toLowerCase().includes(search.toLowerCase()));

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    createExercise.mutate(
      {
        name: name.trim(),
        description: description.trim() || undefined,
        metricType,
        equipment: equipment.trim() || undefined,
        primaryMuscleGroup: primaryMuscleGroup.trim() || undefined,
      },
      {
        onSuccess: () => {
          setName('');
          setDescription('');
          setShowCreate(false);
        },
      },
    );
  };

  const selectedEx = exercises.find((e: any) => e.id === selectedExId) || filtered[0] || null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs"
          />
        </div>

        <Button size="sm" onClick={() => setShowCreate((v) => !v)} className="gap-1.5">
          <Plus className="w-4 h-4" />
          Add Exercise
        </Button>
      </div>

      {showCreate && (
        <Card className="p-4 border-emerald-500/30 space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Create Exercise</h4>
          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Incline Bench Press" required className="text-xs" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Metric Type</label>
              <select
                value={metricType}
                onChange={(e) => setMetricType(e.target.value as any)}
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-xs"
              >
                <option value="WEIGHT_REPS">Weight & Reps</option>
                <option value="REPS">Reps Only</option>
                <option value="DURATION">Duration</option>
                <option value="DISTANCE_DURATION">Distance & Duration</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Equipment</label>
              <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="e.g. Barbell" className="text-xs" />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Primary Muscle</label>
              <Input value={primaryMuscleGroup} onChange={(e) => setPrimaryMuscleGroup(e.target.value)} placeholder="e.g. Chest" className="text-xs" />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-[10px] text-muted-foreground">Description</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Instructions..." className="text-xs" />
            </div>

            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={createExercise.isPending}>
                Save Exercise
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Main Split Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        {/* Left List */}
        <div className="md:col-span-5 space-y-2 max-h-[600px] overflow-y-auto pr-1">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground animate-pulse">Loading exercises...</div>
          ) : filtered.length === 0 ? (
            <Card className="p-8 text-center text-xs text-muted-foreground">No exercises found.</Card>
          ) : (
            filtered.map((ex: any) => (
              <Card
                key={ex.id}
                className={`p-3 cursor-pointer transition-colors ${
                  selectedEx?.id === ex.id
                    ? 'border-emerald-500 bg-emerald-500/5'
                    : 'hover:bg-muted/30'
                }`}
                onClick={() => setSelectedExId(ex.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-foreground">{ex.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {ex.primaryMuscleGroup || 'General'} &bull; {ex.equipment || 'Bodyweight'}
                    </p>
                  </div>
                  <Dumbbell className="w-4 h-4 text-muted-foreground" />
                </div>
              </Card>
            ))
          )}
        </div>

        {/* Right Inspector & Analytics */}
        <div className="md:col-span-7">
          {selectedEx ? (
            <ExerciseInspector exercise={selectedEx} />
          ) : (
            <Card className="p-12 text-center text-xs text-muted-foreground">Select an exercise to view details.</Card>
          )}
        </div>
      </div>
    </div>
  );
}

function ExerciseInspector({ exercise }: { exercise: any }) {
  const { data: stats, isLoading } = useGymExerciseStats(exercise.id);
  const archiveEx = useArchiveGymExercise();
  const updateEx = useUpdateGymExercise();
  const uploadImage = useUploadGymExerciseImage();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(exercise.name);
  const [description, setDescription] = useState(exercise.description || '');

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      uploadImage.mutate({ id: exercise.id, file });
    }
  };

  const handleSave = () => {
    updateEx.mutate(
      { id: exercise.id, data: { name, description } },
      { onSuccess: () => setIsEditing(false) },
    );
  };

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground">{exercise.name}</h3>
          <p className="text-xs text-muted-foreground">
            {exercise.primaryMuscleGroup || 'General'} &bull; {exercise.equipment || 'Bodyweight'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setIsEditing((v) => !v)} className="gap-1 text-xs">
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => archiveEx.mutate(exercise.id)}
            title="Archive exercise"
          >
            <Archive className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isEditing && (
        <div className="p-3 border rounded-lg space-y-2 bg-muted/20 text-xs">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exercise Name" className="text-xs" />
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="text-xs" />
          <Button size="sm" onClick={handleSave} disabled={updateEx.isPending}>
            Save Changes
          </Button>
        </div>
      )}

      {/* Exercise Image */}
      <div className="space-y-2">
        <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <ImageIcon className="w-3.5 h-3.5" />
          Image
        </label>

        {exercise.imageUrl ? (
          <img src={exercise.imageUrl} alt={exercise.name} className="h-40 w-full object-cover rounded-lg border" />
        ) : (
          <div className="h-24 border border-dashed rounded-lg flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
            <ImageIcon className="w-5 h-5" />
            <span>No image uploaded</span>
          </div>
        )}

        <Input type="file" accept="image/*" onChange={handleImageChange} className="text-xs cursor-pointer" />
      </div>

      {/* Description */}
      {exercise.description && (
        <div className="space-y-1">
          <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Description</label>
          <p className="text-xs text-foreground bg-muted/30 p-2.5 rounded-lg">{exercise.description}</p>
        </div>
      )}

      {/* Real Calculated Analytics */}
      <div className="space-y-3 pt-2 border-t">
        <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-emerald-500" />
          Performance History & PRs
        </h4>

        {isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">Calculating stats...</div>
        ) : !stats || stats.totalSets === 0 ? (
          <p className="text-xs text-muted-foreground italic">No workout history recorded yet for this exercise.</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-2 bg-muted/40 rounded-lg">
              <span className="text-[10px] text-muted-foreground uppercase">Heaviest Weight</span>
              <p className="text-sm font-bold font-mono text-foreground">
                {stats.heaviestWeight != null ? `${stats.heaviestWeight} kg` : '—'}
              </p>
            </div>
            <div className="p-2 bg-muted/40 rounded-lg">
              <span className="text-[10px] text-muted-foreground uppercase">Est. 1RM</span>
              <p className="text-sm font-bold font-mono text-emerald-500">
                {stats.estimated1RM != null ? `${stats.estimated1RM} kg` : '—'}
              </p>
            </div>
            <div className="p-2 bg-muted/40 rounded-lg">
              <span className="text-[10px] text-muted-foreground uppercase">Total Sets</span>
              <p className="text-sm font-bold font-mono text-foreground">{stats.totalSets}</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
