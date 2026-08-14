import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Flame, Target, Zap } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Habit, HabitTargetType, HabitTimeBlock, TaskTag } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { GrowthRewardEditor, type GrowthRewardEditorHandle } from '@/shared/ui/GrowthRewardEditor';
import {
  DEFAULT_HABIT_COLOR,
  DEFAULT_HABIT_ICON,
  HabitStylePicker,
  isHabitColor,
  isHabitIcon,
} from './habitStyles';
import { ANYTIME_GROUP } from './habitModel';
import { Metric, TagSelector } from './HabitFormFields';

export function HabitDetail({
  habit,
  open,
  onOpenChange,
  timeBlocks,
  tags,
}: {
  habit: Habit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeBlocks: HabitTimeBlock[];
  tags: TaskTag[];
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<HabitTargetType>('BOOLEAN');
  const [targetValue, setTargetValue] = useState('1');
  const [unit, setUnit] = useState('');
  const [direction, setDirection] = useState<'BUILD' | 'LIMIT'>('BUILD');
  const [scheduleType, setScheduleType] = useState<'WEEKDAYS' | 'INTERVAL' | 'TIMES_PER_PERIOD'>('WEEKDAYS');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [intervalDays, setIntervalDays] = useState('2');
  const [timesPerPeriod, setTimesPerPeriod] = useState('3');
  const [startDate, setStartDate] = useState('');
  const [timeBlockId, setTimeBlockId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [icon, setIcon] = useState(DEFAULT_HABIT_ICON);
  const [color, setColor] = useState(DEFAULT_HABIT_COLOR);
  const growthEditorRef = useRef<GrowthRewardEditorHandle>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setSaveError(null);
    if (!habit || !open) return;
    setName(habit.name || '');
    setTargetType(habit.targetType || 'BOOLEAN');
    setTargetValue(String(habit.targetValue ?? 1));
    setUnit(habit.unit ?? '');
    setDirection(habit.direction || 'BUILD');
    setScheduleType(habit.scheduleType || 'WEEKDAYS');
    setWeekdays(habit.weekdays ?? []);
    setIntervalDays(String(habit.intervalDays ?? 2));
    setTimesPerPeriod(String(habit.timesPerPeriod ?? 3));
    setStartDate(habit.startDate ? habit.startDate.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setTimeBlockId(habit.timeBlockId ?? '');
    setTagIds((habit.tags?.map(({ tag }) => tag?.id).filter(Boolean) as string[]) ?? []);
    setIcon(isHabitIcon(habit.icon) ? habit.icon : DEFAULT_HABIT_ICON);
    setColor(isHabitColor(habit.color) ? habit.color : DEFAULT_HABIT_COLOR);
  }, [habit, open]);

  const stats = useQuery({
    queryKey: ['habit-stats', habit?.id],
    queryFn: () => api.habitStats(habit!.id),
    enabled: !!habit,
  });

  const archive = useMutation({
    mutationFn: () => api.updateHabit(habit!.id, { archived: !habit!.archivedAt, version: habit!.version }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      queryClient.invalidateQueries({ queryKey: ['habit-occurrences'] });
      onOpenChange(false);
    },
  });
  const save = useMutation({
    mutationFn: () =>
      api.updateHabit(habit!.id, {
        name: name.trim(),
        icon,
        color,
        targetType,
        targetValue: Number(targetValue),
        unit: unit.trim() || null,
        direction,
        scheduleType,
        weekdays,
        intervalDays: Number(intervalDays),
        timesPerPeriod: Number(timesPerPeriod),
        period: 'WEEK',
        startDate: `${startDate}T00:00:00.000Z`,
        timeBlockId: timeBlockId || null,
        tagIds,
        version: habit!.version,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData<Habit[]>(['habits'], (current) =>
        current?.map((item) =>
          item.id === updated.id
            ? {
                ...item,
                ...updated,
                timeBlock: timeBlocks.find((block) => block.id === timeBlockId) ?? null,
                tags: tags.filter((tag) => tagIds.includes(tag.id)).map((tag) => ({ tag })),
              }
            : item,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      queryClient.invalidateQueries({ queryKey: ['habit-occurrences'] });
      onOpenChange(false);
    },
  });
  if (!habit) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] max-w-md flex-col overflow-hidden border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-xl">Edit habit</DialogTitle>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!name.trim()) return;
            setIsSaving(true);
            setSaveError(null);
            try {
              await growthEditorRef.current?.savePendingChanges();
              await save.mutateAsync();
            } catch (error) {
              setSaveError(error instanceof Error ? error.message : 'Failed to save habit.');
            } finally {
              setIsSaving(false);
            }
          }}
        >
          {saveError ? (
            <p
              className="mx-4 mt-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {saveError}
            </p>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4 py-2">
            <div className="grid grid-cols-3 gap-2">
              <Metric
                icon={<Flame className="text-amber-500" />}
                label="Streak"
                value={`${stats.data?.currentStreak ?? 0} d`}
              />
              <Metric
                icon={<Zap className="text-blue-500" />}
                label="Best"
                value={`${stats.data?.bestStreak ?? 0} d`}
              />
              <Metric
                icon={<Target className="text-emerald-500" />}
                label="Success"
                value={`${Math.round((stats.data?.successRate ?? 0) * 100)}%`}
              />
            </div>

            <div>
              <label htmlFor="edit-habit-name" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Name
              </label>
              <Input id="edit-habit-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>

            <HabitStylePicker icon={icon} color={color} onIconChange={setIcon} onColorChange={setColor} />

            <div>
              <label htmlFor="edit-habit-frequency" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Frequency
              </label>
              <select
                id="edit-habit-frequency"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                value={scheduleType}
                onChange={(event) =>
                  setScheduleType(event.target.value as 'WEEKDAYS' | 'INTERVAL' | 'TIMES_PER_PERIOD')
                }
              >
                <option value="WEEKDAYS">Every day or selected days</option>
                <option value="TIMES_PER_PERIOD">Times per week</option>
                <option value="INTERVAL">Every few days</option>
              </select>
            </div>

            {scheduleType === 'WEEKDAYS' ? (
              <div>
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">Goal days</span>
                <div className="flex gap-1">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => (
                    <button
                      type="button"
                      key={`${label}-${index}`}
                      aria-label={['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][index]}
                      aria-pressed={weekdays.includes(index)}
                      onClick={() =>
                        setWeekdays((current) =>
                          current.includes(index) ? current.filter((day) => day !== index) : [...current, index],
                        )
                      }
                      className={`h-8 flex-1 rounded-full border text-xs font-semibold transition-colors ${
                        weekdays.includes(index)
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {scheduleType === 'INTERVAL' ? (
              <div>
                <label htmlFor="edit-habit-interval" className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Repeat every
                </label>
                <Input
                  id="edit-habit-interval"
                  type="number"
                  min={1}
                  max={365}
                  value={intervalDays}
                  onChange={(event) => setIntervalDays(event.target.value)}
                />
              </div>
            ) : null}

            {scheduleType === 'TIMES_PER_PERIOD' ? (
              <div>
                <label htmlFor="edit-habit-weekly" className="mb-1 block text-xs font-semibold text-muted-foreground">
                  Times per week
                </label>
                <Input
                  id="edit-habit-weekly"
                  type="number"
                  min={1}
                  max={100}
                  value={timesPerPeriod}
                  onChange={(event) => setTimesPerPeriod(event.target.value)}
                />
              </div>
            ) : null}

            <div>
              <label htmlFor="edit-habit-goal" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Goal
              </label>
              <div className="grid grid-cols-[1fr_5rem_5rem] gap-2">
                <select
                  id="edit-habit-goal"
                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                  value={targetType}
                  onChange={(event) => setTargetType(event.target.value as HabitTargetType)}
                >
                  <option value="BOOLEAN">Check off</option>
                  <option value="COUNT">Count</option>
                  <option value="DURATION">Duration</option>
                  <option value="QUANTITY">Quantity</option>
                </select>
                <Input
                  type="number"
                  min="0.0001"
                  step="any"
                  value={targetValue}
                  onChange={(event) => setTargetValue(event.target.value)}
                  aria-label="Goal value"
                />
                <Input
                  value={unit}
                  onChange={(event) => setUnit(event.target.value)}
                  placeholder="unit"
                  aria-label="Goal unit"
                />
              </div>
            </div>

            <div>
              <label htmlFor="edit-habit-start-date" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Start date
              </label>
              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="edit-habit-start-date"
                  type="date"
                  className="pl-8"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="edit-habit-group" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Group
              </label>
              <select
                id="edit-habit-group"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                value={timeBlockId}
                onChange={(event) => setTimeBlockId(event.target.value)}
              >
                <option value="">{ANYTIME_GROUP}</option>
                {timeBlocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="edit-habit-direction" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Direction
              </label>
              <select
                id="edit-habit-direction"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                value={direction}
                onChange={(event) => setDirection(event.target.value as 'BUILD' | 'LIMIT')}
              >
                <option value="BUILD">Build behavior</option>
                <option value="LIMIT">Limit behavior</option>
              </select>
            </div>

            <TagSelector label="Tags" tags={tags} selectedTagIds={tagIds} onChange={setTagIds} />

            <div className="border-t border-border pt-4">
              <GrowthRewardEditor ref={growthEditorRef} sourceType="HABIT" sourceId={habit.id} />
            </div>

            {save.error instanceof Error ? <p className="text-xs text-destructive">{save.error.message}</p> : null}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-border bg-card/95 pt-4 backdrop-blur">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="text-destructive"
              disabled={archive.isPending || save.isPending}
              onClick={() => archive.mutate()}
            >
              {archive.isPending ? 'Updating…' : habit.archivedAt ? 'Restore habit' : 'Archive habit'}
            </Button>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={!name.trim() || isSaving || save.isPending}>
                {isSaving || save.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
