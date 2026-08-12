import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  GripVertical,
  MapPin,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react';
import { api, type CalendarTimelineItem, type ProductivityTask } from '@/shared/api/client';
import { getStoredTaskPreferences } from '@/shared/api/preferencesApi';
import {
  moveDueTask,
  moveDurationTask,
  resizeTaskEnd,
  resizeTaskStart,
  scheduleUnscheduledTask,
  type TaskScheduleEdit,
  type TaskScheduleShape,
} from '@/shared/tasks/taskSchedule';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { TaskDetailModal } from '../planning/components/TaskDetailModal';
import {
  assignOverlapLane,
  computeDynamicItemTops,
  formatRangeLabel,
  formatSingleTime,
  isArrangeableTask,
  isSameLocalDay,
  itemSpansDay,
  localDayIndex,
  localMinutesSinceMidnight,
  snapTimestamp,
  shiftAnchor,
  timelineItemColor,
  visibleRange,
  type TimelineItemKind,
  type TimelineZoom,
} from './timeline';
import { CalendarEventCard } from './CalendarEventCard';
import {
  MAX_VISIBLE_MONTH_LANES,
  chunkWeeks,
  layoutMonthWeek,
  monthGridDays,
  monthGridRange,
  resolveFirstDayOfWeek,
  semanticMonthRange,
  type WeekStart,
} from './monthGrid';

type CalendarPreferences = {
  zoom: TimelineZoom;
  visibleKinds: TimelineItemKind[];
  showCompleted: boolean;
  collapsedGroupIds: string[];
  weekStart: WeekStart;
};

const DEFAULT_CALENDAR_PREFERENCES: CalendarPreferences = {
  zoom: 'WEEK',
  visibleKinds: ['TASK_DURATION', 'TASK_DUE', 'FOCUS_SESSION', 'EXTERNAL_EVENT'],
  showCompleted: true,
  collapsedGroupIds: [],
  weekStart: 'SYSTEM',
};

const timelineKey = (from: string, to: string) => ['calendar', 'timeline', from, to] as const;
const LABEL_WIDTH = 0;
const DAY_HOUR_WIDTH = 88;
const DATE_WIDTH = 168;
const MONTH_DATE_WIDTH = 112;
const ALL_DAY_HEIGHT = 34;
const ALL_DAY_ITEM_HEIGHT = 46;

export type CalendarGroup = {
  id: string;
  label: string;
  subtitle: string;
  color: string;
  items: CalendarTimelineItem[];
};

