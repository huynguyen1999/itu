import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ChevronDown,
  Flame,
  LayoutGrid,
  MoreHorizontal,
  Plus,
  Smile,
  X,
  Zap,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import type { Habit, HabitOccurrence } from '@/shared/api/types';
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
import { GrowthRewardChip, groupedGrowthRewardChips, type GrowthRewardChipModel } from '@/shared/ui/GrowthRewardChip';
import {
  HabitIconBadge,
} from './habitStyles';
import { HabitDetail } from './HabitDetail';
import { HabitEditor } from './HabitEditor';
import { ANYTIME_GROUP, localDay, shiftDay } from './habitModel';

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

export { HabitDetail };
