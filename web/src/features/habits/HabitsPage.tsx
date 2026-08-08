import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  ChevronDown,
  Flame,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Settings,
  Smile,
  Target,
  X,
  Zap,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Habit, HabitOccurrence, HabitTargetType, HabitTimeBlock, TaskTag } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { FeatureSettingsButton } from '@/shared/ui/feature-settings';
import {
  HabitsSettingsPopover,
  DEFAULT_HABITS_DISPLAY_SETTINGS,
  type HabitsDisplaySettings,
} from './HabitsSettingsPopover';
import type { HabitPreferences } from '@/shared/api/preferencesApi';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog';
import { GrowthRewardEditor, type GrowthRewardEditorHandle } from '@/shared/ui/GrowthRewardEditor';
import { GrowthRewardChip, groupedGrowthRewardChips, type GrowthRewardChipModel } from '@/shared/ui/GrowthRewardChip';
import {
  DEFAULT_HABIT_COLOR,
  DEFAULT_HABIT_ICON,
  HabitIconBadge,
  HabitStylePicker,
  isHabitColor,
  isHabitIcon,
} from './habitStyles';

const ANYTIME_GROUP = 'Anytime';

function localDay(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const date = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function shiftDay(dateStr: string, delta: number) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  return localDay(d);
}

function eventKey(prefix: string) {
  return `${prefix}:${Date.now()}:${crypto.randomUUID()}`;
}

function getWeekDays(referenceDate = new Date()) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(referenceDate);
    d.setDate(referenceDate.getDate() - i);
    days.push({
      dateStr: localDay(d),
      dayName: d.toLocaleDateString(undefined, { weekday: 'short' }),
      dayNumber: d.getDate(),
      isToday: localDay(d) === localDay(referenceDate),
    });
  }
  return days;
}