export function CalendarPage() {
  const queryClient = useQueryClient();
  const preferences = useQuery({ queryKey: ['user-preferences'], queryFn: () => api.getPreferences(), retry: 1 });
  const prefValue = (preferences.data as (typeof preferences.data & { calendar?: Partial<CalendarPreferences> }) | undefined)
    ?.calendar;
  const currentPreferences = { ...DEFAULT_CALENDAR_PREFERENCES, ...prefValue };
  const [zoom, setZoom] = useState<TimelineZoom>(currentPreferences.zoom);
  const [anchor, setAnchor] = useState(() => new Date());
  const [visibleKinds, setVisibleKinds] = useState<TimelineItemKind[]>(currentPreferences.visibleKinds);
  const [showCompleted, setShowCompleted] = useState(currentPreferences.showCompleted);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<string[]>(currentPreferences.collapsedGroupIds);
  const [showArrange, setShowArrange] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [weekStart, setWeekStart] = useState<WeekStart>(currentPreferences.weekStart);
  const [morePopover, setMorePopover] = useState<{ date: Date; items: CalendarTimelineItem[]; x: number; y: number } | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [fallbackTask, setFallbackTask] = useState<ProductivityTask | null>(null);
  const [selectedReadonly, setSelectedReadonly] = useState<CalendarTimelineItem | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!prefValue) return;
    if (prefValue.zoom) setZoom(prefValue.zoom);
    if (prefValue.visibleKinds) setVisibleKinds(prefValue.visibleKinds);
    if (prefValue.showCompleted !== undefined) setShowCompleted(prefValue.showCompleted);
    if (prefValue.collapsedGroupIds) setCollapsedGroupIds(prefValue.collapsedGroupIds);
    if (prefValue.weekStart) setWeekStart(prefValue.weekStart);
  }, [prefValue?.zoom, prefValue?.visibleKinds, prefValue?.showCompleted, prefValue?.collapsedGroupIds, prefValue?.weekStart]);
  const firstDayOfWeek = resolveFirstDayOfWeek(weekStart);
  const range = useMemo(() => {
    if (zoom === 'MONTH') return monthGridRange(anchor, firstDayOfWeek);
    return visibleRange(anchor, zoom, firstDayOfWeek);
  }, [anchor, zoom, firstDayOfWeek]);
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  const timeline = useQuery({ queryKey: timelineKey(from, to), queryFn: () => api.calendarTimeline(from, to), retry: 1 });
  const tasks = useQuery({ queryKey: ['calendar', 'tasks'], queryFn: () => api.tasks({ limit: 100 }), retry: 1 });
  const sources = useQuery({ queryKey: ['calendar', 'sources'], queryFn: () => api.calendarSources(), retry: 1 });
  const updatePreferences = useMutation({
    mutationFn: (patch: Partial<CalendarPreferences>) => api.updateCalendarPreferences(patch),
  });
  const updateSource = useMutation({
    mutationFn: ({ id, visible }: { id: string; visible: boolean }) => api.updateCalendarSource(id, { visible }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['calendar', 'sources'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar', 'timeline'] });
    },
  });
  const addIcs = useMutation({
    mutationFn: ({ url, name }: { url: string; name?: string }) => api.createIcsCalendar({ url, name }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['calendar', 'sources'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar', 'timeline'] });
    },
  });
  const refreshSource = useMutation({
    mutationFn: (id: string) => api.refreshCalendarSource(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['calendar', 'sources'] }),
  });
  const removeSource = useMutation({
    mutationFn: (id: string) => api.deleteCalendarSource(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['calendar', 'sources'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar', 'timeline'] });
    },
  });
  const updateTask = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => api.updateTask(id, patch),
  });

  const items = (timeline.data?.items ?? []).filter(
    (item) => visibleKinds.includes(item.kind) && (showCompleted || item.status !== 'COMPLETED'),
  );
  const groups = groupCalendarItems(items);
  const days = useMemo(() => {
    if (zoom === 'MONTH') return monthGridDays(anchor, firstDayOfWeek);
    const result: Date[] = [];
    for (let date = new Date(range.from); date < range.to; date.setDate(date.getDate() + 1)) result.push(new Date(date));
    return result;
  }, [range, zoom, anchor, firstDayOfWeek]);
  const axisWidth = zoom === 'DAY' ? 24 * DAY_HOUR_WIDTH : days.length * (zoom === 'MONTH' ? MONTH_DATE_WIDTH : DATE_WIDTH);
  const unscheduled = (tasks.data?.data ?? []).filter(isArrangeableTask);
  const taskById = new Map((tasks.data?.data ?? []).map((task) => [task.id, task]));

  function savePreference(patch: Partial<CalendarPreferences>) {
    updatePreferences.mutate(patch);
  }

  const selectedTask = selectedTaskId ? (taskById.get(selectedTaskId) ?? fallbackTask) : null;

  function selectItem(item: CalendarTimelineItem) {
    if (item.readOnly) setSelectedReadonly(item);
    else if (item.taskId) {
      setSelectedTaskId(item.taskId);
      if (!taskById.has(item.taskId)) void api.getTask(item.taskId).then(setFallbackTask);
    }
  }

  function moveAnchor(direction: -1 | 1) {
    setAnchor(shiftAnchor(anchor, zoom, direction));
  }

  function dropTask(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/iTu-calendar-task');
    if (!raw || !trackRef.current) return;
    const payload = JSON.parse(raw) as { id: string };
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-calendar-day]');
    const date = target?.dataset.calendarDay ? new Date(target.dataset.calendarDay) : new Date(range.from);
    if (zoom === 'DAY') {
      const rect = trackRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left + trackRef.current.scrollLeft - LABEL_WIDTH;
      date.setHours(Math.floor(Math.max(0, x) / DAY_HOUR_WIDTH), 0, 0, 0);
    } else {
      date.setHours(9, 0, 0, 0);
    }
    const start = snapTimestamp(date, zoom === 'DAY' ? 'DAY' : 'WEEK');
    const task = taskById.get(payload.id);
    const taskShape: TaskScheduleShape = task ?? { dueAt: null };
    const schedule: TaskScheduleEdit = taskShape.scheduledStartAt && taskShape.scheduledEndAt
      ? moveDurationTask(taskShape, start)
      : taskShape.dueAt
        ? moveDueTask(taskShape, start)
        : scheduleUnscheduledTask(taskShape, start, getStoredTaskPreferences().defaultDueTime);
    updateTask.mutate({
      id: payload.id,
      patch: { ...schedule, ...(task?.version !== undefined ? { version: task.version } : {}) },
    });
  }

  function dragItem(item: CalendarTimelineItem, event: React.DragEvent<HTMLElement>) {
    if (!item.taskId) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(
      'application/iTu-calendar-task',
      JSON.stringify({ id: item.taskId }),
    );
  }

  function resizeTask(item: CalendarTimelineItem, edge: 'start' | 'end', event: React.PointerEvent) {
    if (item.readOnly || item.kind !== 'TASK_DURATION' || !item.taskId || !item.endAt || !trackRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const originStart = new Date(item.startAt).getTime();
    const originEnd = new Date(item.endAt).getTime();
    const toTimestamp = (clientX: number) => {
      const rect = trackRef.current!.getBoundingClientRect();
      const x = Math.max(0, clientX - rect.left + trackRef.current!.scrollLeft - LABEL_WIDTH);
      if (zoom === 'DAY') {
        const date = new Date(range.from);
        date.setHours(Math.floor(x / DAY_HOUR_WIDTH), Math.round(((x % DAY_HOUR_WIDTH) / DAY_HOUR_WIDTH) * 60), 0, 0);
        return snapTimestamp(date, 'DAY');
      }
      const width = zoom === 'MONTH' ? MONTH_DATE_WIDTH : DATE_WIDTH;
      const date = new Date(range.from);
      date.setDate(date.getDate() + Math.floor(x / width));
      date.setHours(9, 0, 0, 0);
      return snapTimestamp(date, 'WEEK');
    };
    const onMove = (move: PointerEvent) => {
      const next = toTimestamp(move.clientX).getTime();
      const start = edge === 'start' ? next : originStart;
      const end = edge === 'end' ? next : originEnd;
      if (end <= start) return;
      queryClient.setQueryData(timelineKey(from, to), (current: { from: string; to: string; items: CalendarTimelineItem[] } | undefined) => current && ({ ...current, items: current.items.map((candidate) => candidate.id === item.id ? { ...candidate, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() } : candidate) }));
    };
    const onUp = (up: PointerEvent) => {
      const next = toTimestamp(up.clientX).getTime();
      const start = edge === 'start' ? next : originStart;
      const end = edge === 'end' ? next : originEnd;
      if (end > start) {
        const shape = { scheduledStartAt: item.startAt, scheduledEndAt: item.endAt ?? null };
        const schedule = edge === 'start'
          ? resizeTaskStart(shape, new Date(start))
          : resizeTaskEnd(shape, new Date(end));
        const task = taskById.get(item.taskId!);
        updateTask.mutate({ id: item.taskId!, patch: { ...schedule, ...(task?.version !== undefined ? { version: task.version } : {}) } });
      }
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function resizeTaskStep(item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) {
    if (item.readOnly || item.kind !== 'TASK_DURATION' || !item.taskId || !item.endAt) return;
    const step = (zoom === 'DAY' ? 15 : 24 * 60) * 60_000;
    const start = new Date(item.startAt).getTime() + (edge === 'start' ? direction * step : 0);
    const end = new Date(item.endAt).getTime() + (edge === 'end' ? direction * step : 0);
    if (end <= start) return;
    const shape = { scheduledStartAt: item.startAt, scheduledEndAt: item.endAt };
    const schedule = edge === 'start'
      ? resizeTaskStart(shape, new Date(start))
      : resizeTaskEnd(shape, new Date(end));
    const task = taskById.get(item.taskId);
    updateTask.mutate({ id: item.taskId, patch: { ...schedule, ...(task?.version !== undefined ? { version: task.version } : {}) } });
  }

  return (
    <section className="min-h-full space-y-5 pb-12">
      <PageHeader kicker="Productivity" title="Calendar" description="A calm, source-first view of what has your attention.">
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button variant="outline" size="sm" className="bg-transparent hover:bg-white/10 text-white border-white/20" onClick={() => setShowArrange((open) => !open)} aria-expanded={showArrange} aria-controls="calendar-arrange-tasks">
            <Plus className="h-3.5 w-3.5" /> Arrange tasks
          </Button>

          <div className="flex items-center gap-1.5">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" className="bg-transparent hover:bg-white/10 text-white border-white/20" aria-label="Previous range" onClick={() => moveAnchor(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" className="bg-transparent hover:bg-white/10 text-white border-white/20" onClick={() => setAnchor(new Date())}>Today</Button>
              <Button variant="outline" size="icon" className="bg-transparent hover:bg-white/10 text-white border-white/20" aria-label="Next range" onClick={() => moveAnchor(1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>

            <div className="flex items-center rounded-[var(--itu-radius-s)] border border-white/20 p-0.5 bg-black/20">
              {(['DAY', 'WEEK', 'MONTH'] as const).map((value) => (
                <Button key={value} variant={zoom === value ? 'default' : 'ghost'} size="sm" className={`h-7 px-2.5 text-xs ${zoom === value ? '' : 'text-white/80 hover:text-white hover:bg-white/10'}`} onClick={() => { setZoom(value); savePreference({ zoom: value }); }}>
                  {value[0] + value.slice(1).toLowerCase()}
                </Button>
              ))}
            </div>

            <Button variant="outline" size="icon" className="bg-transparent hover:bg-white/10 text-white border-white/20" aria-label="Calendar settings" onClick={() => setShowSettings((open) => !open)}><Settings2 className="h-4 w-4" /></Button>
          </div>
        </div>
      </PageHeader>

      {showSettings ? <CalendarSettings
        visibleKinds={visibleKinds}
        showCompleted={showCompleted}
        onToggleKind={(kind) => {
          const next = visibleKinds.includes(kind) ? visibleKinds.filter((value) => value !== kind) : [...visibleKinds, kind];
          setVisibleKinds(next); savePreference({ visibleKinds: next });
        }}
        onToggleCompleted={(value) => { setShowCompleted(value); savePreference({ showCompleted: value }); }}
        weekStart={weekStart}
        onWeekStart={(value) => { setWeekStart(value); savePreference({ weekStart: value }); }}
        sources={sources.data ?? []}
        sourcesLoading={sources.isLoading}
        sourcesError={sources.isError}
        onRetry={() => void sources.refetch()}
        onConnect={(url, name) => addIcs.mutate({ url, name })}
        onRefresh={(id) => refreshSource.mutate(id)}
        onRemove={(id) => removeSource.mutate(id)}
        onToggleSource={(id, visible) => updateSource.mutate({ id, visible })}
      /> : null}

      <div className="overflow-hidden rounded-[var(--itu-radius-m)] border border-border/70 bg-card shadow-[var(--itu-shadow-card)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[image:var(--itu-gradient-deep)] px-5 py-4 text-[#f4faf7]">
          <div><p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--itu-teal-400)]">Schedule overview · source timeline</p><h2 className="mt-1 text-lg font-semibold">{formatRangeLabel(zoom === 'MONTH' ? semanticMonthRange(anchor) : range, zoom)}</h2></div>
          <div className="font-mono text-[11px] text-white/70">{items.length} items · {groups.length} sources</div>
        </div>
        <div ref={trackRef} className="overflow-auto bg-[var(--itu-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onDragOver={(event) => event.preventDefault()} onDrop={dropTask} tabIndex={0} aria-label="Calendar source timeline">
          {zoom === 'MONTH' ? (
            <div className="min-w-[760px]">
              <MonthCalendarGrid
                anchor={anchor}
                days={days}
                groups={groups}
                firstDayOfWeek={firstDayOfWeek}
                onSelect={selectItem}
                onDragStart={dragItem}
                onResize={resizeTask}
                onResizeStep={resizeTaskStep}
                onMore={(date, dayItems, event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setMorePopover({ date, items: dayItems, x: rect.left + rect.width / 2, y: rect.bottom + 8 });
                }}
              />
            </div>
          ) : (
            <div className="min-w-max" style={{ width: LABEL_WIDTH + axisWidth }}>
              <CalendarAxis days={days} zoom={zoom} width={axisWidth} />
              {timeline.isLoading ? <CalendarStatus title="Loading your calendar…" description="Fetching tasks, Due Dates, Focus Sessions, and subscriptions." /> : null}
              {timeline.isError ? <CalendarStatus title="Calendar could not be loaded" description="The timeline request failed." action={<Button variant="outline" size="sm" onClick={() => void timeline.refetch()}>Retry</Button>} /> : null}
              {!timeline.isLoading && !timeline.isError && items.length === 0 ? <CalendarStatus title="Nothing scheduled for this range" description="Arrange an unfinished task or connect a calendar source to begin." /> : null}
              {!timeline.isLoading && !timeline.isError && items.length > 0 ? (
                zoom === 'DAY'
                  ? <DayRow group={{ id: 'all', label: 'All', subtitle: '', color: '', items }} day={days[0] ?? new Date()} onSelect={selectItem} onDragStart={dragItem} onResize={resizeTask} onResizeStep={resizeTaskStep} />
                  : <DateRow group={{ id: 'all', label: 'All', subtitle: '', color: '', items }} days={days} zoom={zoom} onSelect={selectItem} onDragStart={dragItem} onResize={resizeTask} onResizeStep={resizeTaskStep} />
              ) : null}
            </div>
          )}
          {morePopover ? (
            <DayItemsPopover
              date={morePopover.date}
              items={morePopover.items}
              x={morePopover.x}
              y={morePopover.y}
              onSelect={selectItem}
              onClose={() => setMorePopover(null)}
            />
          ) : null}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3 text-xs text-muted-foreground">
          <span>Tasks can move and resize. Focus Sessions and subscriptions are read-only.</span>
          {groups.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" role="list" aria-label="Source legend">
              {groups.map((group) => (
                <span key={group.id} role="listitem" className="flex items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} aria-hidden="true" />
                  <span className="font-mono text-[10px] tracking-[0.06em] text-muted-foreground">{group.label}</span>
                </span>
              ))}
            </div>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em]">{zoom === 'DAY' ? 'Hourly axis' : 'Date axis'}</span>
          )}
        </div>
      </div>

      {showArrange ? <ArrangeTasks tasks={unscheduled} isLoading={tasks.isLoading} isError={tasks.isError} onRetry={() => void tasks.refetch()} /> : null}
      {selectedTask ? <TaskDetailModal task={selectedTask} tasks={tasks.data?.data ?? []} isOpen onClose={() => { setSelectedTaskId(null); setFallbackTask(null); }} /> : null}
      {selectedReadonly ? <ReadonlyDetails item={selectedReadonly} onClose={() => setSelectedReadonly(null)} /> : null}
    </section>
  );
}

