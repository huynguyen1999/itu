import { useState, useMemo } from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, X, Sparkles, Dumbbell } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import type { GymExercise, GymRoutine } from '../gymQueries';
import { useGymExercises } from '../gymQueries';
import { useCreateGymRoutine, useUpdateGymRoutine } from '../gymMutations';
import { ExercisePickerDialog } from '../active/ExercisePickerDialog';

interface PlannedRoutineExercise {
  id?: string;
  exerciseId: string;
  exerciseName: string;
  metricType?: string;
  sortOrder: number;
  setCount: number;
  targetRepsMin?: number | null;
  targetRepsMax?: number | null;
  targetDurationSeconds?: number | null;
  targetDistanceMeters?: number | null;
  restSeconds?: number | null;
  note?: string | null;
}

export function RoutineEditorDialog({
  open,
  routine,
  onClose,
}: {
  open: boolean;
  routine?: GymRoutine | null;
  onClose: () => void;
}) {
  const { data: exercises = [] } = useGymExercises();
  const createRoutine = useCreateGymRoutine();
  const updateRoutine = useUpdateGymRoutine();

  const [name, setName] = useState(routine?.name || '');
  const [description, setDescription] = useState(routine?.description || '');
  const [plannedExercises, setPlannedExercises] = useState<PlannedRoutineExercise[]>(() => {
    if (!routine?.exercises) return [];
    return routine.exercises.map((re, idx) => ({
      id: re.id,
      exerciseId: re.exerciseId,
      exerciseName: re.exercise?.name || 'Exercise',
      metricType: re.exercise?.metricType || 'WEIGHT_REPS',
      sortOrder: re.sortOrder ?? idx,
      setCount: re.setCount ?? 3,
      targetRepsMin: re.targetRepsMin ?? null,
      targetRepsMax: re.targetRepsMax ?? null,
      targetDurationSeconds: re.targetDurationSeconds ?? null,
      targetDistanceMeters: re.targetDistanceMeters ?? null,
      restSeconds: re.restSeconds ?? null,
      note: re.note || null,
    }));
  });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddExercise = (exercise: GymExercise) => {
    setPlannedExercises((prev) => [
      ...prev,
      {
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        metricType: exercise.metricType || 'WEIGHT_REPS',
        sortOrder: prev.length,
        setCount: 3,
        targetRepsMin: 8,
        targetRepsMax: 12,
        restSeconds: exercise.defaultRestSeconds ?? 60,
        note: null,
      },
    ]);
    setPickerOpen(false);
  };

  const handleRemoveExercise = (index: number) => {
    setPlannedExercises((prev) => prev.filter((_, i) => i !== index));
  };

  const handleMoveExercise = (index: number, direction: 'up' | 'down') => {
    setPlannedExercises((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;
      return next.map((item, idx) => ({ ...item, sortOrder: idx }));
    });
  };

  const handleUpdateExerciseField = (index: number, field: keyof PlannedRoutineExercise, value: any) => {
    setPlannedExercises((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSaving(true);
    try {
      const exercisePayload = plannedExercises.map((ex, idx) => ({
        id: ex.id,
        exerciseId: ex.exerciseId,
        sortOrder: idx,
        setCount: Number(ex.setCount) || 3,
        targetRepsMin: ex.targetRepsMin ? Number(ex.targetRepsMin) : null,
        targetRepsMax: ex.targetRepsMax ? Number(ex.targetRepsMax) : null,
        targetDurationSeconds: ex.targetDurationSeconds ? Number(ex.targetDurationSeconds) : null,
        targetDistanceMeters: ex.targetDistanceMeters ? Number(ex.targetDistanceMeters) : null,
        restSeconds: ex.restSeconds ? Number(ex.restSeconds) : null,
        note: ex.note?.trim() || null,
      }));

      if (routine?.id) {
        await updateRoutine.mutateAsync({
          id: routine.id,
          data: {
            name: name.trim(),
            description: description.trim() || undefined,
            exercises: exercisePayload,
          },
        });
      } else {
        await createRoutine.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
          exercises: exercisePayload,
        });
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        role="presentation"
        onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      >
        <Card
          className="w-full max-w-2xl max-h-[90vh] flex flex-col space-y-4 p-6 overflow-hidden bg-background text-foreground border shadow-xl"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex items-center justify-between border-b pb-3">
            <div className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">{routine?.id ? 'Edit Routine' : 'Create Routine'}</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="space-y-3">
              <div>
                <Label htmlFor="routine-name">Routine Name</Label>
                <Input
                  id="routine-name"
                  placeholder="e.g. Push Day (Chest & Triceps)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="routine-desc">Description (optional)</Label>
                <Textarea
                  id="routine-desc"
                  placeholder="Focus on progressive overload and strict form"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className="mt-1 resize-none"
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Planned Exercises ({plannedExercises.length})</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                  className="gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Exercise
                </Button>
              </div>

              {plannedExercises.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No exercises added yet. Add exercises to build your structured routine.
                </div>
              ) : (
                <div className="space-y-3">
                  {plannedExercises.map((item, idx) => (
                    <div
                      key={item.id || `${item.exerciseId}-${idx}`}
                      className="rounded-lg border bg-card p-3.5 space-y-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 font-medium">
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary font-semibold">
                            {idx + 1}
                          </span>
                          <span>{item.exerciseName}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={idx === 0}
                            onClick={() => handleMoveExercise(idx, 'up')}
                            className="h-7 w-7 p-0"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={idx === plannedExercises.length - 1}
                            onClick={() => handleMoveExercise(idx, 'down')}
                            className="h-7 w-7 p-0"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveExercise(idx)}
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                        <div>
                          <Label className="text-xs text-muted-foreground">Sets</Label>
                          <Input
                            type="number"
                            min={1}
                            max={20}
                            value={item.setCount}
                            onChange={(e) => handleUpdateExerciseField(idx, 'setCount', parseInt(e.target.value) || 1)}
                            className="h-8 mt-0.5 text-xs"
                          />
                        </div>

                        {item.metricType === 'WEIGHT_REPS' || item.metricType === 'REPS' ? (
                          <>
                            <div>
                              <Label className="text-xs text-muted-foreground">Min Reps</Label>
                              <Input
                                type="number"
                                min={1}
                                placeholder="e.g. 8"
                                value={item.targetRepsMin ?? ''}
                                onChange={(e) =>
                                  handleUpdateExerciseField(
                                    idx,
                                    'targetRepsMin',
                                    e.target.value ? parseInt(e.target.value) : null,
                                  )
                                }
                                className="h-8 mt-0.5 text-xs"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Max Reps</Label>
                              <Input
                                type="number"
                                min={1}
                                placeholder="e.g. 12"
                                value={item.targetRepsMax ?? ''}
                                onChange={(e) =>
                                  handleUpdateExerciseField(
                                    idx,
                                    'targetRepsMax',
                                    e.target.value ? parseInt(e.target.value) : null,
                                  )
                                }
                                className="h-8 mt-0.5 text-xs"
                              />
                            </div>
                          </>
                        ) : item.metricType === 'DURATION' ? (
                          <div className="col-span-2">
                            <Label className="text-xs text-muted-foreground">Target Seconds</Label>
                            <Input
                              type="number"
                              min={1}
                              placeholder="e.g. 60"
                              value={item.targetDurationSeconds ?? ''}
                              onChange={(e) =>
                                handleUpdateExerciseField(
                                  idx,
                                  'targetDurationSeconds',
                                  e.target.value ? parseInt(e.target.value) : null,
                                )
                              }
                              className="h-8 mt-0.5 text-xs"
                            />
                          </div>
                        ) : (
                          <>
                            <div>
                              <Label className="text-xs text-muted-foreground">Distance (m)</Label>
                              <Input
                                type="number"
                                min={1}
                                placeholder="meters"
                                value={item.targetDistanceMeters ?? ''}
                                onChange={(e) =>
                                  handleUpdateExerciseField(
                                    idx,
                                    'targetDistanceMeters',
                                    e.target.value ? parseFloat(e.target.value) : null,
                                  )
                                }
                                className="h-8 mt-0.5 text-xs"
                              />
                            </div>
                            <div>
                              <Label className="text-xs text-muted-foreground">Duration (s)</Label>
                              <Input
                                type="number"
                                min={1}
                                placeholder="seconds"
                                value={item.targetDurationSeconds ?? ''}
                                onChange={(e) =>
                                  handleUpdateExerciseField(
                                    idx,
                                    'targetDurationSeconds',
                                    e.target.value ? parseInt(e.target.value) : null,
                                  )
                                }
                                className="h-8 mt-0.5 text-xs"
                              />
                            </div>
                          </>
                        )}

                        <div>
                          <Label className="text-xs text-muted-foreground">Rest (sec)</Label>
                          <Input
                            type="number"
                            min={0}
                            step={15}
                            placeholder="60"
                            value={item.restSeconds ?? ''}
                            onChange={(e) =>
                              handleUpdateExerciseField(
                                idx,
                                'restSeconds',
                                e.target.value ? parseInt(e.target.value) : null,
                              )
                            }
                            className="h-8 mt-0.5 text-xs"
                          />
                        </div>
                      </div>

                      <div>
                        <Input
                          placeholder="Exercise note (e.g. 2s pause at bottom, RPE 8)"
                          value={item.note ?? ''}
                          onChange={(e) => handleUpdateExerciseField(idx, 'note', e.target.value || null)}
                          className="h-7 text-xs bg-muted/30"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t mt-auto">
              <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
                Cancel
              </Button>
              <Button type="submit" disabled={!name.trim() || isSaving}>
                {isSaving ? 'Saving...' : routine?.id ? 'Save Changes' : 'Create Routine'}
              </Button>
            </div>
          </form>
        </Card>
      </div>

      <ExercisePickerDialog
        open={pickerOpen}
        exercises={exercises}
        recentIds={new Set()}
        favoriteIds={new Set(exercises.filter((e) => e.isFavorite || e.favorite).map((e) => e.id))}
        isLoading={false}
        isCreating={false}
        onClose={() => setPickerOpen(false)}
        onAdd={handleAddExercise}
        onCreateCustom={async () => {}}
        onToggleFavorite={() => {}}
      />
    </>
  );
}
