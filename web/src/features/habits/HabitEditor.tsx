import { FormEvent, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Habit, HabitTargetType, HabitTimeBlock, TaskTag } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import {
  DEFAULT_HABIT_COLOR,
  DEFAULT_HABIT_ICON,
  HabitStylePicker,
} from './habitStyles';
import { ANYTIME_GROUP, localDay } from './habitModel';
import { TagSelector } from './HabitFormFields';

export function HabitEditor({
  open,
  onOpenChange,
  timeBlocks,
  tags,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeBlocks: HabitTimeBlock[];
  tags: TaskTag[];
}) {
  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<HabitTargetType>('BOOLEAN');
  const [targetValue, setTargetValue] = useState('1');
  const [unit, setUnit] = useState('');
  const [direction, setDirection] = useState<'BUILD' | 'LIMIT'>('BUILD');
  const [scheduleType, setScheduleType] = useState<'WEEKDAYS' | 'INTERVAL' | 'TIMES_PER_PERIOD'>('WEEKDAYS');
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [timeBlockId, setTimeBlockId] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(localDay(new Date()));
  const [icon, setIcon] = useState(DEFAULT_HABIT_ICON);
  const [color, setColor] = useState(DEFAULT_HABIT_COLOR);
  const [intervalDays, setIntervalDays] = useState('2');
  const [timesPerPeriod, setTimesPerPeriod] = useState('3');
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: () =>
      api.createHabit({
        name: name.trim(),
        icon,
        color,
        targetType,
        targetValue: Number(targetValue),
        unit: unit.trim() || undefined,
        direction,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timeBlockId: timeBlockId || undefined,
        tagIds,
        scheduleType,
        weekdays: scheduleType === 'WEEKDAYS' ? weekdays : undefined,
        intervalDays: scheduleType === 'INTERVAL' ? Number(intervalDays) : undefined,
        timesPerPeriod: scheduleType === 'TIMES_PER_PERIOD' ? Number(timesPerPeriod) : undefined,
        period: scheduleType === 'TIMES_PER_PERIOD' ? 'WEEK' : undefined,
        startDate: `${startDate}T00:00:00.000Z`,
      }),
    onSuccess: async (created) => {
      onOpenChange(false);
      setName('');
      setTargetType('BOOLEAN');
      setTargetValue('1');
      setUnit('');
      setDirection('BUILD');
      setScheduleType('WEEKDAYS');
      setWeekdays([0, 1, 2, 3, 4, 5, 6]);
      setTimeBlockId('');
      setTagIds([]);
      setStartDate(localDay(new Date()));
      setIcon(DEFAULT_HABIT_ICON);
      setColor(DEFAULT_HABIT_COLOR);
      queryClient.setQueryData<Habit[]>(['habits'], (current) => {
        const optimisticCreated = {
          ...created,
          timeBlock: timeBlocks.find((block) => block.id === timeBlockId) ?? null,
          tags: tags.filter((tag) => tagIds.includes(tag.id)).map((tag) => ({ tag })),
        };
        if (!current) return [optimisticCreated];
        return [optimisticCreated, ...current.filter((habit) => habit.id !== created.id)];
      });
      await queryClient.invalidateQueries({ queryKey: ['habit-occurrences'] });
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim()) create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-xl">Create habit</DialogTitle>
        </DialogHeader>
        <form className="space-y-4 py-2" onSubmit={submit}>
          <div>
            <label htmlFor="habit-name" className="mb-1 block text-xs font-semibold text-muted-foreground">
              Name
            </label>
            <Input
              id="habit-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Daily check-in"
              autoFocus
            />
          </div>

          <HabitStylePicker icon={icon} color={color} onIconChange={setIcon} onColorChange={setColor} />

          <div>
            <label htmlFor="habit-frequency" className="mb-1 block text-xs font-semibold text-muted-foreground">
              Frequency
            </label>
            <select
              id="habit-frequency"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={scheduleType}
              onChange={(e) => setScheduleType(e.target.value as 'WEEKDAYS' | 'INTERVAL' | 'TIMES_PER_PERIOD')}
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
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, idx) => (
                  <button
                    type="button"
                    key={`${label}-${idx}`}
                    onClick={() =>
                      setWeekdays((current) =>
                        current.includes(idx) ? current.filter((d) => d !== idx) : [...current, idx],
                      )
                    }
                    className={`h-8 flex-1 rounded-full border text-xs font-semibold transition-colors ${
                      weekdays.includes(idx)
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background hover:bg-muted'
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
              <label htmlFor="habit-interval" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Repeat every
              </label>
              <Input
                id="habit-interval"
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
              <label htmlFor="habit-weekly" className="mb-1 block text-xs font-semibold text-muted-foreground">
                Times per week
              </label>
              <Input
                id="habit-weekly"
                type="number"
                min={1}
                max={100}
                value={timesPerPeriod}
                onChange={(event) => setTimesPerPeriod(event.target.value)}
              />
            </div>
          ) : null}

          <div>
            <label htmlFor="habit-goal" className="mb-1 block text-xs font-semibold text-muted-foreground">
              Goal
            </label>
            <div className="grid grid-cols-[1fr_5rem_5rem] gap-2">
              <select
                id="habit-goal"
                className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as HabitTargetType)}
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
                onChange={(e) => setTargetValue(e.target.value)}
              />
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="unit" />
            </div>
          </div>

          <div>
            <label htmlFor="habit-start-date" className="mb-1 block text-xs font-semibold text-muted-foreground">
              Start date
            </label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="habit-start-date"
                type="date"
                className="pl-8"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="habit-group" className="mb-1 block text-xs font-semibold text-muted-foreground">
              Group
            </label>
            <select
              id="habit-group"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={timeBlockId}
              onChange={(e) => setTimeBlockId(e.target.value)}
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
            <label htmlFor="habit-direction" className="mb-1 block text-xs font-semibold text-muted-foreground">
              Direction
            </label>
            <select
              id="habit-direction"
              className="h-9 w-full rounded-md border border-border bg-background px-2 text-xs"
              value={direction}
              onChange={(e) => setDirection(e.target.value as 'BUILD' | 'LIMIT')}
            >
              <option value="BUILD">Build behavior</option>
              <option value="LIMIT">Limit behavior</option>
            </select>
          </div>

          <TagSelector label="Tags" tags={tags} selectedTagIds={tagIds} onChange={setTagIds} />

          {create.error && <p className="text-xs text-destructive">{create.error.message}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || create.isPending}>
              {create.isPending ? 'Creating…' : 'Create habit'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