export function groupCalendarItems(items: CalendarTimelineItem[]): CalendarGroup[] {
  const map = new Map<string, CalendarGroup>();
  for (const item of items) {
    const isFocus = item.kind === 'FOCUS_SESSION';
    const isExternal = item.kind === 'EXTERNAL_EVENT';
    const isInboxTask = !isFocus && !isExternal && (!item.sourceId || item.sourceId === 'inbox' || item.sourceName?.toLowerCase() === 'inbox');
    const id = isFocus ? 'focus' : isExternal ? `calendar:${item.sourceId ?? 'calendar'}` : isInboxTask ? 'project:inbox' : `project:${item.sourceId}`;
    const label = isFocus ? 'Focus' : isExternal ? item.sourceName ?? 'Calendar subscription' : isInboxTask ? 'Inbox' : item.sourceName ?? 'Inbox';
    const subtitle = isFocus ? 'Focus Sessions' : isExternal ? 'Calendar subscription' : isInboxTask ? 'Inbox' : 'Project';
    const color = timelineItemColor(item.kind, item.color);
    const existing = map.get(id);
    if (existing) existing.items.push(item);
    else map.set(id, { id, label, subtitle, color, items: [item] });
  }
  const sortKey = (group: CalendarGroup): [number, string] => {
    if (group.id === 'project:inbox') return [0, ''];
    if (group.id.startsWith('project:')) return [1, group.label.toLocaleLowerCase()];
    if (group.id.startsWith('calendar:')) return [2, group.label.toLocaleLowerCase()];
    return [3, ''];
  };
  return [...map.values()].sort((a, b) => {
    const [aRank, aLabel] = sortKey(a);
    const [bRank, bLabel] = sortKey(b);
    return aRank - bRank || aLabel.localeCompare(bLabel);
  });
}

