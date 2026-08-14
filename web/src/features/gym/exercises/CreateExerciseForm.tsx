import React, { useState } from 'react';
import { useCreateGymExercise, useUploadGymExerciseImage } from '../gymMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Dumbbell } from 'lucide-react';
import { ImageDropzone, MetricType, SegmentedMetricControl } from './ExerciseFormFields';

export function CreateExerciseForm({ onClose, archivePending }: { onClose: () => void; archivePending?: boolean }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [metricType, setMetricType] = useState<MetricType>('WEIGHT_REPS');
  const [equipment, setEquipment] = useState('');
  const [primaryMuscleGroup, setPrimaryMuscleGroup] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const createExercise = useCreateGymExercise();
  const uploadExerciseImage = useUploadGymExerciseImage();

  const canCreate = name.trim().length > 0;
  const isSaving = createExercise.isPending || uploadExerciseImage.isPending || archivePending;

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
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
      onClose();
    } catch {
      setCreateError(
        createdExerciseId
          ? 'Exercise saved; image upload will need a retry.'
          : 'The exercise could not be saved. Please try again.',
      );
    }
  };

  return (
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
            onChange={(event) => setName(event.target.value)}
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
              onChange={(event) => setEquipment(event.target.value)}
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
              onChange={(event) => setPrimaryMuscleGroup(event.target.value)}
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
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Brace your core, keep your chest up, and squat until your hips drop below your knees."
            className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground min-h-[72px] focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/60 transition-all resize-y"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Reference image</label>
          <ImageDropzone file={imageFile} onFileSelect={setImageFile} isRequired={false} />
        </div>

        {createError && (
          <p
            role="alert"
            className="text-xs text-rose-500 font-medium bg-rose-500/10 p-2.5 rounded-lg border border-rose-500/20"
          >
            {createError}
          </p>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border/60">
          <span className="text-xs text-muted-foreground font-medium">
            {canCreate ? 'Ready to create' : 'Exercise name is required'}
          </span>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
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
  );
}
