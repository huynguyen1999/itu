import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  GripVertical,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react';
import { api, type CalendarTimelineItem, type ProductivityTask } from '@/shared/api/client';
import { getStoredTaskPreferences } from '@/shared/api/preferencesApi';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/PageHeader';
import { TaskDetailModal } from '../planning/components/TaskDetailModal';
import {
  assignOverlapLane,
  formatRangeLabel,
  isArrangeableTask,
  isSameLocalDay,
  localMinutesSinceMidnight,
  snapTimestamp,
  shiftAnchor,
  timelineItemColor,
  visibleRange,
  type TimelineItemKind,
  type TimelineZoom,
} from './timeline';

type CalendarPreferences = {
  zoom: TimelineZoom;
  visibleKinds: TimelineItemKind[];
  showCompleted: boolean;
  collapsedGroupIds: string[];
};

const DEFAULT_CALENDAR_PREFERENCES: CalendarPreferences = {
  zoom: 'WEEK',
  visibleKinds: ['TASK_DURATION', 'TASK_DUE', 'FOCUS_SESSION', 'EXTERNAL_EVENT'],
  showCompleted: true,
  collapsedGroupIds: [],
};

const timelineKey = (from: string, to: string) => ['calendar', 'timeline', from, to] as const;
const LABEL_WIDTH = 208;
const DAY_HOUR_WIDTH = 88;
const DATE_WIDTH = 138;
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
  const [selectedTask, setSelectedTask] = useState<ProductivityTask | null>(null);
  const [selectedReadonly, setSelectedReadonly] = useState<CalendarTimelineItem | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!prefValue) return;
    if (prefValue.zoom) setZoom(prefValue.zoom);
    if (prefValue.visibleKinds) setVisibleKinds(prefValue.visibleKinds);
    if (prefValue.showCompleted !== undefined) setShowCompleted(prefValue.showCompleted);
    if (prefValue.collapsedGroupIds) setCollapsedGroupIds(prefValue.collapsedGroupIds);
  }, [prefValue?.zoom, prefValue?.visibleKinds, prefValue?.showCompleted, prefValue?.collapsedGroupIds]);
  const range = useMemo(() => visibleRange(anchor, zoom), [anchor, zoom]);
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
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['calendar', 'timeline'] }),
  });

  const items = (timeline.data?.items ?? []).filter(
    (item) => visibleKinds.includes(item.kind) && (showCompleted || item.status !== 'COMPLETED'),
  );
  const groups = groupCalendarItems(items);
  const days = useMemo(() => {
    const result: Date[] = [];
    for (let date = new Date(range.from); date < range.to; date.setDate(date.getDate() + 1)) result.push(new Date(date));
    return result;
  }, [range]);
  const axisWidth = zoom === 'DAY' ? 24 * DAY_HOUR_WIDTH : days.length * (zoom === 'MONTH' ? MONTH_DATE_WIDTH : DATE_WIDTH);
  const unscheduled = (tasks.data?.data ?? []).filter(isArrangeableTask);
  const taskById = new Map((tasks.data?.data ?? []).map((task) => [task.id, task]));

  function savePreference(patch: Partial<CalendarPreferences>) {
    updatePreferences.mutate(patch);
  }

  function selectItem(item: CalendarTimelineItem) {
    if (item.readOnly) setSelectedReadonly(item);
    else {
      const task = taskById.get(item.taskId ?? '');
      if (task) setSelectedTask(task);
      else if (item.taskId) void api.getTask(item.taskId).then(setSelectedTask);
    }
  }

  function moveAnchor(direction: -1 | 1) {
    setAnchor(shiftAnchor(anchor, zoom, direction));
  }

  function dropTask(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/iTu-calendar-task');
    if (!raw || !trackRef.current) return;
    const payload = JSON.parse(raw) as { id: string; durationMs?: number };
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
      updateTask.mutate({
      id: payload.id,
      patch: payload.durationMs
        ? { scheduledStartAt: start.toISOString(), scheduledEndAt: new Date(start.getTime() + payload.durationMs).toISOString() }
        : { dueAt: defaultDueDate(start).toISOString() },
    });
  }

  function defaultDueDate(date: Date) {
    const [hours, minutes] = getStoredTaskPreferences().defaultDueTime.split(':').map(Number);
    const dueDate = new Date(date);
    dueDate.setHours(Number.isFinite(hours) ? hours : 21, Number.isFinite(minutes) ? minutes : 0, 0, 0);
    return dueDate;
  }

  function dragItem(item: CalendarTimelineItem, event: React.DragEvent<HTMLElement>) {
    if (!item.taskId) return;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(
      'application/iTu-calendar-task',
      JSON.stringify({ id: item.taskId, durationMs: item.endAt ? new Date(item.endAt).getTime() - new Date(item.startAt).getTime() : undefined }),
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
      if (end > start) updateTask.mutate({ id: item.taskId!, patch: { scheduledStartAt: new Date(start).toISOString(), scheduledEndAt: new Date(end).toISOString() } });
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
    updateTask.mutate({ id: item.taskId, patch: { scheduledStartAt: new Date(start).toISOString(), scheduledEndAt: new Date(end).toISOString() } });
  }

  return (
    <section className="min-h-full space-y-5 pb-12">
      <PageHeader kicker="Productivity" title="Calendar" description="A calm, source-first view of what has your attention.">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowArrange((open) => !open)} aria-expanded={showArrange} aria-controls="calendar-arrange-tasks">
            <Plus className="h-3.5 w-3.5" /> Arrange tasks
          </Button>
          <div className="flex items-center gap-1 rounded-[var(--itu-radius-s)] border border-border/70 p-1 shadow-[var(--itu-shadow-card)]">
            <Button variant="ghost" size="icon" aria-label="Previous range" onClick={() => moveAnchor(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(new Date())}>Today</Button>
            <Button variant="ghost" size="icon" aria-label="Next range" onClick={() => moveAnchor(1)}><ChevronRight className="h-4 w-4" /></Button>
            {(['DAY', 'WEEK', 'MONTH'] as const).map((value) => <Button key={value} variant={zoom === value ? 'default' : 'ghost'} size="sm" onClick={() => { setZoom(value); savePreference({ zoom: value }); }}>{value[0] + value.slice(1).toLowerCase()}</Button>)}
            <Button variant="ghost" size="icon" aria-label="Calendar settings" onClick={() => setShowSettings((open) => !open)}><Settings2 className="h-4 w-4" /></Button>
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
          <div><p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--itu-teal-400)]">Schedule overview · source timeline</p><h2 className="mt-1 text-lg font-semibold">{formatRangeLabel(range, zoom)}</h2></div>
          <div className="font-mono text-[11px] text-white/70">{items.length} items · {groups.length} sources</div>
        </div>
        <div ref={trackRef} className="overflow-auto bg-[var(--itu-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onDragOver={(event) => event.preventDefault()} onDrop={dropTask} tabIndex={0} aria-label="Calendar source timeline">
          <div className="min-w-max" style={{ width: LABEL_WIDTH + axisWidth }}>
            <CalendarAxis days={days} zoom={zoom} width={axisWidth} />
            {timeline.isLoading ? <CalendarStatus title="Loading your calendar…" description="Fetching tasks, Due Dates, Focus Sessions, and subscriptions." /> : null}
            {timeline.isError ? <CalendarStatus title="Calendar could not be loaded" description="The timeline request failed." action={<Button variant="outline" size="sm" onClick={() => void timeline.refetch()}>Retry</Button>} /> : null}
            {!timeline.isLoading && !timeline.isError && groups.length === 0 ? <CalendarStatus title="Nothing scheduled for this range" description="Arrange an unfinished task or connect a calendar source to begin." /> : null}
            {!timeline.isLoading && !timeline.isError ? groups.map((group) => {
              const collapsed = collapsedGroupIds.includes(group.id);
              return <CalendarGroupRow key={group.id} group={group} days={days} zoom={zoom} width={axisWidth} collapsed={collapsed} onToggle={() => { const next = collapsed ? collapsedGroupIds.filter((id) => id !== group.id) : [...collapsedGroupIds, group.id]; setCollapsedGroupIds(next); savePreference({ collapsedGroupIds: next }); }} onSelect={selectItem} onDragStart={dragItem} onResize={resizeTask} onResizeStep={resizeTaskStep} />;
            }) : null}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3 text-xs text-muted-foreground"><span>Tasks can move and resize. Focus Sessions and subscriptions are read-only.</span><span className="font-mono text-[10px] uppercase tracking-[0.12em]">{zoom === 'DAY' ? 'Hourly axis' : 'Date axis'}</span></div>
      </div>

      {showArrange ? <ArrangeTasks tasks={unscheduled} isLoading={tasks.isLoading} isError={tasks.isError} onRetry={() => void tasks.refetch()} /> : null}
      {selectedTask ? <TaskDetailModal task={selectedTask} tasks={tasks.data?.data ?? []} isOpen onClose={() => setSelectedTask(null)} /> : null}
      {selectedReadonly ? <ReadonlyDetails item={selectedReadonly} onClose={() => setSelectedReadonly(null)} /> : null}
    </section>
  );
}

