import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { groupCalendarItems } from '../components/CalendarTimeline';
import {
  isArrangeableTask,
  visibleRange,
  type TimelineItemKind,
  type TimelineZoom,
} from '../timeline';
import {
  monthGridDays,
  monthGridRange,
  resolveFirstDayOfWeek,
  type WeekStart,
} from '../monthGrid';
import { updateTaskInCalendarCache } from '../calendarProjection';
import type { ResizePreviewState } from '../calendar.types';

export type CalendarPreferences = {
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

export const calendarTimelineKey = (from: string, to: string) => ['calendar', 'timeline', from, to] as const;

export function useCalendarData() {
  const queryClient = useQueryClient();
  const preferences = useQuery({ queryKey: ['user-preferences'], queryFn: () => api.getPreferences(), retry: 1 });
  const prefValue = (preferences.data as (typeof preferences.data & { calendar?: Partial<CalendarPreferences> }) | undefined)?.calendar;
  const currentPreferences = { ...DEFAULT_CALENDAR_PREFERENCES, ...prefValue };
  const [zoom, setZoom] = useState<TimelineZoom>(currentPreferences.zoom);
  const [anchor, setAnchor] = useState(() => new Date());
  const [visibleKinds, setVisibleKinds] = useState<TimelineItemKind[]>(currentPreferences.visibleKinds);
  const [showCompleted, setShowCompleted] = useState(currentPreferences.showCompleted);
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<string[]>(currentPreferences.collapsedGroupIds);
  const [weekStart, setWeekStart] = useState<WeekStart>(currentPreferences.weekStart);
  const [resizePreview, setResizePreview] = useState<ResizePreviewState | null>(null);
  const hydrated = useRef(Boolean(prefValue));

  useEffect(() => {
    if (!prefValue || hydrated.current) return;
    if (prefValue.zoom) setZoom(prefValue.zoom);
    if (prefValue.visibleKinds) setVisibleKinds(prefValue.visibleKinds);
    if (prefValue.showCompleted !== undefined) setShowCompleted(prefValue.showCompleted);
    if (prefValue.collapsedGroupIds) setCollapsedGroupIds(prefValue.collapsedGroupIds);
    if (prefValue.weekStart) setWeekStart(prefValue.weekStart);
    hydrated.current = true;
  }, [prefValue]);

  const firstDayOfWeek = resolveFirstDayOfWeek(weekStart);
  const range = useMemo(
    () => zoom === 'MONTH' ? monthGridRange(anchor, firstDayOfWeek) : visibleRange(anchor, zoom, firstDayOfWeek),
    [anchor, zoom, firstDayOfWeek],
  );
  const from = range.from.toISOString();
  const to = range.to.toISOString();
  const timeline = useQuery({ queryKey: calendarTimelineKey(from, to), queryFn: () => api.calendarTimeline(from, to), retry: 1 });
  const tasks = useQuery({ queryKey: ['calendar', 'tasks'], queryFn: () => api.tasks({ limit: 100 }), retry: 1 });
  const sources = useQuery({ queryKey: ['calendar', 'sources'], queryFn: () => api.calendarSources(), retry: 1 });
  const taskById = new Map((tasks.data?.data ?? []).map((task) => [task.id, task]));
  const updatePreferences = useMutation({ mutationFn: (patch: Partial<CalendarPreferences>) => api.updateCalendarPreferences(patch) });
  const updateSource = useMutation({
    mutationFn: ({ id, visible }: { id: string; visible: boolean }) => api.updateCalendarSource(id, { visible }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['calendar', 'sources'] }); void queryClient.invalidateQueries({ queryKey: ['calendar', 'timeline'] }); },
  });
  const addIcs = useMutation({
    mutationFn: ({ url, name }: { url: string; name?: string }) => api.createIcsCalendar({ url, name }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['calendar', 'sources'] }); void queryClient.invalidateQueries({ queryKey: ['calendar', 'timeline'] }); },
  });
  const refreshSource = useMutation({ mutationFn: (id: string) => api.refreshCalendarSource(id), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['calendar', 'sources'] }) });
  const removeSource = useMutation({
    mutationFn: (id: string) => api.deleteCalendarSource(id),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['calendar', 'sources'] }); void queryClient.invalidateQueries({ queryKey: ['calendar', 'timeline'] }); },
  });
  const updateTask = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) => api.updateTask(id, patch),
    onMutate: async ({ id, patch }) => {
      const task = taskById.get(id);
      if (task) updateTaskInCalendarCache(queryClient, { ...task, ...(patch as object) }, { showCompleted });
    },
    onSuccess: (task) => updateTaskInCalendarCache(queryClient, task, { showCompleted }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['calendar', 'timeline'] }),
  });

  const rawItems = timeline.data?.items ?? [];
  const items = useMemo(() => rawItems
    .filter((item) => visibleKinds.includes(item.kind) && (showCompleted || !item.kind.startsWith('TASK_') || item.status !== 'COMPLETED'))
    .map((item) => resizePreview && item.id === resizePreview.itemId ? { ...item, startAt: resizePreview.startAt, endAt: resizePreview.endAt } : item),
    [rawItems, visibleKinds, showCompleted, resizePreview],
  );
  const groups = groupCalendarItems(items);
  const days = useMemo(() => zoom === 'MONTH'
    ? monthGridDays(anchor, firstDayOfWeek)
    : Array.from({ length: Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000) }, (_, index) => {
      const day = new Date(range.from); day.setDate(day.getDate() + index); return day;
    }), [anchor, firstDayOfWeek, range, zoom]);
  const unscheduled = (tasks.data?.data ?? []).filter(isArrangeableTask);
  return {
    queryClient, zoom, setZoom, anchor, setAnchor, visibleKinds, setVisibleKinds, showCompleted, setShowCompleted,
    collapsedGroupIds, setCollapsedGroupIds, weekStart, setWeekStart, firstDayOfWeek, range, from, to, timeline, tasks,
    sources, updateSource, addIcs, refreshSource, removeSource, updateTask, items, groups, days, unscheduled, taskById,
    resizePreview, setResizePreview, savePreference: (patch: Partial<CalendarPreferences>) => updatePreferences.mutate(patch),
  };
}

type CalendarData = ReturnType<typeof useCalendarData>;