export function HabitsPage() {
  const queryClient = useQueryClient();
  const [habitsDisplaySettings, setHabitsDisplaySettings] = useState<HabitsDisplaySettings>(DEFAULT_HABITS_DISPLAY_SETTINGS);
  const userPreferences = useQuery({
    queryKey: ['user-preferences'],
    queryFn: () => api.getPreferences(),
  });
  const updateHabitPref = useMutation({
    mutationFn: (patch: Partial<HabitPreferences>) => api.updateHabitPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });
  const [editor, setEditor] = useState(false);
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ item: HabitOccurrence; action: 'skip' | 'fail' } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);

  const weekDays = useMemo(() => getWeekDays(new Date()), []);
  const fromDate = weekDays[0].dateStr;
  const toDate = weekDays[weekDays.length - 1].dateStr;
  const todayStr = localDay(new Date());

  // Fetch one extra day on each side of the visible week. The API treats a
  // date-only `to` as UTC midnight of that day, so an occurrence created later
  // in the day (e.g. today's check-in) would otherwise fall outside the range
  // and its circle would render as non-clickable "Not scheduled".
  const occurrenceQueryFrom = shiftDay(fromDate, -1);
  const occurrenceQueryTo = shiftDay(toDate, 1);

  const habits = useQuery({ queryKey: ['habits'], queryFn: () => api.habits() });
  const timeBlocks = useQuery({ queryKey: ['habit-time-blocks'], queryFn: () => api.habitTimeBlocks() });
  const taskTags = useQuery({ queryKey: ['task-tags'], queryFn: () => api.taskTags() });
  const occurrences = useQuery({
    queryKey: ['habit-occurrences', occurrenceQueryFrom, occurrenceQueryTo],
    queryFn: () => api.habitOccurrences(occurrenceQueryFrom, occurrenceQueryTo),
  });
  const growthRules = useQuery({
    queryKey: ['growth', 'rules', 'HABIT'],
    queryFn: () => api.growthRules('HABIT'),
    staleTime: 30_000,
  });
  const growthChipsByHabit = useMemo(() => {
    const next = new Map<string, GrowthRewardChipModel[]>();
    for (const rule of growthRules.data ?? []) {
      next.set(rule.sourceId, groupedGrowthRewardChips(rule));
    }
    return next;
  }, [growthRules.data]);

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['habits'] }),
      queryClient.invalidateQueries({ queryKey: ['habit-occurrences'] }),
      queryClient.invalidateQueries({ queryKey: ['habit-stats'] }),
    ]);
  };

  const occurrenceAction = useMutation({
    mutationFn: ({
      id,
      action,
      idempotencyKey,
    }: {
      id: string;
      action: 'skip' | 'fail' | 'undo';
      idempotencyKey: string;
    }) => api.habitOccurrenceAction(id, action, idempotencyKey),
  });

  const checkIn = useMutation({
    mutationFn: ({
      occurrenceId,
      value,
      idempotencyKey,
    }: {
      occurrenceId: string;
      value: number;
      idempotencyKey: string;
    }) => api.checkInHabit(occurrenceId, { value, idempotencyKey }),
  });

  // Group active habits by their assigned habit group. Anytime contains ungrouped habits.
  const groupedHabits = useMemo(() => {
    const map = new Map<string, Habit[]>();
    const activeHabits = habits.data?.filter((h) => !h.archivedAt) ?? [];
    for (const habit of activeHabits) {
      const key = habit.timeBlock?.name ?? ANYTIME_GROUP;
      map.set(key, [...(map.get(key) ?? []), habit]);
    }
    const order = [...(timeBlocks.data ?? []).map((block) => block.name), ANYTIME_GROUP];
    return order
      .filter((name) => map.has(name) && map.get(name)!.length > 0)
      .map((name) => [name, map.get(name)!] as const);
  }, [habits.data, timeBlocks.data]);

  // Occurrences index: `habitId:dateStr` -> HabitOccurrence.
  // Dates are derived in the local timezone to match `weekDays`/`day.dateStr`,
  // which prevents UTC/local off-by-one mismatches (e.g. in UTC+7) that made
  // scheduled circles render as non-clickable "Not scheduled".
  const occurrenceIndex = useMemo(() => {
    const map = new Map<string, HabitOccurrence>();
    for (const occ of occurrences.data ?? []) {
      const key = `${occ.habit.id}:${localDay(new Date(occ.occurrenceDate))}`;
      map.set(key, occ);
    }
    return map;
  }, [occurrences.data]);

  const selectedHabit = habits.data?.find((habit) => habit.id === selectedHabitId) ?? null;

  const toggleSection = (name: string) => {
    setCollapsedSections((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const toggleAllSections = () => {
    const allCollapsed = groupedHabits.length > 0 && groupedHabits.every(([name]) => collapsedSections[name]);
    setCollapsedSections(Object.fromEntries(groupedHabits.map(([name]) => [name, !allCollapsed])));
  };

  return (
    <div className="min-h-full space-y-6">
      {/* Header Bar */}
      <PageHeader kicker="Routines & Tracking" title="Habits">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={toggleAllSections}
          title="Collapse or expand habit groups"
          aria-label="Collapse or expand habit groups"
        >
          <LayoutGrid className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => setEditor(true)}
          title="Create habit"
          aria-label="Create habit"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={() => setGroupDialogOpen(true)}
          title="Manage habit groups"
          aria-label="Manage habit groups"
        >
          <MoreHorizontal className="h-4 w-4" />
        </Button>
        <FeatureSettingsButton title="Habits settings">
          <HabitsSettingsPopover
            preferences={userPreferences.data?.habits}
            displaySettings={habitsDisplaySettings}
            onChangePreferences={(patch) => updateHabitPref.mutate(patch)}
            onChangeDisplay={(patch) => setHabitsDisplaySettings((current) => ({ ...current, ...patch }))}
          />
        </FeatureSettingsButton>
      </PageHeader>

      {/* Top 7-Day Calendar Header Bar */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="grid grid-cols-12 items-center gap-2">
          {/* Empty spacer corresponding to left habit info column */}
          <div className="col-span-5 md:col-span-6" />

          {/* 7 Days Columns */}
          <div className="col-span-7 md:col-span-6 grid grid-cols-7 text-center">
            {weekDays.map((day) => (
              <div key={day.dateStr} className="flex flex-col items-center gap-1.5">
                <span className={`text-xs font-semibold ${day.isToday ? 'text-blue-500' : 'text-muted-foreground'}`}>
                  {day.dayName}
                </span>
                <span className={`text-sm font-bold ${day.isToday ? 'text-blue-500' : 'text-foreground'}`}>
                  {day.dayNumber}
                </span>
                <div
                  className={`h-4 w-4 rounded-full border border-border/80 flex items-center justify-center ${day.isToday ? 'border-blue-500 bg-blue-500/10' : ''}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Categorized Habit Sections */}
      {groupedHabits.length > 0 ? (
        <div className="space-y-6">
          {groupedHabits.map(([categoryName, habitList]) => {
            const isCollapsed = collapsedSections[categoryName];
            return (
              <section key={categoryName} className="space-y-3">
                {/* Category Header */}
                <button
                  type="button"
                  onClick={() => toggleSection(categoryName)}
                  className="flex items-center gap-2 text-sm font-bold text-foreground hover:opacity-80 transition-opacity"
                >
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                  />
                  <span>{categoryName}</span>
                  <span className="text-xs font-medium text-muted-foreground">{habitList.length}</span>
                </button>

                {!isCollapsed && (
                  <div className="space-y-2">
                    {habitList.map((habit) => (
                      <HabitRowItem
                        key={habit.id}
                        habit={habit}
                        weekDays={weekDays}
                        occurrenceIndex={occurrenceIndex}
                        growthChips={growthChipsByHabit.get(habit.id) ?? []}
                        onOpen={() => setSelectedHabitId(habit.id)}
                        onCheckIn={(occId, val) =>
                          checkIn.mutate({
                            occurrenceId: occId,
                            value: val,
                            idempotencyKey: eventKey(`manual:${occId}`),
                          })
                        }
                        onUndo={(occId) =>
                          occurrenceAction.mutate({
                            id: occId,
                            action: 'undo',
                            idempotencyKey: eventKey(`undo:${occId}`),
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/60 p-8 text-center">
          <Smile className="h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-base font-semibold text-foreground">No active habits</h2>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Create your first habit to build consistency and track daily streaks.
          </p>
          <Button size="sm" className="mt-4" onClick={() => setEditor(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Create habit
          </Button>
        </div>
      )}

      {/* Modals & Dialogs */}
      <HabitEditor
        open={editor}
        onOpenChange={setEditor}
        timeBlocks={timeBlocks.data ?? []}
        tags={taskTags.data ?? []}
      />

      <HabitGroupsDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        timeBlocks={timeBlocks.data ?? []}
        onCreated={async () => {
          await queryClient.invalidateQueries({ queryKey: ['habit-time-blocks'] });
        }}
      />

      <HabitDetail
        habit={selectedHabit}
        open={!!selectedHabit}
        onOpenChange={(open) => !open && setSelectedHabitId(null)}
        timeBlocks={timeBlocks.data ?? []}
        tags={taskTags.data ?? []}
      />

      <ConfirmDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && setConfirmAction(null)}
        title={confirmAction?.action === 'fail' ? 'Record this as missed?' : 'Use a skip?'}
        description={
          confirmAction?.action === 'fail'
            ? 'This keeps the history honest and ends the current streak.'
            : 'A skip preserves the streak only while this habit still has an allowed skip available.'
        }
        confirmLabel={confirmAction?.action === 'fail' ? 'Record missed' : 'Skip today'}
        onConfirm={() => {
          if (!confirmAction) return;
          occurrenceAction.mutate({
            id: confirmAction.item.id,
            action: confirmAction.action,
            idempotencyKey: eventKey(`${confirmAction.action}:${confirmAction.item.id}`),
          });
          setConfirmAction(null);
        }}
      />
    </div>
  );
}

function HabitGroupsDialog({
  open,
  onOpenChange,
  timeBlocks,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  timeBlocks: Array<{ id: string; name: string; startLocal: string; endLocal: string }>;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.createHabitTimeBlock({
        name: name.trim(),
        icon: 'ListChecks',
        color: 'SLATE',
        startLocal: '00:00',
        endLocal: '23:59',
      }),
    onSuccess: async () => {
      setName('');
      await onCreated();
      onOpenChange(false);
    },
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && !create.isPending) create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle>Habit groups</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2 text-sm">
          <p className="text-muted-foreground">
            Groups organize habits. Habits without a group appear under {ANYTIME_GROUP}.
          </p>

          {timeBlocks.length > 0 ? (
            <div className="space-y-2">
              {timeBlocks.map((block) => (
                <div key={block.id} className="rounded-lg border border-border/70 bg-background px-3 py-2">
                  <span className="font-medium">{block.name}</span>
                </div>
              ))}
            </div>
          ) : null}

          <form className="space-y-3 rounded-lg border border-border/70 bg-background p-3" onSubmit={submit}>
            <div>
              <label className="mb-1 block text-xs font-semibold text-muted-foreground">New group name</label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Study" />
            </div>
            {create.error instanceof Error ? <p className="text-xs text-destructive">{create.error.message}</p> : null}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={!name.trim() || create.isPending}>
                Create group
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HabitRowItem({
  habit,
  weekDays,
  occurrenceIndex,
  growthChips,
  onOpen,
  onCheckIn,
  onUndo,
}: {
  habit: Habit;
  weekDays: Array<{ dateStr: string; isToday: boolean }>;
  occurrenceIndex: Map<string, HabitOccurrence>;
  growthChips: GrowthRewardChipModel[];
  onOpen: () => void;
  onCheckIn: (occurrenceId: string, value: number) => void;
  onUndo: (occurrenceId: string) => void;
}) {
  const currentStreak = habit.stats?.currentStreak ?? 0;
  const bestStreak = habit.stats?.bestStreak ?? 0;

  return (
    <div className="group flex items-center justify-between rounded-xl border border-border/80 bg-card p-3.5 hover:border-border transition-colors">
      <div className="grid grid-cols-12 w-full items-center gap-2">
        {/* Left Side: Habit Icon, Name & Streak Info */}
        <button
          type="button"
          onClick={onOpen}
          className="col-span-5 md:col-span-6 flex items-center gap-3 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg p-0.5"
        >
          {/* Habit icon badge — emoji + chosen color */}
          <HabitIconBadge icon={habit.icon} color={habit.color} />

          <div className="min-w-0 space-y-0.5">
            <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
              {habit.name}
            </h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground font-medium">
              <span className="flex items-center gap-1 text-blue-500">
                <Zap className="h-3 w-3 fill-current" />
                {bestStreak > 0 ? `${bestStreak} Days` : '0 Day'}
              </span>
              <span className="flex items-center gap-1 text-amber-500">
                <Flame className="h-3 w-3 fill-current" />
                {currentStreak > 0 ? `${currentStreak} Day` : '0 Day'}
              </span>
              {growthChips.slice(0, 3).map((chip) => (
                <GrowthRewardChip key={chip.key} chip={chip} />
              ))}
              {growthChips.length > 3 ? <span className="itu-task-chip is-more">+{growthChips.length - 3}</span> : null}
            </div>
          </div>
        </button>

        {/* Right Side: 7-Day Completion Circles Matrix */}
        <div className="col-span-7 md:col-span-6 grid grid-cols-7 text-center items-center justify-items-center">
          {weekDays.map((day) => {
            const occKey = `${habit.id}:${day.dateStr}`;
            const occ = occurrenceIndex.get(occKey);

            const isCompleted = occ?.status === 'COMPLETED';
            const isFailed = occ?.status === 'FAILED';
            const isSkipped = occ?.status === 'SKIPPED';

            return (
              <button
                type="button"
                key={day.dateStr}
                onClick={() => {
                  if (occ) {
                    if (isCompleted) {
                      onUndo(occ.id);
                    } else {
                      onCheckIn(occ.id, habit.targetValue || 1);
                    }
                  } else {
                    const fallbackOccId = crypto.randomUUID();
                    onCheckIn(fallbackOccId, habit.targetValue || 1);
                  }
                }}
                className={`h-6 w-6 rounded-full flex items-center justify-center transition-all ${
                  isCompleted
                    ? 'bg-emerald-500 text-white shadow-sm scale-105'
                    : isFailed
                      ? 'bg-rose-500/20 text-rose-500 border border-rose-500/50'
                      : isSkipped
                        ? 'bg-muted text-muted-foreground border border-border'
                        : 'border-2 border-muted-foreground/30 hover:border-emerald-500 hover:bg-emerald-500/10'
                }`}
                title={`${habit.name} - ${day.dateStr}: ${occ ? occ.status : 'Click to mark done'}`}
              >
                {isCompleted && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                {isFailed && <X className="h-3 w-3 stroke-[3]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HabitEditor({
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

function TagSelector({
  label,
  tags,
  selectedTagIds,
  onChange,
  disabled = false,
}: {
  label?: string;
  tags: TaskTag[];
  selectedTagIds: string[];
  onChange: (tagIds: string[]) => void;
  disabled?: boolean;
}) {
  if (!tags.length) return null;
  return (
    <fieldset>
      {label ? <legend className="mb-2 text-xs font-semibold text-muted-foreground">{label}</legend> : null}
      <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
        {tags.map((tag) => {
          const selected = selectedTagIds.includes(tag.id);
          return (
            <button
              type="button"
              key={tag.id}
              disabled={disabled}
              onClick={() =>
                onChange(selected ? selectedTagIds.filter((id) => id !== tag.id) : [...selectedTagIds, tag.id])
              }
              aria-pressed={selected}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                selected
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:border-primary hover:text-foreground'
              }`}
            >
              #{tag.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 text-center">
      <div className="flex justify-center mb-1">{icon}</div>
      <p className="text-xs uppercase font-semibold text-muted-foreground">{label}</p>
      <p className="text-sm font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}