export function groupCalendarItems(items: CalendarTimelineItem[]): CalendarGroup[] {
  const map = new Map<string, CalendarGroup>();
  for (const item of items) {
    const isFocus = item.kind === 'FOCUS_SESSION';
    const isExternal = item.kind === 'EXTERNAL_EVENT';
    const id = isFocus ? 'focus' : isExternal ? `calendar:${item.sourceId ?? 'calendar'}` : `project:${item.sourceId ?? 'inbox'}`;
    const label = isFocus ? 'Focus' : isExternal ? item.sourceName ?? 'Calendar subscription' : item.sourceName ?? 'Inbox';
    const subtitle = isFocus ? 'Focus Sessions' : isExternal ? 'Calendar subscription' : item.sourceId ? 'Project' : 'Inbox';
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
  return <div className="sticky top-0 z-20 flex h-[76px] border-b border-border/70 bg-card/95 backdrop-blur"><div className="sticky left-0 z-30 flex w-[208px] shrink-0 items-end border-r border-border/70 bg-card/95 px-4 pb-3"><span className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Sources</span></div><div className="relative" style={{ width }}>{zoom === 'DAY' ? Array.from({ length: 24 }, (_, hour) => <div key={hour} className="absolute inset-y-0 border-l border-border/60 px-2 pb-3 pt-7" style={{ left: hour * DAY_HOUR_WIDTH, width: DAY_HOUR_WIDTH }}><span className="font-mono text-[10px] text-muted-foreground">{formatHour(hour)}</span></div>) : days.map((date, index) => <div key={date.toISOString()} className={`absolute inset-y-0 border-l border-border/60 px-3 pb-2 pt-3 ${isSameLocalDay(date, new Date()) ? 'bg-primary/[0.06]' : ''}`} style={{ left: index * (zoom === 'MONTH' ? MONTH_DATE_WIDTH : DATE_WIDTH), width: zoom === 'MONTH' ? MONTH_DATE_WIDTH : DATE_WIDTH }}><span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">{date.toLocaleDateString(undefined, { weekday: 'short' })}</span><span className="mt-1 block text-sm font-semibold text-foreground">{date.getDate()} <span className="font-normal text-muted-foreground">{date.toLocaleDateString(undefined, { month: 'short' })}</span></span></div>)}</div></div>;
}

function CalendarGroupRow({ group, days, zoom, width, collapsed, onToggle, onSelect, onDragStart, onResize, onResizeStep }: { group: CalendarGroup; days: Date[]; zoom: TimelineZoom; width: number; collapsed: boolean; onToggle: () => void; onSelect: (item: CalendarTimelineItem) => void; onDragStart: (item: CalendarTimelineItem, event: React.DragEvent<HTMLElement>) => void; onResize: (item: CalendarTimelineItem, edge: 'start' | 'end', event: React.PointerEvent) => void; onResizeStep: (item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) => void }) {
  return <div className="flex border-b border-border/70"><div className="sticky left-0 z-10 flex w-[208px] shrink-0 items-start gap-3 border-r border-border/70 bg-card px-4 py-4"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} /><div className="min-w-0"><button type="button" onClick={onToggle} aria-expanded={!collapsed} className="flex items-center gap-1 text-left text-sm font-semibold text-foreground"><ChevronDown className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${collapsed ? '-rotate-90' : ''}`} /> <span className="truncate">{group.label}</span></button><p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">{group.subtitle} · {group.items.length}</p></div></div><div className="relative" style={{ width }}>{collapsed ? <div className="h-[70px] bg-[var(--itu-surface-2)]" /> : <>{zoom === 'DAY' ? <DayRow group={group} onSelect={onSelect} onDragStart={onDragStart} onResize={onResize} onResizeStep={onResizeStep} /> : <DateRow group={group} days={days} zoom={zoom} onSelect={onSelect} onDragStart={onDragStart} onResize={onResize} onResizeStep={onResizeStep} />}</>}</div></div>;
}

function DayRow({ group, onSelect, onDragStart, onResize, onResizeStep }: { group: CalendarGroup; onSelect: (item: CalendarTimelineItem) => void; onDragStart: (item: CalendarTimelineItem, event: React.DragEvent<HTMLElement>) => void; onResize: (item: CalendarTimelineItem, edge: 'start' | 'end', event: React.PointerEvent) => void; onResizeStep: (item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) => void }) {
  const allDayItems = group.items.filter((item) => item.allDay);
  const timedItems = group.items.filter((item) => !item.allDay);
  const timedLanes = assignOverlapLane(timedItems.map((item) => ({
    startAt: item.startAt,
    endAt: item.endAt ?? new Date(new Date(item.startAt).getTime() + 30 * 60_000).toISOString(),
  })));
  const laneCount = timedLanes.length ? Math.max(...timedLanes) + 1 : 0;
  const allDayHeight = allDayItems.length ? allDayItems.length * ALL_DAY_ITEM_HEIGHT + (allDayItems.length - 1) * 4 : ALL_DAY_HEIGHT;
  const rowHeight = Math.max(122, allDayHeight + 18 + laneCount * 42 + 12);
  return <div className="relative bg-[var(--itu-surface-2)]" style={{ height: rowHeight }}><div className="absolute inset-x-0 top-0 flex flex-col gap-1 overflow-hidden border-b border-border/60 bg-card/70 px-3" style={{ height: allDayHeight }}>{allDayItems.map((item) => <CalendarItem key={item.id} item={item} left={0} top={0} onSelect={onSelect} onDragStart={onDragStart} onResize={onResize} onResizeStep={onResizeStep} compact />)}</div><div className="absolute inset-x-0 bottom-0" style={{ top: allDayHeight }}>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="absolute inset-y-0 border-l border-border/40" style={{ left: hour * DAY_HOUR_WIDTH }} />)}{timedItems.map((item, index) => <CalendarItem key={item.id} item={item} left={(localMinutesSinceMidnight(item.startAt) / 60) * DAY_HOUR_WIDTH} top={18 + timedLanes[index] * 42} width={Math.max(64, ((item.endAt ? new Date(item.endAt).getTime() - new Date(item.startAt).getTime() : 30 * 60_000) / 3_600_000) * DAY_HOUR_WIDTH)} onSelect={onSelect} onDragStart={onDragStart} onResize={onResize} onResizeStep={onResizeStep} />)}</div></div>;
}

function DateRow({ group, days, zoom, onSelect, onDragStart, onResize, onResizeStep }: { group: CalendarGroup; days: Date[]; zoom: TimelineZoom; onSelect: (item: CalendarTimelineItem) => void; onDragStart: (item: CalendarTimelineItem, event: React.DragEvent<HTMLElement>) => void; onResize: (item: CalendarTimelineItem, edge: 'start' | 'end', event: React.PointerEvent) => void; onResizeStep: (item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) => void }) {
  const cellWidth = zoom === 'MONTH' ? MONTH_DATE_WIDTH : DATE_WIDTH;
  return <div className="flex min-h-[106px] bg-[var(--itu-surface-2)]">{days.map((date, index) => <div key={date.toISOString()} data-calendar-day={date.toISOString()} className={`min-h-[106px] border-l border-border/50 p-2 ${isSameLocalDay(date, new Date()) ? 'bg-primary/[0.04]' : ''}`} style={{ width: cellWidth }}>{group.items.filter((item) => isSameLocalDay(item.startAt, date)).map((item) => <CalendarItem key={item.id} item={item} left={0} top={0} width={cellWidth - 16} onSelect={onSelect} onDragStart={onDragStart} onResize={onResize} onResizeStep={onResizeStep} compact />)}</div>)}</div>;
}

function CalendarItem({ item, left, top, width, compact, onSelect, onDragStart, onResize, onResizeStep }: { item: CalendarTimelineItem; left: number; top: number; width?: number; compact?: boolean; onSelect: (item: CalendarTimelineItem) => void; onDragStart: (item: CalendarTimelineItem, event: React.DragEvent<HTMLElement>) => void; onResize: (item: CalendarTimelineItem, edge: 'start' | 'end', event: React.PointerEvent) => void; onResizeStep: (item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) => void }) {
  const color = timelineItemColor(item.kind, item.color);
  const label = item.kind === 'TASK_DUE' ? 'Due Date' : item.kind === 'FOCUS_SESSION' ? 'Focus Session' : item.kind === 'EXTERNAL_EVENT' ? 'Subscription' : 'Task';
  return <div role="button" tabIndex={0} draggable={!item.readOnly} onDragStart={(event) => onDragStart(item, event)} onClick={() => onSelect(item)} onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item); } }} className={`group ${compact ? 'relative min-w-0 flex-1' : 'absolute'} overflow-hidden text-left outline-none transition-[filter,box-shadow] hover:brightness-105 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${compact ? 'rounded-[var(--itu-radius-s)] border border-border/70 bg-card px-2 py-1.5 shadow-[var(--itu-shadow-card)]' : 'rounded-[var(--itu-radius-s)] px-2.5 py-2 text-white shadow-[var(--itu-shadow-card)]'} ${item.readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`} style={{ left, top, ...(width === undefined ? {} : { width }), minHeight: compact ? (item.allDay ? 26 : 38) : item.allDay ? 26 : 32, ...(compact ? { borderTopColor: color, borderTopWidth: 2 } : { backgroundColor: color }) }} aria-label={`${item.title}, ${label}${item.readOnly ? ', read-only' : ', draggable'}`}><span className={`block truncate text-[11px] font-semibold ${compact ? 'text-foreground' : ''}`}>{item.title}</span><span className={`mt-0.5 block truncate font-mono text-[9px] uppercase tracking-[0.08em] ${compact ? 'text-muted-foreground' : 'text-white/75'}`}>{item.allDay ? 'All day' : formatItemTime(item)} · {label}</span>{item.kind === 'TASK_DURATION' && !item.readOnly ? <><button type="button" aria-label={`Resize start of ${item.title}`} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => onResize(item, 'start', event)} onKeyDown={(event) => { if (event.key === 'ArrowLeft') onResizeStep(item, 'start', -1); if (event.key === 'ArrowRight') onResizeStep(item, 'start', 1); }} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 focus-visible:opacity-100" /><button type="button" aria-label={`Resize end of ${item.title}`} onClick={(event) => event.stopPropagation()} onPointerDown={(event) => onResize(item, 'end', event)} onKeyDown={(event) => { if (event.key === 'ArrowLeft') onResizeStep(item, 'end', -1); if (event.key === 'ArrowRight') onResizeStep(item, 'end', 1); }} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 focus-visible:opacity-100" /></> : null}</div>;
}

function ArrangeTasks({ tasks, isLoading, isError, onRetry }: { tasks: ProductivityTask[]; isLoading: boolean; isError: boolean; onRetry: () => void }) {
  return <aside id="calendar-arrange-tasks" aria-label="Unscheduled tasks" className="rounded-[var(--itu-radius-m)] border border-border/70 bg-card p-4 shadow-[var(--itu-shadow-card)]"><div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Arrange tasks</p><h2 className="mt-1 text-sm font-semibold text-foreground">Give unfinished work a place</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Drag-only: drop a task into a source row and date.</p></div><span className="rounded-full bg-[var(--itu-mint-100)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--itu-teal-700)]">{tasks.length}</span></div>{isLoading ? <p className="mt-4 text-xs text-muted-foreground">Loading tasks…</p> : isError ? <div className="mt-4 flex items-center justify-between rounded-[var(--itu-radius-s)] border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive"><span>Tasks could not be loaded.</span><Button variant="outline" size="sm" onClick={onRetry}>Retry</Button></div> : tasks.length ? <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{tasks.map((task) => <div key={task.id} draggable role="button" tabIndex={0} aria-label={`Drag ${task.title} to schedule it`} onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/iTu-calendar-task', JSON.stringify({ id: task.id, durationMs: (task.estimatedMinutes ?? 30) * 60_000 })); }} className="group flex min-h-12 cursor-grab items-center gap-2 rounded-[var(--itu-radius-s)] border border-border/70 bg-[var(--itu-surface-2)] px-3 py-2 outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"><GripVertical className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" /><span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{task.title}</span><span className="font-mono text-[10px] text-muted-foreground">{task.estimatedMinutes ?? 30}m</span></div>)}</div> : <p className="mt-4 rounded-[var(--itu-radius-s)] border border-dashed border-border/80 px-3 py-4 text-xs text-muted-foreground">You’re clear. New planned work without dates will land here.</p>}</aside>;
}

function CalendarSettings({ visibleKinds, showCompleted, onToggleKind, onToggleCompleted, sources, sourcesLoading, sourcesError, onRetry, onConnect, onRefresh, onRemove, onToggleSource }: { visibleKinds: TimelineItemKind[]; showCompleted: boolean; onToggleKind: (kind: TimelineItemKind) => void; onToggleCompleted: (value: boolean) => void; sources: Array<{ id: string; name: string; provider: string; color: string; visible: boolean; lastError?: string | null }>; sourcesLoading: boolean; sourcesError: boolean; onRetry: () => void; onConnect: (url: string, name?: string) => void; onRefresh: (id: string) => void; onRemove: (id: string) => void; onToggleSource: (id: string, visible: boolean) => void }) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  return <div className="rounded-[var(--itu-radius-m)] border border-border/70 bg-card p-4 shadow-[var(--itu-shadow-pop)]"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Calendar settings</p><h2 className="mt-1 text-sm font-semibold text-foreground">Sources & filters</h2></div><label className="flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={showCompleted} onChange={(event) => onToggleCompleted(event.target.checked)} /> Show completed</label></div><div className="mt-4 flex flex-wrap gap-2">{([['TASK_DURATION', 'Tasks'], ['TASK_DUE', 'Due Dates'], ['FOCUS_SESSION', 'Focus Sessions'], ['EXTERNAL_EVENT', 'Subscriptions']] as const).map(([kind, label]) => <label key={kind} className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs"><input type="checkbox" checked={visibleKinds.includes(kind)} onChange={() => onToggleKind(kind)} /> {label}</label>)}</div><form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); if (url) { onConnect(url, name || undefined); setUrl(''); setName(''); } }}><input aria-label="ICS calendar URL" className="h-9 min-w-56 flex-1 rounded-[var(--itu-radius-s)] border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10" type="url" required placeholder="https://…/calendar.ics" value={url} onChange={(event) => setUrl(event.target.value)} /><input aria-label="Calendar name" className="h-9 min-w-40 flex-1 rounded-[var(--itu-radius-s)] border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10" placeholder="Calendar name" value={name} onChange={(event) => setName(event.target.value)} /><Button type="submit" size="sm">Add subscription</Button></form><div className="mt-4 grid gap-2 border-t border-border/60 pt-3"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Connected sources</p>{sourcesLoading ? <p className="text-xs text-muted-foreground">Loading calendar sources…</p> : sourcesError ? <div className="flex items-center justify-between text-xs text-destructive"><span>Calendar sources could not be loaded.</span><Button variant="outline" size="sm" onClick={onRetry}>Retry</Button></div> : sources.length ? sources.map((source) => <div key={source.id} className="flex items-center gap-2 rounded-[var(--itu-radius-s)] border border-border/60 bg-[var(--itu-surface-2)] px-2.5 py-2"><input type="checkbox" checked={source.visible} onChange={(event) => onToggleSource(source.id, event.target.checked)} aria-label={`Show ${source.name}`} /><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: source.color }} /><span className="min-w-0 flex-1 truncate text-xs font-semibold">{source.name}</span><Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRefresh(source.id)} aria-label={`Refresh ${source.name}`}><RefreshCw className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onRemove(source.id)} aria-label={`Remove ${source.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>{source.lastError ? <span className="text-[10px] text-destructive">{source.lastError}</span> : null}</div>) : <p className="text-xs text-muted-foreground">No external calendars connected yet.</p>}</div></div>;
}

function ReadonlyDetails({ item, onClose }: { item: CalendarTimelineItem; onClose: () => void }) {
  return <div className="fixed inset-0 z-40 grid place-items-center bg-black/20 p-4" role="dialog" aria-label={`${item.title} details`} onClick={onClose}><div className="w-full max-w-md rounded-[var(--itu-radius-l)] border border-border bg-card p-5 text-card-foreground shadow-[var(--itu-shadow-pop)]" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Read-only detail</p><h2 className="mt-1 text-lg font-semibold">{item.title}</h2></div><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div><dl className="mt-4 grid gap-2 text-sm"><div className="flex justify-between gap-3 border-b border-border-soft pb-2"><dt className="text-muted-foreground">Source</dt><dd className="font-medium">{item.sourceName ?? 'Calendar'}</dd></div><div className="flex justify-between gap-3"><dt className="text-muted-foreground">When</dt><dd className="text-right font-medium">{item.allDay ? 'All day' : formatItemTime(item)}</dd></div></dl></div></div>;
}

function CalendarStatus({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return <div className="flex min-h-32 items-center justify-center gap-3 border-b border-border/60 p-8 text-center" role="status"><CalendarDays className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" /><div><p className="text-sm font-semibold text-foreground">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p>{action ? <div className="mt-3">{action}</div> : null}</div></div>;
}

function formatItemTime(item: CalendarTimelineItem) {
  const start = new Date(item.startAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (!item.endAt) return start;
  const end = new Date(item.endAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${start}–${end}`;
}

function formatHour(hour: number) {
  return `${hour === 0 ? 12 : hour > 12 ? hour - 12 : hour}${hour < 12 ? 'a' : 'p'}`;
}