function CalendarAxis({ days, zoom, width }: { days: Date[]; zoom: TimelineZoom; width: number }) {
  const today = new Date();
  if (zoom === 'DAY') {
    return (
      <div className="sticky top-0 z-20 flex h-[76px] border-b border-border/70 bg-card/95 backdrop-blur">
        <div className="relative" style={{ width }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} className="absolute inset-y-0 border-l border-border/60 px-2 pb-3 pt-7" style={{ left: hour * DAY_HOUR_WIDTH, width: DAY_HOUR_WIDTH }}>
              <span className="font-mono text-[10px] text-muted-foreground">{formatHour(hour)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="sticky top-0 z-20 border-b border-border/70 bg-card/95 backdrop-blur">
      <div className="relative flex" style={{ width }}>
        {days.map((date, index) => {
          const isToday = isSameLocalDay(date, today);
          const cellWidth = zoom === 'MONTH' ? MONTH_DATE_WIDTH : DATE_WIDTH;
          return (
            <div
              key={date.toISOString()}
              className={`flex-none border-l border-border/60 px-3 py-3 ${isToday ? 'bg-primary/[0.06]' : ''}`}
              style={{ width: cellWidth }}
            >
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1">
                {date.toLocaleDateString(undefined, { weekday: 'short' })}
              </p>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold leading-none ${
                    isToday
                      ? 'bg-[var(--itu-teal-600)] text-white'
                      : 'text-foreground'
                  }`}
                >
                  {date.getDate()}
                </span>
                <span className="text-xs font-normal text-muted-foreground">
                  {date.toLocaleDateString(undefined, { month: 'short' })}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getItemVisualHeight(item: CalendarTimelineItem, compact?: boolean): number {
  if (item.allDay) return 26;
  return 48;
}

function DayRow({ group, day, onSelect, onDragStart, onResize, onResizeStep }: { group: CalendarGroup; day: Date; onSelect: (item: CalendarTimelineItem) => void; onDragStart: (item: CalendarTimelineItem, event: React.DragEvent<HTMLElement>) => void; onResize: (item: CalendarTimelineItem, edge: 'start' | 'end', event: React.PointerEvent) => void; onResizeStep: (item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) => void }) {
  const allDayItems = group.items.filter((item) => item.allDay);
  const timedItems = group.items.filter((item) => !item.allDay);
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const timedBounds = timedItems.map((item) => {
    const itemStart = new Date(item.startAt);
    const itemEnd = item.endAt ? new Date(item.endAt) : new Date(itemStart.getTime() + 30 * 60_000);
    const effStart = itemStart < dayStart ? dayStart : itemStart;
    const effEnd = itemEnd > dayEnd ? dayEnd : itemEnd;
    const startMinutes = (effStart.getTime() - dayStart.getTime()) / 60_000;
    const durationHours = Math.max(0.5, (effEnd.getTime() - effStart.getTime()) / 3_600_000);
    const left = (startMinutes / 60) * DAY_HOUR_WIDTH;
    const width = Math.max(64, durationHours * DAY_HOUR_WIDTH);
    const height = getItemVisualHeight(item);
    return { startAt: item.startAt, endAt: item.endAt, left, width, height };
  });
  const timedLanes = assignOverlapLane(timedBounds);
  const { tops: timedTops, maxBottom } = computeDynamicItemTops(timedBounds, timedLanes, 18, 6);

  const allDayHeight = allDayItems.length ? allDayItems.length * ALL_DAY_ITEM_HEIGHT + (allDayItems.length - 1) * 4 : ALL_DAY_HEIGHT;
  const rowHeight = Math.max(122, allDayHeight + maxBottom + 12);

  return <div className="relative bg-[var(--itu-surface-2)]" style={{ height: rowHeight }}><div className="absolute inset-x-0 top-0 flex flex-col gap-1 overflow-hidden border-b border-border/60 bg-card/70 px-3" style={{ height: allDayHeight }}>{allDayItems.map((item) => <CalendarEventCard key={item.id} item={item} variant="timeline" onSelect={onSelect} onDragStart={onDragStart} onResize={onResize} onResizeStep={onResizeStep} className="relative min-w-0 flex-1" style={{ left: 0, top: 0 }} />)}</div><div className="absolute inset-x-0 bottom-0" style={{ top: allDayHeight }}>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="absolute inset-y-0 border-l border-border/40" style={{ left: hour * DAY_HOUR_WIDTH }} />)}{timedItems.map((item, index) => {
    const itemStart = new Date(item.startAt);
    const itemEnd = item.endAt ? new Date(item.endAt) : new Date(itemStart.getTime() + 30 * 60_000);
    const effStart = itemStart < dayStart ? dayStart : itemStart;
    const effEnd = itemEnd > dayEnd ? dayEnd : itemEnd;
    const startMinutes = (effStart.getTime() - dayStart.getTime()) / 60_000;
    const durationHours = Math.max(0.5, (effEnd.getTime() - effStart.getTime()) / 3_600_000);
    return <CalendarEventCard key={item.id} item={item} variant="timeline" onSelect={onSelect} onDragStart={onDragStart} onResize={onResize} onResizeStep={onResizeStep} className="absolute" style={{ left: (startMinutes / 60) * DAY_HOUR_WIDTH, top: timedTops[index], width: Math.max(64, durationHours * DAY_HOUR_WIDTH) }} />;
  })}</div></div>;
}

function DateRow({ group, days, zoom, onSelect, onDragStart, onResize, onResizeStep }: { group: CalendarGroup; days: Date[]; zoom: TimelineZoom; onSelect: (item: CalendarTimelineItem) => void; onDragStart: (item: CalendarTimelineItem, event: React.DragEvent<HTMLElement>) => void; onResize: (item: CalendarTimelineItem, edge: 'start' | 'end', event: React.PointerEvent) => void; onResizeStep: (item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) => void }) {
  const cellWidth = zoom === 'MONTH' ? MONTH_DATE_WIDTH : DATE_WIDTH;
  const today = new Date();
  const rangeStart = new Date(days[0]);
  rangeStart.setHours(0, 0, 0, 0);

  // Build a map of day ISO string → items that appear on that day
  const itemsByDay = new Map<string, CalendarTimelineItem[]>();
  for (const day of days) {
    const key = day.toISOString();
    itemsByDay.set(key, group.items.filter((item) => itemSpansDay(item, day)).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()));
  }

  return (
    <div className="flex bg-[var(--itu-surface-2)]">
      {days.map((date) => {
        const key = date.toISOString();
        const dayItems = itemsByDay.get(key) ?? [];
        const isToday = isSameLocalDay(date, today);
        return (
          <div
            key={key}
            data-calendar-day={key}
            className={`flex-none border-l border-border/50 p-2 min-h-[140px] flex flex-col gap-2 ${
              isToday ? 'bg-primary/[0.04]' : ''
            }`}
            style={{ width: cellWidth }}
          >
            {dayItems.map((item) => (
              <CalendarEventCard
                key={item.id}
                item={item}
                variant="board"
                onSelect={onSelect}
                onDragStart={onDragStart}
                onResize={onResize}
                onResizeStep={onResizeStep}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function ArrangeTasks({ tasks, isLoading, isError, onRetry }: { tasks: ProductivityTask[]; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  return <aside id="calendar-arrange-tasks" aria-label="Unscheduled tasks" className="rounded-[var(--itu-radius-m)] border border-border/70 bg-card p-4 shadow-[var(--itu-shadow-card)]"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Arrange tasks</p><h2 className="mt-1 text-sm font-semibold text-foreground">Give unfinished work a place</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Drag-only: drop a task into a source row and date.</p></div><span className="rounded-full bg-[var(--itu-mint-100)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--itu-teal-700)]">{tasks.length}</span></div>{isLoading ? <p className="mt-4 text-xs text-muted-foreground">Loading tasks…</p> : isError ? <div className="mt-4 flex items-center justify-between rounded-[var(--itu-radius-s)] border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive"><span>Tasks could not be loaded.</span><Button variant="outline" size="sm" onClick={onRetry}>Retry</Button></div> : tasks.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{tasks.map((task) => <div key={task.id} draggable role="button" tabIndex={0} aria-label={`Drag ${task.title} to schedule it`} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/iTu-calendar-task', JSON.stringify({ id: task.id })); }} className="group flex min-h-12 cursor-grab items-center gap-2 rounded-[var(--itu-radius-s)] border border-border/70 bg-[var(--itu-surface-2)] px-3 py-2 outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"><GripVertical className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" /><span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{task.title}</span><span className="font-mono text-[10px] text-muted-foreground">{task.estimatedMinutes ?? 30}m</span></div>)}</div> : <p className="mt-4 rounded-[var(--itu-radius-s)] border border-dashed border-border/80 px-3 py-4 text-xs text-muted-foreground">You’re clear. New planned work without dates will land here.</p>}</aside>;
}

function CalendarSettings({ visibleKinds, showCompleted, onToggleKind, onToggleCompleted, weekStart, onWeekStart, sources, sourcesLoading, sourcesError, onRetry, onConnect, onRefresh, onRemove, onToggleSource }: { visibleKinds: TimelineItemKind[]; showCompleted: boolean; onToggleKind: (kind: TimelineItemKind) => void; onToggleCompleted: (value: boolean) => void; weekStart: WeekStart; onWeekStart: (value: WeekStart) => void; sources: Array<{ id: string; name: string; provider: string; color: string; visible: boolean; lastError?: string | null }>; sourcesLoading: boolean; sourcesError: boolean; onRetry: () => void; onConnect: (url: string, name?: string) => void; onRefresh: (id: string) => void; onRemove: (id: string) => void; onToggleSource: (id: string, visible: boolean) => void }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  return <div className="rounded-[var(--itu-radius-m)] border border-border/70 bg-card p-4 shadow-[var(--itu-shadow-pop)]"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Calendar settings</p><h2 className="mt-1 text-sm font-semibold text-foreground">Sources & filters</h2></div><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showCompleted} onChange={(event) => onToggleCompleted(event.target.checked)} /> Show completed</label><label className="flex items-center gap-2 text-xs text-muted-foreground"><span>Week starts</span><select aria-label="Week start" className="h-7 rounded-[var(--itu-radius-s)] border border-border/70 bg-background px-2 text-xs" value={weekStart} onChange={(event) => onWeekStart(event.target.value as WeekStart)}><option value="SYSTEM">System</option><option value="SUNDAY">Sunday</option><option value="MONDAY">Monday</option></select></label></div><div className="mt-4 flex flex-wrap gap-2">{([['TASK_DURATION', 'Tasks'], ['TASK_DUE', 'Due Dates'], ['FOCUS_SESSION', 'Focus Sessions'], ['EXTERNAL_EVENT', 'Subscriptions']] as const).map(([kind, label]) => <label key={kind} className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs"><input type="checkbox" checked={visibleKinds.includes(kind)} onChange={() => onToggleKind(kind)} /> {label}</label>)}</div><form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (url) { onConnect(url, name || undefined); setUrl(''); setName(''); } }}><input aria-label="ICS calendar URL" className="h-9 min-w-56 flex-1 rounded-[var(--itu-radius-s)] border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10" type="url" required placeholder="https://…/calendar.ics" value={url} onChange={(event) => setUrl(event.target.value)} /><input aria-label="Calendar name" className="h-9 min-w-40 flex-1 rounded-[var(--itu-radius-s)] border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10" placeholder="Calendar name" value={name} onChange={(event) => setName(event.target.value)} /><Button type="submit" size="sm">Add subscription</Button></form><div className="mt-4 grid gap-2 border-t border-border/60 pt-3"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Connected sources</p>{sourcesLoading ? <p className="text-xs text-muted-foreground">Loading calendar sources…</p> : sourcesError ? <div className="flex items-center justify-between text-xs text-destructive"><span>Calendar sources could not be loaded.</span><Button variant="outline" size="sm" onClick={onRetry}>Retry</Button></div> : sources.length ? sources.map((source) => <div key={source.id} className="flex items-center gap-2 rounded-[var(--itu-radius-s)] border border-border/60 bg-[var(--itu-surface-2)] px-2.5 py-2"><input type="checkbox" checked={source.visible} onChange={(event) => onToggleSource(source.id, event.target.checked)} aria-label={`Show ${source.name}`} /><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: source.color }} /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{source.name}</span><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRefresh(source.id)} aria-label={`Refresh ${source.name}`}><RefreshCw className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onRemove(source.id)} aria-label={`Remove ${source.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>{source.lastError ? <span className="text-[10px] text-destructive">{source.lastError}</span> : null}</div>) : <p className="text-xs text-muted-foreground">No external calendars connected yet.</p>}</div></div>;
}

function ReadonlyDetails({ item, onClose }: { item: CalendarTimelineItem; onClose: () => void }) {
  const startDate = new Date(item.startAt);
  const endDate = item.endAt ? new Date(item.endAt) : null;
  const dateLabel = startDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeLabel = item.allDay
    ? 'All day'
    : formatSingleTime(item.startAt) + (endDate ? ` – ${formatSingleTime(item.endAt!)}` : '');
  const localTZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const showTZ = item.timeZone && item.timeZone !== localTZ;
  const descriptionLines = item.description?.split(/\n|\\n/).map((line) => line.trim()).filter(Boolean) ?? [];
  const locationHref = item.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}` : undefined;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center bg-black/20 p-4"
      role="dialog"
      aria-label={`${item.title} details`}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-[var(--itu-radius-l)] border border-border bg-card text-card-foreground shadow-[var(--itu-shadow-pop)]"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 p-5 pb-4">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Calendar event</p>
            <h2 className="mt-1 text-lg font-semibold leading-snug">{item.title}</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">Close</Button>
        </div>

        {/* Body rows */}
        <div className="grid divide-y divide-border/50 px-5">
          {/* Calendar source */}
          <div className="flex items-center gap-3 py-3">
            <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="text-sm font-medium">{item.sourceName ?? 'Calendar'}</span>
          </div>

          {/* When */}
          <div className="flex items-start gap-3 py-3">
            <span className="mt-0.5 h-4 w-4 shrink-0 text-center font-mono text-[10px] font-bold text-muted-foreground" aria-hidden="true">⏰</span>
            <div className="text-sm">
              <p className="font-medium">{dateLabel}</p>
              <p className="text-muted-foreground">
                {timeLabel}
                {showTZ ? <span className="ml-1.5 rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px]">{item.timeZone}</span> : null}
              </p>
            </div>
          </div>

          {/* Location */}
          {item.location ? (
            <div className="flex items-start gap-3 py-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {locationHref ? (
                <a
                  href={locationHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary underline-offset-2 hover:underline"
                >
                  {item.location}
                </a>
              ) : (
                <span className="text-sm">{item.location}</span>
              )}
            </div>
          ) : null}

          {/* Description */}
          {descriptionLines.length > 0 ? (
            <div className="flex items-start gap-3 py-3">
              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div className="min-w-0 flex-1 space-y-0.5 text-sm text-foreground">
                {descriptionLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 pb-4 pt-2">
          <p className="text-[10px] text-muted-foreground">Read-only · synced from external calendar</p>
        </div>
      </div>
    </div>
  );
}

function CalendarStatus({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex min-h-32 items-center justify-center gap-3 border-b border-border/60 p-8 text-center" role="status"><CalendarDays className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" /><div><p className="text-sm font-semibold text-foreground">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p>{action ? <div className="mt-3">{action}</div> : null}</div></div>;
}

function formatHour(hour: number) {
  return `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}${hour < 12 ? 'a' : 'p'}`;
}

const MONTH_DATE_HEADER_HEIGHT = 30;
const MONTH_LANE_HEIGHT = 20;
const MONTH_LANE_GAP = 3;

function MonthWeekdayHeader({ firstDayOfWeek }: { firstDayOfWeek: 0 | 1 }) {
  const labels: string[] = [];
  for (let index = 0; index < 7; index += 1) {
    const day = new Date(2026, 7, 9 + index); // Sunday Aug 9 2026
    labels.push(day.toLocaleDateString(undefined, { weekday: 'short' }));
  }
  const start = firstDayOfWeek === 1 ? 1 : 0;
  const ordered = [...labels.slice(start), ...labels.slice(0, start)];
  return (
    <div className="sticky top-0 z-20 grid grid-cols-7 border-b-2 border-border bg-card/95 backdrop-blur">
      {ordered.map((label, index) => (
        <div key={`${label}-${index}`} className="border-l border-border/50 px-2 py-2 first:border-l-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
        </div>
      ))}
    </div>
  );
}

function MonthCalendarGrid({ anchor, days, groups, firstDayOfWeek, onSelect, onDragStart, onResize, onResizeStep, onMore }: {
  anchor: Date;
  days: Date[];
  groups: CalendarGroup[];
  firstDayOfWeek: 0 | 1;
  onSelect: (item: CalendarTimelineItem) => void;
  onDragStart: (item: CalendarTimelineItem, event: React.DragEvent<HTMLElement>) => void;
  onResize: (item: CalendarTimelineItem, edge: 'start' | 'end', event: React.PointerEvent) => void;
  onResizeStep: (item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) => void;
  onMore: (date: Date, items: CalendarTimelineItem[], event: React.MouseEvent<HTMLElement>) => void;
}) {
  const weeks = chunkWeeks(days);
  const items = groups.flatMap((group) => group.items);
  const today = new Date();
  const semantic = semanticMonthRange(anchor);
  return (
    <div className="select-none bg-[var(--itu-surface-2)]">
      <MonthWeekdayHeader firstDayOfWeek={firstDayOfWeek} />
      {weeks.map((weekDays, weekIndex) => {
        const weekStart = new Date(weekDays[0]);
        weekStart.setHours(0, 0, 0, 0);
        const weekItems = items.filter((item) => itemSpansDay(item, weekDays[0]) || itemSpansDay(item, weekDays[6]));
        const layout = layoutMonthWeek(weekItems.map((item) => ({ id: item.id, start: new Date(item.startAt), end: item.endAt ? new Date(item.endAt) : new Date(new Date(item.startAt).getTime() + 30 * 60_000) })), weekStart);
        const itemById = new Map(weekItems.map((item) => [item.id, item]));
        return (
          <div key={weekIndex} className="relative grid grid-cols-7 border-b border-border/60">
            {weekDays.map((date, dayIndex) => {
              const key = date.toISOString();
              const isToday = isSameLocalDay(date, today);
              const outside = date.getMonth() !== semantic.from.getMonth();
              const hidden = layout.hiddenCounts[dayIndex] ?? 0;
              const dayItems = weekItems.filter((item) => itemSpansDay(item, date)).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
              return (
                <div key={key} data-calendar-day={key} className={`min-h-[110px] border-l border-border/50 first:border-l-0 ${outside ? 'bg-black/[0.03]' : ''} ${isToday ? 'bg-primary/[0.05]' : ''}`}>
                  <div className="flex items-center justify-between px-2 pt-1.5" style={{ height: MONTH_DATE_HEADER_HEIGHT }}>
                    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold leading-none ${isToday ? 'bg-[var(--itu-teal-600)] text-white' : outside ? 'text-muted-foreground/60' : 'text-foreground'}`}>
                      {date.getDate()}
                    </span>
                    {hidden > 0 ? (
                      <button
                        type="button"
                        onClick={(event) => onMore(date, dayItems, event)}
                        className="rounded-full px-1.5 font-mono text-[9.5px] font-semibold text-muted-foreground hover:bg-card hover:text-foreground"
                        aria-label={`${hidden} more items on ${date.toLocaleDateString()}`}
                      >
                        +{hidden} more
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
            <div className="pointer-events-none absolute inset-x-0" style={{ top: MONTH_DATE_HEADER_HEIGHT, bottom: 6 }}>
              {layout.segments
                .filter((segment) => segment.lane < MAX_VISIBLE_MONTH_LANES)
                .map((segment) => {
                  const item = itemById.get(segment.id);
                  if (!item) return null;
                  return (
                    <div
                      key={`${segment.id}-${weekIndex}`}
                      className="pointer-events-auto absolute px-0.5"
                      style={{ left: `${(segment.dayStart / 7) * 100}%`, width: `${((segment.dayEnd - segment.dayStart) / 7) * 100}%`, top: segment.lane * (MONTH_LANE_HEIGHT + MONTH_LANE_GAP), height: MONTH_LANE_HEIGHT }}
                    >
                      <CalendarEventCard item={item} variant="monthChip" onSelect={onSelect} onDragStart={onDragStart} className="h-full" />
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayItemsPopover({ date, items, x, y, onSelect, onClose }: {
  date: Date;
  items: CalendarTimelineItem[];
  x: number;
  y: number;
  onSelect: (item: CalendarTimelineItem) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const positioned = { left: Math.min(x, window.innerWidth - 340), top: Math.min(y, window.innerHeight - 420) };
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />
      <div className="fixed z-50 w-80 overflow-hidden rounded-[14px] border border-border bg-card shadow-[var(--itu-shadow-pop)]" style={positioned} role="dialog" aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} events`}>
        <div className="border-b border-border/60 bg-[image:var(--itu-gradient-deep)] px-4 py-3 text-[#f4faf7]">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--itu-teal-400)]">Day</p>
          <h3 className="mt-0.5 text-sm font-semibold">{date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
        </div>
        <div className="max-h-72 divide-y divide-border/40 overflow-y-auto">
          {items.map((item) => {
            const color = timelineItemColor(item.kind, item.color);
            const label = item.kind === 'TASK_DUE' ? 'Due Date' : item.kind === 'FOCUS_SESSION' ? 'Focus Session' : item.kind === 'EXTERNAL_EVENT' ? 'Subscription' : 'Task';
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => { onClose(); onSelect(item); }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left outline-none hover:bg-muted/60 focus-visible:bg-muted/60"
              >
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-foreground">{item.title}</span>
                  <span className="mt-0.5 block font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {formatSingleTime(item.startAt)}
                  {item.endAt && !isSameLocalDay(item.startAt, item.endAt) ? ' →' : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
