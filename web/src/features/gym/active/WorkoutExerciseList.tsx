import { useState } from 'react';
import { ArrowDown, ArrowUp, Check, MoreHorizontal, Plus, Trash2, Trophy, BookOpen, Copy } from 'lucide-react';
import type { GymPreferences } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import type { ExerciseMetricType, GymWorkoutExercise, GymWorkoutSet } from '../gymQueries';
import { formatWeight, fromDisplayWeight, toDisplayWeight, weightUnitLabel } from '../weightUnits';

type NumericSetField = 'weight' | 'reps' | 'durationSeconds' | 'distanceMeters' | 'rpe';
const metricFields: Record<ExerciseMetricType, Array<{ field: NumericSetField; label: string; step?: string }>> = {
  WEIGHT_REPS: [
    { field: 'weight', label: 'Weight', step: '0.01' },
    { field: 'reps', label: 'Reps' },
  ],
  REPS: [{ field: 'reps', label: 'Reps' }],
  DURATION: [{ field: 'durationSeconds', label: 'Duration (sec)' }],
  DISTANCE_DURATION: [
    { field: 'distanceMeters', label: 'Distance (m)', step: '0.01' },
    { field: 'durationSeconds', label: 'Duration (sec)' },
  ],
};

function previousSummary(
  previous: GymWorkoutSet['previous'],
  metric: ExerciseMetricType,
  weightUnit: 'KG' | 'LBS',
): string {
  if (!previous) return '';
  const fields =
    metric === 'WEIGHT_REPS'
      ? [
          previous.weight !== undefined && previous.weight !== null ? formatWeight(previous.weight, weightUnit) : null,
          previous.reps !== undefined && previous.reps !== null ? `${previous.reps} reps` : null,
        ]
      : metric === 'REPS'
        ? [previous.reps !== undefined && previous.reps !== null ? `${previous.reps} reps` : null]
        : metric === 'DISTANCE_DURATION'
          ? [
              previous.distanceMeters !== undefined && previous.distanceMeters !== null
                ? `${previous.distanceMeters}m`
                : null,
              previous.durationSeconds !== undefined && previous.durationSeconds !== null
                ? `${previous.durationSeconds}s`
                : null,
            ]
          : [
              previous.durationSeconds !== undefined && previous.durationSeconds !== null
                ? `${previous.durationSeconds}s`
                : null,
            ];
  return [...fields, previous.rpe !== undefined && previous.rpe !== null ? `RPE ${previous.rpe}` : null]
    .filter(Boolean)
    .join(' · ');
}

type Patch = Record<string, unknown>;

