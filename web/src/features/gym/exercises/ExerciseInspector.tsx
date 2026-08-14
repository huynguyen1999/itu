import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGymExerciseStats, useGymWorkouts, type GymExercise, type GymWorkoutSet } from '../gymQueries';
import { useArchiveGymExercise, useUpdateGymExercise, useUploadGymExerciseImage } from '../gymMutations';
import { Card } from '@/shared/ui/card';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Archive, Activity, Dumbbell, Edit2, Image as ImageIcon } from 'lucide-react';
import { api } from '@/shared/api/client';
import { formatVolume, formatWeight } from '../weightUnits';
import { ImageDropzone, MetricType, SegmentedMetricControl } from './ExerciseFormFields';

type ExerciseHistoryItem = { id: string; date: string | null | undefined; sets: GymWorkoutSet[]; volume: number };

export function ExerciseInspector({ exercise }: { exercise: GymExercise }) {
  const { data: stats, isLoading } = useGymExerciseStats(exercise.id);
  const { data: completedWorkouts = [] } = useGymWorkouts({ status: 'COMPLETED', limit: 50 });
  const preferencesQuery = useQuery({ queryKey: ['user-preferences'], queryFn: () => api.getPreferences() });
  const weightUnit = preferencesQuery.data?.gym?.weightUnit ?? 'KG';
  const archiveExercise = useArchiveGymExercise();
  const updateExercise = useUpdateGymExercise();
  const uploadImage = useUploadGymExerciseImage();

  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(exercise.name);
  const [description, setDescription] = useState(exercise.description || '');
  const [metricType, setMetricType] = useState<MetricType>(exercise.metricType || 'WEIGHT_REPS');
  const [equipment, setEquipment] = useState(exercise.equipment || '');
  const [primaryMuscleGroup, setPrimaryMuscleGroup] = useState(exercise.primaryMuscleGroup || '');
  const [editFile, setEditFile] = useState<File | null>(null);

  const exerciseHistory = completedWorkouts
    .map((workout): ExerciseHistoryItem | null => {
      const entry = (workout.exercises || []).find((candidate) => candidate.exerciseId === exercise.id);
      if (!entry) return null;
      const sets = (entry.sets || []).filter((set) => Boolean(set.completedAt));
      return {
        id: workout.id,
        date: workout.startedAt || workout.endedAt,
        sets,
        volume: sets.reduce((total, set) => total + (set.weight || 0) * (set.reps || 0), 0),
      };
    })
    .filter((item): item is ExerciseHistoryItem => item !== null)
    .slice(0, 8);
  const recentSets = (stats?.recentSets || exerciseHistory.flatMap((item) => item.sets)).slice(0, 6);
  const maxHistoryVolume = Math.max(...exerciseHistory.map((item) => item.volume), 1);

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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-foreground">{exercise.name}</h3>
          <p className="text-xs text-muted-foreground">
            {exercise.primaryMuscleGroup || 'General'} &bull; {exercise.equipment || 'Bodyweight'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setIsEditing((value) => !value)} className="gap-1 text-xs">
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-rose-500"
            onClick={() => archiveExercise.mutate(exercise.id)}
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
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Instructions..."
              className="w-full rounded-xl border border-input bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground min-h-[72px] focus:outline-hidden focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/60 transition-all resize-y"
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

          <div className="flex items-center justify-between pt-2 border-t border-border/50">
            <span className="text-xs text-muted-foreground font-medium">Ready to save</span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={!name.trim() || updateExercise.isPending || uploadImage.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold"
              >
                {updateExercise.isPending || uploadImage.isPending ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <ImageIcon className="w-3.5 h-3.5 text-emerald-500" />
              Reference image
            </label>

            {exercise.imageUrl ? (
              <img
                src={exercise.imageUrl}
                alt={exercise.name}
                className="h-44 w-full object-cover rounded-xl border border-border/80"
              />
            ) : (
              <div className="h-28 border border-dashed rounded-xl flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground bg-muted/20">
                <ImageIcon className="w-5 h-5 text-muted-foreground/60" />
                <span>No reference image attached</span>
              </div>
            )}
          </div>

          {exercise.description && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Instructions
              </label>
              <p className="text-xs text-foreground bg-muted/30 p-3 rounded-xl border border-border/50 leading-relaxed">
                {exercise.description}
              </p>
            </div>
          )}

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
              <div className="space-y-3">
                <div className="grid grid-cols-1 gap-3 text-center sm:grid-cols-3">
                  <div className="p-2.5 bg-muted/40 rounded-xl border border-border/50">
                    <span className="text-[10px] text-muted-foreground uppercase font-mono">Heaviest Weight</span>
                    <p className="text-sm font-bold font-mono text-foreground mt-0.5">
                      {formatWeight(stats.heaviestWeight, weightUnit)}
                    </p>
                  </div>
                  <div className="p-2.5 bg-muted/40 rounded-xl border border-border/50">
                    <span className="text-[10px] text-muted-foreground uppercase font-mono">Est. 1RM</span>
                    <p className="text-sm font-bold font-mono text-emerald-500 mt-0.5">
                      {formatWeight(stats.estimated1RM, weightUnit)}
                    </p>
                  </div>
                  <div className="p-2.5 bg-muted/40 rounded-xl border border-border/50">
                    <span className="text-[10px] text-muted-foreground uppercase font-mono">Total Sets</span>
                    <p className="text-sm font-bold font-mono text-foreground mt-0.5">{stats.totalSets}</p>
                  </div>
                </div>

                {recentSets.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Recent sets
                    </h5>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {recentSets.map((set, index) => (
                        <div
                          key={`${set.id || 'recent'}-${index}`}
                          className="rounded-lg border border-border/50 bg-muted/30 p-2 text-xs"
                        >
                          <span className="font-mono text-muted-foreground">
                            {set.workoutTitle || `Set ${index + 1}`}
                          </span>
                          {set.performedAt && (
                            <p className="text-[10px] text-muted-foreground">
                              {new Date(set.performedAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </p>
                          )}
                          <p className="mt-1 font-semibold">
                            {set.weight != null
                              ? formatWeight(set.weight, weightUnit)
                              : set.durationSeconds != null
                                ? `${set.durationSeconds}s`
                                : '—'}
                          </p>
                          {set.reps != null && <p className="text-muted-foreground">{set.reps} reps</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {exerciseHistory.length > 0 && (
                  <div className="space-y-2">
                    <h5 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Volume trend
                    </h5>
                    <div className="flex h-20 items-end gap-1.5" aria-label="Exercise volume trend">
                      {exerciseHistory
                        .slice()
                        .reverse()
                        .map((item) => (
                          <div key={item.id} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                            <div
                              className="w-full rounded-t bg-emerald-500/70"
                              style={{ height: `${Math.max(6, (item.volume / maxHistoryVolume) * 60)}px` }}
                              title={formatVolume(item.volume, weightUnit)}
                            />
                            <span className="truncate text-[10px] text-muted-foreground">
                              {item.date
                                ? new Date(item.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                                : '—'}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
