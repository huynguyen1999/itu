import React, { useState, useRef } from 'react';
import { useGymExercises, useGymExerciseStats } from '../gymQueries';
import { useCreateGymExercise, useUpdateGymExercise, useArchiveGymExercise, useUploadGymExerciseImage } from '../gymMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Dumbbell, Plus, Search, Image as ImageIcon, Archive, Edit2, Activity, Check, UploadCloud } from 'lucide-react';

const METRIC_OPTIONS = [
  { value: 'WEIGHT_REPS', label: 'Weight & reps' },
  { value: 'REPS', label: 'Reps only' },
  { value: 'DURATION', label: 'Duration' },
  { value: 'DISTANCE_DURATION', label: 'Distance & duration' },
] as const;

type MetricType = (typeof METRIC_OPTIONS)[number]['value'];

function SegmentedMetricControl({
  value,
  onChange,
}: {
  value: MetricType;
  onChange: (val: MetricType) => void;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 bg-muted/50 border border-border/80 rounded-xl" role="radiogroup" aria-label="Metric type">
      {METRIC_OPTIONS.map((option) => {
        const isActive = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(option.value)}
            className={`px-2.5 py-2 text-xs font-mono font-medium rounded-lg transition-all duration-150 text-center select-none ${
              isActive
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/40'
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ImageDropzone({
  file,
  existingUrl,
  onFileSelect,
  isRequired = true,
}: {
  file: File | null;
  existingUrl?: string | null;
  onFileSelect: (file: File | null) => void;
  isRequired?: boolean;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const previewUrl = file ? URL.createObjectURL(file) : existingUrl || null;
  const hasImage = Boolean(previewUrl);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile && droppedFile.type.startsWith('image/')) {
      onFileSelect(droppedFile);
    }
  };

  return (
    <div
      onClick={() => fileInputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`group relative flex items-center gap-3 p-3.5 border border-dashed rounded-xl cursor-pointer transition-all duration-150 ${
        isDragging
          ? 'border-emerald-500 bg-emerald-500/10'
          : hasImage
          ? 'border-emerald-500/50 bg-emerald-500/5 hover:border-emerald-500 hover:bg-emerald-500/10'
          : 'border-border/80 bg-muted/20 hover:border-emerald-500/60 hover:bg-emerald-500/5'
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png, image/jpeg, image/webp"
        onChange={(e) => onFileSelect(e.target.files?.[0] || null)}
        className="hidden"
      />

      <div className="w-10 h-10 min-w-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden border border-border/60 text-muted-foreground group-hover:text-emerald-500 transition-colors">
        {hasImage ? (
          <img src={previewUrl!} alt="Reference preview" className="w-full h-full object-cover" />
        ) : (
          <UploadCloud className="w-5 h-5" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          {file ? file.name : hasImage ? 'Reference image attached' : 'Choose reference image'}
        </p>
        <p className="text-[11px] text-muted-foreground truncate">
          {hasImage ? 'Click or drag to replace image' : 'PNG or JPG, up to 5 MB'}
        </p>
      </div>

      {hasImage ? (
        <span className="font-mono text-[10px] uppercase font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md flex items-center gap-1">
          <Check className="w-3 h-3" />
          Attached
        </span>
      ) : isRequired ? (
        <span className="font-mono text-[10px] uppercase font-semibold text-rose-500 bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 rounded-md">
          Required
        </span>
      ) : (
        <span className="font-mono text-[10px] uppercase font-medium text-muted-foreground bg-muted border border-border/50 px-2 py-0.5 rounded-md">
          Optional
        </span>
      )}
    </div>
  );
}

export function ExerciseLibraryPage() {
  const { data: exercises = [], isLoading } = useGymExercises();
  const [selectedExId, setSelectedExId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [metricType, setMetricType] = useState<MetricType>('WEIGHT_REPS');
  const [equipment, setEquipment] = useState('');
  const [primaryMuscleGroup, setPrimaryMuscleGroup] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const createExercise = useCreateGymExercise();
  const uploadExerciseImage = useUploadGymExerciseImage();
  const archiveExercise = useArchiveGymExercise();

  const filtered = exercises.filter((e: any) => e.name.toLowerCase().includes(search.toLowerCase()));

  const canCreate = name.trim().length > 0;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setCreateError('Exercise name is required.');
      return;
    }

    setCreateError(null);
    let createdExerciseId: string | undefined;

    try {
      const exercise = await createExercise.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        metricType,
        equipment: equipment.trim() || undefined,
        primaryMuscleGroup: primaryMuscleGroup.trim() || undefined,
      });
      createdExerciseId = exercise.id;
      if (imageFile) await uploadExerciseImage.mutateAsync({ id: exercise.id, file: imageFile });
      setName('');
      setDescription('');
      setEquipment('');
      setPrimaryMuscleGroup('');
      setImageFile(null);
      setShowCreate(false);
    } catch {
      if (!createdExerciseId) setCreateError('The exercise could not be saved. Please try again.');
      else setCreateError('Exercise saved; image upload will need a retry.');
    }
  };

  const isSaving = createExercise.isPending || uploadExerciseImage.isPending || archiveExercise.isPending;
  const selectedEx = exercises.find((e: any) => e.id === selectedExId) || filtered[0] || null;

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search exercises..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 text-xs h-9"
          />
        </div>

        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-muted-foreground">
            {exercises.length} {exercises.length === 1 ? 'exercise' : 'exercises'}
          </span>
          <Button
            size="sm"
            onClick={() => {
              setShowCreate((v) => !v);
              setCreateError(null);
            }}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Add Exercise
          </Button>
        </div>
      </div>

      {/* Add Exercise Card */}
      {showCreate && (
        <Card className="p-5 border-emerald-500/40 bg-card shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/60">
            <h4 className="font-display text-sm font-semibold text-foreground flex items-center gap-2">
              <Dumbbell className="w-4 h-4 text-emerald-500" />
              Add exercise
            </h4>
          </div>

          <form onSubmit={handleCreate} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="exerciseName">
                Exercise name
              </label>
              <Input
                id="exerciseName"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Barbell back squat"
                required
                className="text-xs h-9"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Metric type</label>
              <SegmentedMetricControl value={metricType} onChange={setMetricType} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="equipment">
                  Equipment <span className="text-muted-foreground/60 font-normal">(optional)</span>
                </label>
                <Input
                  id="equipment"
                  value={equipment}
                  onChange={(e) => setEquipment(e.target.value)}
                  placeholder="Barbell"
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="primaryMuscle">
                  Primary muscle <span className="text-muted-foreground/60 font-normal">(optional)</span>
                </label>
                <Input
                  id="primaryMuscle"
                  value={primaryMuscleGroup}
                  onChange={(e) => setPrimaryMuscleGroup(e.target.value)}
                  placeholder="Quadriceps"
                  className="text-xs h-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="instructions">
                Instructions <span className="text-muted-foreground/60 font-normal">(optional)</span>
              </label>
              <textarea
                id="instructions"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brace your core, keep your chest up, and squat until your hips drop below your knees."
                className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground min-h-[72px] focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/60 transition-all resize-y"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Reference image</label>
              <ImageDropzone file={imageFile} onFileSelect={setImageFile} isRequired={false} />
            </div>

            {createError && (
              <p role="alert" className="text-xs text-rose-500 font-medium bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20">
                {createError}
              </p>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/60">
              <span className="text-xs text-muted-foreground font-medium">
                {canCreate ? 'Ready to create' : 'Exercise name is required'}
              </span>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setShowCreate(false);
                    setImageFile(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!canCreate || isSaving}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
                >
                  {isSaving ? 'Creating...' : 'Create exercise'}
                </Button>
              </div>
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
            <EmptyExerciseState />
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

        {/* Right Inspector */}
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

function EmptyExerciseState() {
  return (
    <Card className="p-8 text-center space-y-3 bg-card border-border/80">
      <div className="w-11 h-11 mx-auto rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground border border-border/50">
        <Activity className="w-5 h-5 text-emerald-500" />
      </div>
      <div>
        <p className="font-display text-sm font-semibold text-foreground">No exercises in the library yet</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto leading-relaxed">
          Exercises you create will show up here, ready to add into any routine.
        </p>
      </div>
    </Card>
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
  const [metricType, setMetricType] = useState<MetricType>(exercise.metricType || 'WEIGHT_REPS');
  const [equipment, setEquipment] = useState(exercise.equipment || '');
  const [primaryMuscleGroup, setPrimaryMuscleGroup] = useState(exercise.primaryMuscleGroup || '');
  const [editFile, setEditFile] = useState<File | null>(null);

  const handleSave = async () => {
    if (!name.trim()) return;

    if (editFile) {
      await uploadImage.mutateAsync({ id: exercise.id, file: editFile });
    }

    updateEx.mutate(
      {
        id: exercise.id,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          metricType,
          equipment: equipment.trim() || undefined,
          primaryMuscleGroup: primaryMuscleGroup.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          setIsEditing(false);
          setEditFile(null);
        },
      },
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
            className="h-8 w-8 text-muted-foreground hover:text-rose-500"
            onClick={() => archiveEx.mutate(exercise.id)}
            title="Archive exercise"
          >
            <Archive className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isEditing ? (
        <div className="p-4 border border-emerald-500/30 rounded-xl space-y-4 bg-muted/20 text-xs">
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <span className="font-display font-semibold text-xs text-foreground flex items-center gap-1.5">
              <Dumbbell className="w-3.5 h-3.5 text-emerald-500" />
              Edit exercise
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Exercise name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Exercise Name" className="text-xs h-9" />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Metric type</label>
            <SegmentedMetricControl value={metricType} onChange={setMetricType} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Equipment <span className="text-muted-foreground/60 font-normal">(optional)</span>
              </label>
              <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="e.g. Barbell" className="text-xs h-9" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Primary muscle <span className="text-muted-foreground/60 font-normal">(optional)</span>
              </label>
              <Input
                value={primaryMuscleGroup}
                onChange={(e) => setPrimaryMuscleGroup(e.target.value)}
                placeholder="e.g. Chest"
                className="text-xs h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Instructions <span className="text-muted-foreground/60 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Instructions..."
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground min-h-[72px] focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/60 transition-all resize-y"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Reference image</label>
            <ImageDropzone file={editFile} existingUrl={exercise.imageUrl} onFileSelect={setEditFile} isRequired={false} />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <span className="text-xs text-muted-foreground font-medium">Ready to save</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!name.trim() || updateEx.isPending || uploadImage.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                {updateEx.isPending || uploadImage.isPending ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Reference Image display */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
              Reference image
            </label>

            {exercise.imageUrl ? (
              <img src={exercise.imageUrl} alt={exercise.name} className="h-44 w-full object-cover rounded-xl border border-border/80" />
            ) : (
              <div className="h-28 border border-dashed rounded-xl flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground bg-muted/20">
                <ImageIcon className="w-5 h-5 text-muted-foreground/60" />
                <span>No reference image attached</span>
              </div>
            )}
          </div>

          {/* Instructions / Description */}
          {exercise.description && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Instructions</label>
              <p className="text-xs text-foreground bg-muted/30 p-3 rounded-xl border border-border/50 leading-relaxed">
                {exercise.description}
              </p>
            </div>
          )}

          {/* Performance Stats */}
          <div className="space-y-3 pt-2 border-t border-border/60">
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
                <div className="p-2.5 bg-muted/40 rounded-xl border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono">Heaviest Weight</span>
                  <p className="text-sm font-bold font-mono text-foreground mt-0.5">
                    {stats.heaviestWeight != null ? `${stats.heaviestWeight} kg` : '—'}
                  </p>
                </div>
                <div className="p-2.5 bg-muted/40 rounded-xl border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono">Est. 1RM</span>
                  <p className="text-sm font-bold font-mono text-emerald-500 mt-0.5">
                    {stats.estimated1RM != null ? `${stats.estimated1RM} kg` : '—'}
                  </p>
                </div>
                <div className="p-2.5 bg-muted/40 rounded-xl border border-border/50">
                  <span className="text-[10px] text-muted-foreground uppercase font-mono">Total Sets</span>
                  <p className="text-sm font-bold font-mono text-foreground mt-0.5">{stats.totalSets}</p>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
