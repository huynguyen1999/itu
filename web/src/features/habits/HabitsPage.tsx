import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Flame,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Smile,
  X,
  Zap,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Habit, HabitCalendarResponse, HabitDayState, HabitProgressLog } from '@/shared/api/types';
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
import { GrowthRewardChip, groupedGrowthRewardChips, type GrowthRewardChipModel } from '@/shared/ui/GrowthRewardChip';
import {
  HabitIconBadge,
} from './habitStyles';
import { HabitDetail } from './HabitDetail';
import { HabitEditor } from './HabitEditor';
import { ANYTIME_GROUP, localDay, updateHabitCalendarOptimistically } from './habitModel';

function eventKey(prefix: string) {
  return `${prefix}:${Date.now()}:${crypto.randomUUID()}`;
}

function defaultHabitIncrement(habit: Habit) {
  if (habit.targetType === 'BOOLEAN') return 1;
  if (habit.targetType === 'COUNT') return 1;
  if (habit.targetType === 'DURATION') return Math.max(5, Math.ceil(habit.targetValue / 6));
  return Math.max(0.1, habit.targetValue / 4);
}

function getWeekDays(referenceDate = new Date(), weekStartDay: 'MONDAY' | 'SUNDAY' = 'MONDAY') {
  const start = new Date(referenceDate);
  start.setHours(12, 0, 0, 0);
  const offset = weekStartDay === 'SUNDAY' ? start.getDay() : (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
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
  const [quickLog, setQuickLog] = useState<{ habitId: string; localDate: string; from: string; to: string } | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);

  const [weekOffset, setWeekOffset] = useState(0);
  const [jumpDate, setJumpDate] = useState(() => localDay(new Date()));
  const weekStartDay = userPreferences.data?.habits.weekStartDay ?? 'MONDAY';
  const weekDays = useMemo(() => {
    const reference = new Date();
    reference.setDate(reference.getDate() + weekOffset * 7);
    return getWeekDays(reference, weekStartDay);
  }, [weekOffset, weekStartDay]);
  const fromDate = weekDays[0].dateStr;
  const toDate = weekDays[weekDays.length - 1].dateStr;

  const jumpToDate = (value: string) => {
    if (!value) return;
    const selectedStart = getWeekDays(new Date(`${value}T12:00:00`), weekStartDay)[0].dateStr;
    const currentStart = getWeekDays(new Date(), weekStartDay)[0].dateStr;
    const selectedTime = new Date(`${selectedStart}T12:00:00`).getTime();
    const currentTime = new Date(`${currentStart}T12:00:00`).getTime();
    setJumpDate(value);
    setWeekOffset(Math.round((selectedTime - currentTime) / (7 * 24 * 60 * 60 * 1000)));
  };
  const habits = useQuery({ queryKey: ['habits'], queryFn: () => api.habits() });
  const timeBlocks = useQuery({ queryKey: ['habit-time-blocks'], queryFn: () => api.habitTimeBlocks() });
  const taskTags = useQuery({ queryKey: ['task-tags'], queryFn: () => api.taskTags() });
  const calendar = useQuery({
    queryKey: ['habit-calendar', fromDate, toDate],
    queryFn: () => api.habitCalendar(fromDate, toDate),
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
      queryClient.invalidateQueries({ queryKey: ['habit-calendar'] }),
      queryClient.invalidateQueries({ queryKey: ['habit-stats'] }),
    ]);
  };

  const progressHabit = useMutation({
    mutationFn: ({ habitId, localDate, value }: { habitId: string; localDate: string; value: number }) =>
      api.progressHabit(habitId, { localDate, value, idempotencyKey: eventKey(`progress:${habitId}:${localDate}`) }),
    onMutate: ({ habitId, localDate, value }) => {
      const habit = habits.data?.find((item) => item.id === habitId);
      const previous = queryClient.getQueryData<HabitCalendarResponse>(['habit-calendar', fromDate, toDate]);
      if (habit) queryClient.setQueryData(['habit-calendar', fromDate, toDate], updateHabitCalendarOptimistically(previous, habit, localDate, value));
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(['habit-calendar', fromDate, toDate], context?.previous),
    onSettled: refresh,
  });
  const checkInExisting = useMutation({
    mutationFn: ({ occurrenceId, habitId, localDate, value }: { occurrenceId: string; habitId: string; localDate: string; value: number }) =>
      api.checkInHabit(occurrenceId, { value, idempotencyKey: eventKey(`progress:${occurrenceId}`) }),
    onMutate: ({ habitId, localDate, value }) => {
      const habit = habits.data?.find((item) => item.id === habitId);
      const previous = queryClient.getQueryData<HabitCalendarResponse>(['habit-calendar', fromDate, toDate]);
      if (habit) queryClient.setQueryData(['habit-calendar', fromDate, toDate], updateHabitCalendarOptimistically(previous, habit, localDate, value));
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(['habit-calendar', fromDate, toDate], context?.previous),
    onSettled: refresh,
  });
  const undoExisting = useMutation({
    mutationFn: ({ occurrenceId, habitId, localDate }: { occurrenceId: string; habitId: string; localDate: string }) =>
      api.habitOccurrenceAction(occurrenceId, 'undo', eventKey(`undo:${occurrenceId}`)),
    onMutate: ({ habitId, localDate }) => {
      const habit = habits.data?.find((item) => item.id === habitId);
      const previous = queryClient.getQueryData<HabitCalendarResponse>(['habit-calendar', fromDate, toDate]);
      if (habit) queryClient.setQueryData(['habit-calendar', fromDate, toDate], updateHabitCalendarOptimistically(previous, habit, localDate, 0, 'UNDO'));
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(['habit-calendar', fromDate, toDate], context?.previous),
    onSettled: refresh,
  });
  const habitDateAction = useMutation({
    mutationFn: ({ habitId, localDate }: { habitId: string; localDate: string }) =>
      api.habitDateAction(habitId, { localDate, action: 'UNDO', idempotencyKey: eventKey(`undo:${habitId}:${localDate}`) }),
    onMutate: ({ habitId, localDate }) => {
      const habit = habits.data?.find((item) => item.id === habitId);
      const previous = queryClient.getQueryData<HabitCalendarResponse>(['habit-calendar', fromDate, toDate]);
      if (habit) queryClient.setQueryData(['habit-calendar', fromDate, toDate], updateHabitCalendarOptimistically(previous, habit, localDate, 0, 'UNDO'));
      return { previous };
    },
    onError: (_error, _variables, context) => queryClient.setQueryData(['habit-calendar', fromDate, toDate], context?.previous),
    onSettled: refresh,
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

  const calendarIndex = useMemo(() => {
    const map = new Map<string, HabitDayState>();
    for (const day of calendar.data?.days ?? []) {
      map.set(`${day.habitId}:${day.localDate}`, day);
    }
    return map;
  }, [calendar.data?.days]);

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
      <PageHeader
        kicker="Routines & Tracking"
        title="Habits"
        stickyControls={
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="grid grid-cols-12 items-center gap-2">
              <div className="col-span-5 md:col-span-6" />
              <div className="col-span-7 grid grid-cols-7 text-center md:col-span-6">
                {weekDays.map((day) => (
                  <div key={day.dateStr} className="flex flex-col items-center gap-1.5">
                    <span className={`text-xs font-semibold ${day.isToday ? 'text-blue-500' : 'text-muted-foreground'}`}>
                      {day.dayName}
                    </span>
                    <span className={`text-sm font-bold ${day.isToday ? 'text-blue-500' : 'text-foreground'}`}>
                      {day.dayNumber}
                    </span>
                    <div
                      className={`flex h-4 w-4 items-center justify-center rounded-full border border-border/80 ${day.isToday ? 'border-blue-500 bg-blue-500/10' : ''}`}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      >
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setWeekOffset((value) => value - 1)}>
          <ChevronLeft className="h-4 w-4" />
          Previous
        </Button>
        <span className="hidden items-center gap-1.5 px-1 text-xs font-semibold text-muted-foreground sm:flex">
          <CalendarDays className="h-3.5 w-3.5" />
          {fromDate} – {toDate}
        </span>
        <label className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted" title="Jump to date">
          <CalendarDays className="h-4 w-4" />
          <input
            type="date"
            value={jumpDate}
            onChange={(event) => jumpToDate(event.target.value)}
            className="sr-only"
            aria-label="Jump to date"
          />
        </label>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setWeekOffset(0)}>
          Today
        </Button>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setWeekOffset((value) => value + 1)}>
          Next
          <ChevronRight className="h-4 w-4" />
        </Button>
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
                        calendarIndex={calendarIndex}
                        growthChips={growthChipsByHabit.get(habit.id) ?? []}
                        onOpen={() => setSelectedHabitId(habit.id)}
                        onQuickLog={(habitId, localDate, from, to) => setQuickLog({ habitId, localDate, from, to })}
                        onCheckIn={(habitId, localDate, value) => {
                          const state = calendarIndex.get(`${habitId}:${localDate}`);
                          if (state?.occurrenceId) checkInExisting.mutate({ occurrenceId: state.occurrenceId, habitId, localDate, value });
                          else progressHabit.mutate({ habitId, localDate, value });
                        }}
                        onUndo={(habitId, localDate) => {
                          const occurrenceId = calendarIndex.get(`${habitId}:${localDate}`)?.occurrenceId;
                          if (occurrenceId) undoExisting.mutate({ occurrenceId, habitId, localDate });
                          else habitDateAction.mutate({ habitId, localDate });
                        }}
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

      {quickLog && habits.data?.find((habit) => habit.id === quickLog.habitId) ? (
        <HabitQuickLogDialog
          habit={habits.data.find((habit) => habit.id === quickLog.habitId)!}
          localDate={quickLog.localDate}
          fromDate={quickLog.from}
          toDate={quickLog.to}
          open
          onOpenChange={(open) => !open && setQuickLog(null)}
        />
      ) : null}

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
  calendarIndex,
  growthChips,
  onOpen,
  onQuickLog,
  onCheckIn,
  onUndo,
}: {
  habit: Habit;
  weekDays: Array<{ dateStr: string; isToday: boolean }>;
  calendarIndex: Map<string, HabitDayState>;
  growthChips: GrowthRewardChipModel[];
  onOpen: () => void;
  onQuickLog: (habitId: string, localDate: string, from: string, to: string) => void;
  onCheckIn: (habitId: string, localDate: string, value: number) => void;
  onUndo: (habitId: string, localDate: string) => void;
}) {
  const currentStreak = habit.stats?.currentStreak ?? 0;
  const bestStreak = habit.stats?.bestStreak ?? 0;
  const periodState = habit.scheduleType === 'TIMES_PER_PERIOD'
    ? [...calendarIndex.values()].find((state) =>
        state.habitId === habit.id && state.periodStart && state.periodEnd &&
        weekDays.some((day) => day.dateStr >= state.periodStart! && day.dateStr <= state.periodEnd!),
      )
    : null;

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
                {bestStreak > 0 ? `${bestStreak} ${habit.scheduleType === 'TIMES_PER_PERIOD' ? 'Periods' : 'Days'}` : `0 ${habit.scheduleType === 'TIMES_PER_PERIOD' ? 'Period' : 'Day'}`}
              </span>
              <span className="flex items-center gap-1 text-amber-500">
                <Flame className="h-3 w-3 fill-current" />
                {currentStreak > 0 ? `${currentStreak} ${habit.scheduleType === 'TIMES_PER_PERIOD' ? 'Periods' : 'Day'}` : `0 ${habit.scheduleType === 'TIMES_PER_PERIOD' ? 'Period' : 'Day'}`}
              </span>
              {habit.targetType !== 'BOOLEAN' && habit.scheduleType !== 'TIMES_PER_PERIOD' ? (
                <span>{habit.stats?.averageValue ? `${habit.stats.averageValue} ${habit.unit ?? ''}` : `${habit.targetValue} ${habit.unit ?? ''}`}</span>
              ) : null}
              {growthChips.slice(0, 3).map((chip) => (
                <GrowthRewardChip key={chip.key} chip={chip} />
              ))}
              {growthChips.length > 3 ? <span className="itu-task-chip is-more">+{growthChips.length - 3}</span> : null}
            </div>
          </div>
        </button>

        {habit.scheduleType === 'TIMES_PER_PERIOD' ? (
          <button
            type="button"
            className="col-span-7 flex items-center justify-end gap-3 rounded-lg p-1 text-left hover:bg-muted/40 md:col-span-6"
            disabled={!periodState}
            onClick={() => {
              if (!periodState) return;
              const periodDate = weekDays.find((day) => periodState.periodStart && periodState.periodEnd && day.dateStr >= periodState.periodStart && day.dateStr <= periodState.periodEnd)?.dateStr ?? periodState.localDate;
              onQuickLog(habit.id, periodDate, periodState.periodStart ?? periodDate, periodState.periodEnd ?? periodDate);
            }}
            aria-label={`${habit.name}, ${periodState?.value ?? 0} of ${habit.timesPerPeriod ?? 0} this ${String(habit.period ?? 'WEEK').toLowerCase()}`}
          >
            <div className="flex items-center gap-1" aria-label={`${periodState?.value ?? 0} of ${habit.timesPerPeriod ?? 0} this period`}>
              {Array.from({ length: Math.min(habit.timesPerPeriod ?? 0, 10) }).map((_, index) => (
                <span key={index} className={`h-2.5 w-2.5 rounded-full ${index < Math.floor(periodState?.value ?? 0) ? 'bg-emerald-500' : 'border border-muted-foreground/40'}`} />
              ))}
            </div>
            <span className="text-xs font-semibold text-muted-foreground">{periodState?.value ?? 0} / {habit.timesPerPeriod ?? 0}</span>
          </button>
        ) : (
          <div className="col-span-7 grid grid-cols-7 items-center justify-items-center text-center md:col-span-6">
            {weekDays.map((day) => {
              const state = calendarIndex.get(`${habit.id}:${day.dateStr}`);
              const isCompleted = state?.status === 'COMPLETED';
              const isPartial = state?.status === 'PARTIAL';
              const isFailed = state?.status === 'FAILED' || state?.status === 'MISSED';
              const isSkipped = state?.status === 'SKIPPED';
              const disabled = !state?.scheduled || state.status === 'REST' || state.status === 'NOT_SCHEDULED';
              return (
                <button
                  type="button"
                  key={day.dateStr}
                  disabled={disabled}
                  onClick={() => {
                    if (habit.targetType === 'BOOLEAN') {
                      if (isCompleted) onUndo(habit.id, day.dateStr);
                      else onCheckIn(habit.id, day.dateStr, 1);
                    } else {
                      onQuickLog(habit.id, day.dateStr, day.dateStr, day.dateStr);
                    }
                  }}
                  className={`h-6 w-6 rounded-full flex items-center justify-center transition-all ${
                    isCompleted
                      ? 'bg-emerald-500 text-white shadow-sm scale-105'
                      : isPartial
                        ? 'bg-amber-400/70 text-white border border-amber-500'
                        : isFailed
                          ? 'bg-rose-500/20 text-rose-500 border border-rose-500/50'
                          : isSkipped
                            ? 'bg-muted text-muted-foreground border border-border'
                            : disabled
                              ? 'border border-transparent opacity-30'
                              : 'border-2 border-muted-foreground/30 hover:border-emerald-500 hover:bg-emerald-500/10'
                  }`}
                  aria-label={`${habit.name}, ${state?.value ?? 0} of ${state?.targetValue ?? habit.targetValue} ${habit.unit ?? ''}, ${day.dateStr}`}
                  title={`${habit.name} - ${day.dateStr}: ${state?.status ?? 'Not scheduled'}`}
                >
                  {isCompleted && <Check className="h-3.5 w-3.5 stroke-[3]" />}
                  {isFailed && <X className="h-3 w-3 stroke-[3]" />}
                  {isPartial && <span className="h-2 w-2 rounded-full bg-white" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function HabitQuickLogDialog({
  habit,
  localDate,
  fromDate,
  toDate,
  open,
  onOpenChange,
}: {
  habit: Habit;
  localDate: string;
  fromDate: string;
  toDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(() => String(defaultHabitIncrement(habit)));
  const logs = useQuery({
    queryKey: ['habit-progress', habit.id, fromDate, toDate],
    queryFn: () => api.habitProgress(habit.id, fromDate, toDate),
    enabled: open,
  });
  const save = useMutation({
    mutationFn: () => {
      const value = Number(amount);
      if (!Number.isFinite(value) || value <= 0) throw new Error('Enter a value greater than zero');
      return api.progressHabit(habit.id, { localDate, value, idempotencyKey: eventKey(`progress:${habit.id}:${localDate}`) });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['habits'] }),
        queryClient.invalidateQueries({ queryKey: ['habit-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['habit-progress', habit.id] }),
      ]);
      onOpenChange(false);
    },
  });
  const remove = useMutation({
    mutationFn: (progressId: string) => api.deleteHabitProgress(progressId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['habits'] }),
        queryClient.invalidateQueries({ queryKey: ['habit-calendar'] }),
        queryClient.invalidateQueries({ queryKey: ['habit-progress', habit.id] }),
      ]);
    },
  });
  const total = (logs.data ?? []).reduce((sum, log) => sum + log.value, 0);
  const recentLogs = (logs.data ?? []).filter((log) => log.value > 0).slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm border-border bg-card">
        <DialogHeader>
          <DialogTitle>Log {habit.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-semibold">{total} / {habit.scheduleType === 'TIMES_PER_PERIOD' ? habit.timesPerPeriod : habit.targetValue} {habit.unit ?? ''}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{fromDate === toDate ? localDate : `${fromDate} – ${toDate}`}</p>
          </div>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!save.isPending) save.mutate();
            }}
          >
            <Input
              autoFocus
              type="number"
              min="0.1"
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              aria-label={`Amount in ${habit.unit ?? 'units'}`}
            />
            <Button type="submit" disabled={save.isPending}>Log</Button>
          </form>
          {save.error instanceof Error ? <p className="text-xs text-destructive">{save.error.message}</p> : null}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">Recent logs</p>
            {recentLogs.length > 0 ? recentLogs.map((log: HabitProgressLog) => (
              <div key={log.id} className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2 text-xs">
                <span>{log.value} {habit.unit ?? ''} · {new Date(log.recordedAt).toLocaleString()}</span>
                <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-destructive" onClick={() => remove.mutate(log.id)} disabled={remove.isPending}>Delete</Button>
              </div>
            )) : <p className="text-xs text-muted-foreground">No logs for this period.</p>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { HabitDetail };
