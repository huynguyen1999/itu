import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  useGymExerciseProgress,
  type GymExercise,
  type GymWorkoutSet,
} from '../gymQueries';
import {
  useArchiveGymExercise,
  useToggleFavoriteExercise,
  useUpdateGymExercise,
  useUploadGymExerciseImage,
} from '../gymMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import {
  Archive,
  Activity,
  Dumbbell,
  Edit2,
  Image as ImageIcon,
  Star,
  Trophy,
  TrendingUp,
  Save,
  Calendar,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { formatVolume, formatWeight } from '../weightUnits';
import { ImageDropzone, MetricType, SegmentedMetricControl } from './ExerciseFormFields';

export function ExerciseInspector({ exercise }: { exercise: GymExercise }) {
  const [range, setRange] = useState<'1M' | '3M' | '6M' | '1Y' | 'ALL'>('ALL');
  const [activeMetric, setActiveMetric] = useState<'WEIGHT' | 'E1RM' | 'VOLUME' | 'REPS'>('WEIGHT');

  const { data: progress, isLoading } = useGymExerciseProgress(exercise.id, range);
  const preferencesQuery = useQuery({ queryKey: ['user-preferences'], queryFn: () => api.getPreferences() });
  const weightUnit = preferencesQuery.data?.gym?.weightUnit ?? 'KG';

  const archiveExercise = useArchiveGymExercise();
  const updateExercise = useUpdateGymExercise();
  const toggleFavorite = useToggleFavoriteExercise();
  const uploadImage = useUploadGymExerciseImage();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(exercise.name);
  const [description, setDescription] = useState(exercise.description || '');
  const [metricType, setMetricType] = useState<MetricType>(exercise.metricType || 'WEIGHT_REPS');
  const [equipment, setEquipment] = useState(exercise.equipment || '');
  const [primaryMuscleGroup, setPrimaryMuscleGroup] = useState(exercise.primaryMuscleGroup || '');
  const [userNotes, setUserNotes] = useState(exercise.userNotes || '');
  const [notesSaving, setNotesSaving] = useState(false);
  const [editFile, setEditFile] = useState<File | null>(null);

  const isFavorite = Boolean(exercise.isFavorite || exercise.favorite);

  const handleSaveNotes = async () => {
    setNotesSaving(true);
    try {
      await updateExercise.mutateAsync({
        id: exercise.id,
        data: { userNotes: userNotes.trim() || null },
      });
    } finally {
      setNotesSaving(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    if (editFile) await uploadImage.mutateAsync({ id: exercise.id, file: editFile });

    updateExercise.mutate(
      {
        id: exercise.id,
        data: {
          name: name.trim(),
          description: description.trim() || undefined,
          metricType,
          equipment: equipment.trim() || undefined,
          primaryMuscleGroup: primaryMuscleGroup.trim() || undefined,
          userNotes: userNotes.trim() || undefined,
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

  const records = progress?.records;
  const historyPoints = progress?.historyPoints || [];

  return (
    <Card className="p-5 space-y-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">{exercise.name}</h3>
            {exercise.origin === 'BUILT_IN' && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                Built-in
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {exercise.primaryMuscleGroup || 'General'} &bull; {exercise.equipment || 'Bodyweight'} &bull;{' '}
            {(exercise.metricType || 'WEIGHT_REPS').replace(/_/g, ' ').toLowerCase()}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => toggleFavorite.mutate(exercise.id)}
            className={`h-8 px-2 text-xs gap-1.5 ${isFavorite ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground'}`}
            title="Toggle favorite"
          >
            <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-500' : ''}`} />
            <span className="hidden sm:inline">{isFavorite ? 'Favorited' : 'Favorite'}</span>
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing((value) => !value)}
            className="h-8 gap-1 text-xs"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            onClick={() => archiveExercise.mutate(exercise.id)}
            title="Archive exercise"
          >
            <Archive className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {isEditing ? (
        <div className="p-4 border rounded-xl space-y-4 bg-muted/20 text-xs">
          <div className="flex items-center justify-between pb-2 border-b">
            <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
              <Dumbbell className="w-3.5 h-3.5 text-primary" />
              Edit exercise
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Exercise name</label>
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Exercise Name"
              className="text-xs h-9"
            />
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
              <Input
                value={equipment}
                onChange={(event) => setEquipment(event.target.value)}
                placeholder="e.g. Barbell"
                className="text-xs h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Primary muscle <span className="text-muted-foreground/60 font-normal">(optional)</span>
              </label>
              <Input
                value={primaryMuscleGroup}
                onChange={(event) => setPrimaryMuscleGroup(event.target.value)}
                placeholder="e.g. Chest"
                className="text-xs h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Instructions <span className="text-muted-foreground/60 font-normal">(optional)</span>
            </label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Instructions..."
              className="w-full text-xs min-h-[72px]"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Reference image</label>
            <ImageDropzone
              file={editFile}
              existingUrl={exercise.imageUrl}
              onFileSelect={setEditFile}
              isRequired={false}
            />
          </div>

          <div className="flex items-center justify-between pt-2 border-t">
            <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!name.trim() || updateExercise.isPending || uploadImage.isPending}
            >
              {updateExercise.isPending || uploadImage.isPending ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* User Form & Technique Notes */}
          <div className="space-y-2 rounded-lg bg-muted/30 p-3.5 border">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Save className="w-3.5 h-3.5 text-primary" />
                Personal Form Cues & Setup Notes
              </label>
              {userNotes !== (exercise.userNotes || '') && (
                <Button size="sm" variant="ghost" onClick={handleSaveNotes} disabled={notesSaving} className="h-6 text-[11px] px-2 text-primary">
                  {notesSaving ? 'Saving...' : 'Save Notes'}
                </Button>
              )}
            </div>
            <Textarea
              value={userNotes}
              onChange={(e) => setUserNotes(e.target.value)}
              placeholder="e.g. Bench pin #4, slight arch, elbows 45° tucked. Will show during workout logging."
              className="text-xs min-h-[56px] resize-y bg-background"
            />
          </div>

          {/* Reference Image and Instructions if present */}
          {exercise.imageUrl && (
            <div className="space-y-1.5">
              <img
                src={exercise.imageUrl}
                alt={exercise.name}
                className="h-44 w-full object-cover rounded-xl border"
              />
            </div>
          )}

          {exercise.description && (
            <div className="space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Instructions
              </span>
              <p className="text-xs text-foreground bg-muted/20 p-3 rounded-lg border leading-relaxed">
                {exercise.description}
              </p>
            </div>
          )}

          {/* Records and All-Time Bests */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <Trophy className="w-4 h-4 text-amber-500" />
                Personal Records
              </h4>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
              <div className="p-2.5 bg-muted/40 rounded-xl border">
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Heaviest</span>
                <p className="text-sm font-bold font-mono text-foreground mt-0.5">
                  {formatWeight(records?.heaviestWeight ?? null, weightUnit)}
                </p>
              </div>
              <div className="p-2.5 bg-muted/40 rounded-xl border">
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Est. 1RM</span>
                <p className="text-sm font-bold font-mono text-primary mt-0.5">
                  {formatWeight(records?.estimated1RM ?? null, weightUnit)}
                </p>
              </div>
              <div className="p-2.5 bg-muted/40 rounded-xl border">
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Best Volume Set</span>
                <p className="text-sm font-bold font-mono text-foreground mt-0.5">
                  {records?.bestSetVolume ? formatVolume(records.bestSetVolume, weightUnit) : '—'}
                </p>
              </div>
              <div className="p-2.5 bg-muted/40 rounded-xl border">
                <span className="text-[10px] text-muted-foreground uppercase font-medium">Total Sets</span>
                <p className="text-sm font-bold font-mono text-foreground mt-0.5">
                  {records?.totalCompletedSets ?? 0}
                </p>
              </div>
            </div>
          </div>

          {/* Progress Timeline & Range Filter */}
          <div className="space-y-3 pt-2 border-t">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
                Progress History ({historyPoints.length} sessions)
              </h4>

              <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg text-xs font-medium">
                {(['1M', '3M', '6M', '1Y', 'ALL'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                      range === r ? 'bg-background text-foreground shadow-xs font-semibold' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {isLoading ? (
              <div className="p-6 text-center text-xs text-muted-foreground animate-pulse">
                Loading progress history...
              </div>
            ) : historyPoints.length === 0 ? (
              <div className="p-6 border border-dashed rounded-lg text-center text-xs text-muted-foreground">
                No completed sets found in this time range.
              </div>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {historyPoints.map((point, idx) => (
                  <div
                    key={`${point.workoutId}-${idx}`}
                    className="flex items-center justify-between p-2.5 rounded-lg border bg-card/60 text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="font-mono text-muted-foreground">
                        {new Date(point.date).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                      {point.isPR && (
                        <span className="inline-flex items-center gap-1 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-500">
                          <Trophy className="w-2.5 h-2.5" />
                          PR
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 font-mono font-medium">
                      {point.weight !== null && (
                        <span>
                          {formatWeight(point.weight, weightUnit)}{' '}
                          {point.reps !== null && <span className="text-muted-foreground">× {point.reps}</span>}
                        </span>
                      )}
                      {point.estimated1RM !== null && (
                        <span className="text-primary text-[11px]" title="Estimated 1RM">
                          e1RM: {formatWeight(point.estimated1RM, weightUnit)}
                        </span>
                      )}
                      {point.volume !== null && point.volume > 0 && (
                        <span className="text-muted-foreground text-[11px]">
                          Vol: {formatVolume(point.volume, weightUnit)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