export function WorkoutExerciseList({
  exercises,
  prefs,
  onPatchExercise,
  onPatchSet,
  onToggleSet,
  onRemoveSet,
  onAddSet,
  onRemoveExercise,
  onMoveExercise,
  onRequestAddExercise,
}: {
  exercises: GymWorkoutExercise[];
  prefs: GymPreferences;
  onPatchExercise: (exerciseIndex: number, patch: Patch) => void;
  onPatchSet: (exerciseIndex: number, setIndex: number, patch: Patch) => void;
  onToggleSet: (exerciseIndex: number, setIndex: number) => void | Promise<void>;
  onRemoveSet: (exerciseIndex: number, setIndex: number) => void | Promise<void>;
  onAddSet: (exerciseIndex: number) => void | Promise<void>;
  onRemoveExercise: (exerciseIndex: number) => void | Promise<void>;
  onMoveExercise: (exerciseIndex: number, direction: -1 | 1) => void;
  onRequestAddExercise: () => void;
}) {
  const [showGuide, setShowGuide] = useState<Record<number, boolean>>({});

  const handleCopyPrevious = (exerciseIndex: number, setIndex: number, prev: GymWorkoutSet['previous']) => {
    if (!prev) return;
    const patch: Patch = {};
    if (prev.weight !== undefined && prev.weight !== null) patch.weight = prev.weight;
    if (prev.reps !== undefined && prev.reps !== null) patch.reps = prev.reps;
    if (prev.durationSeconds !== undefined && prev.durationSeconds !== null) patch.durationSeconds = prev.durationSeconds;
    if (prev.distanceMeters !== undefined && prev.distanceMeters !== null) patch.distanceMeters = prev.distanceMeters;
    if (prev.rpe !== undefined && prev.rpe !== null) patch.rpe = prev.rpe;
    onPatchSet(exerciseIndex, setIndex, patch);
  };

  return (
    <div className="space-y-4">
      {exercises.map((exercise, exerciseIndex) => {
        const metric = exercise.exercise?.metricType || 'WEIGHT_REPS';
        const fields = metricFields[metric];
        const userNotes = exercise.exercise?.userNotes;
        const isGuideOpen = Boolean(showGuide[exerciseIndex]);

        return (
          <Card key={exercise.id || `${exercise.exerciseId}-${exerciseIndex}`} className="overflow-hidden shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/60 p-4">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                  {exerciseIndex + 1}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold">{exercise.exercise?.name || exercise.exerciseName || 'Exercise'}</h2>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">{metric.replace(/_/g, ' ').toLowerCase()}</span>
                    {userNotes && (
                      <button
                        type="button"
                        onClick={() => setShowGuide((prev) => ({ ...prev, [exerciseIndex]: !prev[exerciseIndex] }))}
                        className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                      >
                        <BookOpen className="w-3 h-3" />
                        {isGuideOpen ? 'Hide form notes' : 'Form notes'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label="Exercise actions">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onMoveExercise(exerciseIndex, -1)} disabled={exerciseIndex === 0}>
                    <ArrowUp className="h-4 w-4" />
                    Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => onMoveExercise(exerciseIndex, 1)}
                    disabled={exerciseIndex === exercises.length - 1}
                  >
                    <ArrowDown className="h-4 w-4" />
                    Move down
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => void onRemoveExercise(exerciseIndex)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Remove exercise
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {userNotes && isGuideOpen && (
              <div className="bg-primary/5 border-b border-primary/10 px-4 py-2.5 text-xs text-muted-foreground flex items-start gap-2">
                <BookOpen className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                <div>
                  <span className="font-medium text-foreground">Exercise Notes: </span>
                  {userNotes}
                </div>
              </div>
            )}

            <div className="space-y-2 p-4">
              <label className="block space-y-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Workout notes</span>
                <Textarea
                  value={exercise.note || ''}
                  onChange={(event) => onPatchExercise(exerciseIndex, { note: event.target.value })}
                  placeholder="Set cues, machine settings, or feelings today"
                  rows={1}
                  className="min-h-0 resize-y text-xs"
                />
              </label>

              <div className="space-y-2" aria-label={`${exercise.exercise?.name || 'Exercise'} sets`}>
                <div className="hidden items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:flex">
                  <span className="w-8">Set</span>
                  <span className="flex-1">Metrics</span>
                  <span className="w-20 text-center">Done</span>
                </div>
                {exercise.sets.map((set, setIndex) => {
                  const prevText = set.previous ? previousSummary(set.previous, metric, prefs.weightUnit) : null;
                  const hasPRs = Boolean(set.prs && set.prs.length > 0);

                  return (
                    <div
                      key={set.id || `${exerciseIndex}-${setIndex}`}
                      className={`flex flex-wrap items-end gap-2 rounded-md border p-2 ${
                        set.completedAt
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border/60 bg-muted/20'
                      }`}
                    >
                      <div className="w-8 pb-2 text-center flex flex-col items-center justify-center">
                        <span className="font-mono text-xs font-semibold text-muted-foreground">
                          {setIndex + 1}
                        </span>
                        {hasPRs && (
                          <span
                            title={set.prs?.join(', ')}
                            className="flex items-center text-[10px] text-amber-500 font-bold"
                          >
                            <Trophy className="w-3 h-3 fill-amber-500" />
                          </span>
                        )}
                      </div>

                      <div className="flex min-w-[220px] flex-1 flex-wrap gap-2">
                        {fields.map(({ field, label, step }) => {
                          const displayLabel = field === 'weight' ? `Weight (${weightUnitLabel(prefs.weightUnit)})` : label;
                          return (
                            <label key={field} className="min-w-[94px] flex-1 space-y-1">
                              <span className="text-[10px] font-medium text-muted-foreground sm:hidden">{displayLabel}</span>
                              <Input
                                type="number"
                                min="0"
                                step={step}
                                value={
                                  field === 'weight'
                                    ? (toDisplayWeight((set as any)[field], prefs.weightUnit) ?? '')
                                    : ((set as any)[field] ?? '')
                                }
                                onChange={(event) =>
                                  onPatchSet(exerciseIndex, setIndex, {
                                    [field]:
                                      event.target.value === ''
                                        ? null
                                        : field === 'weight'
                                          ? fromDisplayWeight(Number(event.target.value), prefs.weightUnit)
                                          : Number(event.target.value),
                                  })
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void onToggleSet(exerciseIndex, setIndex);
                                  }
                                }}
                                aria-label={`${exercise.exercise?.name || 'Exercise'} set ${setIndex + 1} ${displayLabel}`}
                                className="h-9 text-xs font-mono"
                                placeholder="—"
                              />
                            </label>
                          );
                        })}
                        {prefs.showRpe && (
                          <label className="min-w-[72px] flex-1 space-y-1">
                            <span className="text-[10px] font-medium text-muted-foreground sm:hidden">RPE</span>
                            <Input
                              type="number"
                              min="0"
                              max="10"
                              step="0.5"
                              value={set.rpe ?? ''}
                              onChange={(event) =>
                                onPatchSet(exerciseIndex, setIndex, {
                                  rpe: event.target.value === '' ? null : Number(event.target.value),
                                })
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  void onToggleSet(exerciseIndex, setIndex);
                                }
                              }}
                              aria-label={`${exercise.exercise?.name || 'Exercise'} set ${setIndex + 1} RPE`}
                              className="h-9 text-xs font-mono"
                              placeholder="RPE"
                            />
                          </label>
                        )}
                        <label className="min-w-[96px] flex-1 space-y-1">
                          <span className="text-[10px] font-medium text-muted-foreground sm:hidden">Set type</span>
                          <select
                            value={set.type === 'WARMUP' ? 'WARM_UP' : set.type || 'NORMAL'}
                            onChange={(event) => onPatchSet(exerciseIndex, setIndex, { type: event.target.value })}
                            aria-label={`Set ${setIndex + 1} type`}
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                          >
                            <option value="NORMAL">Normal</option>
                            <option value="WARM_UP">Warm-up</option>
                            <option value="DROP">Drop</option>
                            <option value="FAILURE">Failure</option>
                          </select>
                        </label>
                      </div>

                      <div className="flex w-20 justify-end gap-1 pb-0.5">
                        <Button
                          data-gym-set-complete={String(Boolean(set.completedAt))}
                          type="button"
                          variant={set.completedAt ? 'default' : 'outline'}
                          size="icon"
                          className="h-9 w-9"
                          onClick={() => void onToggleSet(exerciseIndex, setIndex)}
                          aria-label={`${set.completedAt ? 'Uncomplete' : 'Complete'} set ${setIndex + 1}`}
                        >
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-destructive"
                          onClick={() => void onRemoveSet(exerciseIndex, setIndex)}
                          aria-label={`Remove set ${setIndex + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>

                      {prevText && (
                        <div className="w-full flex items-center justify-between pl-10 text-[11px] text-muted-foreground">
                          <span>Prev: {prevText}</span>
                          {!set.completedAt && (
                            <button
                              type="button"
                              onClick={() => handleCopyPrevious(exerciseIndex, setIndex, set.previous)}
                              className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                            >
                              <Copy className="w-2.5 h-2.5" />
                              Copy
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full mt-1"
                onClick={() => void onAddSet(exerciseIndex)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add set
              </Button>
            </div>
          </Card>
        );
      })}

      <Button type="button" size="sm" className="w-full" onClick={onRequestAddExercise}>
        <Plus className="h-4 w-4" />
        Add exercise
      </Button>
    </div>
  );
}
