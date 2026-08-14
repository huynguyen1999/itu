import { useEffect, useRef, useState } from 'react';
import { api, type CalendarTimelineItem, type ProductivityTask } from '@/shared/api/client';
import { PageHeader } from '@/shared/ui/PageHeader';
import { TaskDetailModal } from '@/features/planning';
import { ArrangeTasksPanel } from './components/ArrangeTasksPanel';
import { CalendarSettings } from './components/CalendarSettings';
import { CalendarTimeline, groupCalendarItems, ReadonlyDetails } from './components/CalendarTimeline';
import { CalendarToolbar } from './components/CalendarToolbar';
import { useCalendarData } from './hooks/useCalendarData';
import { useCalendarTaskInteractions } from './hooks/useCalendarTaskInteractions';
import { dayTimelineScrollTop, formatRangeLabel, shiftAnchor, weekTimelineScrollLeft } from './timeline';

export function CalendarPage() {
  const {
    queryClient, zoom, setZoom, anchor, setAnchor, visibleKinds, setVisibleKinds, showCompleted, setShowCompleted,
    collapsedGroupIds, setCollapsedGroupIds, weekStart, setWeekStart, firstDayOfWeek, range, from, to, timeline, tasks,
    sources, updateSource, addIcs, refreshSource, removeSource, updateTask, items, groups, days, unscheduled, taskById,
    resizePreview, setResizePreview, savePreference,
  } = useCalendarData();
  const [showArrange, setShowArrange] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ProductivityTask | null>(null);
  const [selectedReadonly, setSelectedReadonly] = useState<CalendarTimelineItem | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const { dropTask, dragItem, resizeTask, resizeTaskStep } = useCalendarTaskInteractions({
    zoom, range, from, to, trackRef, queryClient, updateTask: (mutation) => updateTask.mutate(mutation), taskById,
    showCompleted, setResizePreview,
  });

  const positioningData = useRef({ items, days });
  positioningData.current = { items: groups.filter((group) => !collapsedGroupIds.includes(group.id)).flatMap((group) => group.items), days };

  useEffect(() => {
    if (zoom === 'MONTH' || !timeline.isSuccess || !trackRef.current) return;
    const frame = window.requestAnimationFrame(() => {
      const track = trackRef.current;
      if (!track) return;
      const { items: visibleItems, days: visibleDays } = positioningData.current;
      if (zoom === 'DAY') {
        const timedTrack = track.querySelector<HTMLElement>('[data-calendar-timed-track]');
        const trackOffset = timedTrack
          ? timedTrack.getBoundingClientRect().top - track.getBoundingClientRect().top + track.scrollTop
          : 0;
        track.scrollTop = Math.max(0, trackOffset + dayTimelineScrollTop(visibleItems));
      } else {
        track.scrollLeft = weekTimelineScrollLeft(visibleItems, visibleDays);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [zoom, anchor.getTime(), from, to, timeline.isSuccess]);

  function selectItem(item: CalendarTimelineItem) {
    if (item.readOnly) setSelectedReadonly(item);
    else if (item.taskId) {
      const task = taskById.get(item.taskId);
      if (task) setSelectedTask(task); else void api.getTask(item.taskId).then(setSelectedTask);
    }
  }

  return (
    <section className="min-h-full space-y-5 pb-12">
      <PageHeader kicker="Productivity" title="Calendar" description="A calm, source-first view of what has your attention.">
        <CalendarToolbar zoom={zoom} showArrange={showArrange} onToggleArrange={() => setShowArrange((open) => !open)} onMoveAnchor={(direction) => setAnchor(shiftAnchor(anchor, zoom, direction))} onToday={() => setAnchor(new Date())} onZoomChange={(value) => { setZoom(value); savePreference({ zoom: value }); }} onToggleSettings={() => setShowSettings((open) => !open)} />
      </PageHeader>

      {showSettings ? <CalendarSettings visibleKinds={visibleKinds} showCompleted={showCompleted} weekStart={weekStart} onWeekStart={(value) => { setWeekStart(value); savePreference({ weekStart: value }); }} onToggleKind={(kind) => { const next = visibleKinds.includes(kind) ? visibleKinds.filter((value) => value !== kind) : [...visibleKinds, kind]; setVisibleKinds(next); savePreference({ visibleKinds: next }); }} onToggleCompleted={(value) => { setShowCompleted(value); savePreference({ showCompleted: value }); }} sources={sources.data ?? []} sourcesLoading={sources.isLoading} sourcesError={sources.isError} onRetry={() => void sources.refetch()} onConnect={(url, name) => addIcs.mutate({ url, name })} onRefresh={(id) => refreshSource.mutate(id)} onRemove={(id) => removeSource.mutate(id)} onToggleSource={(id, visible) => updateSource.mutate({ id, visible })} /> : null}

      <CalendarTimeline trackRef={trackRef} groups={groups} days={days} zoom={zoom} itemCount={items.length} rangeLabel={zoom === 'MONTH' ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : formatRangeLabel(range, zoom)} anchor={anchor} isLoading={timeline.isLoading} isError={timeline.isError} onRetry={() => void timeline.refetch()} collapsedGroupIds={collapsedGroupIds} onToggleGroup={(id) => { const next = collapsedGroupIds.includes(id) ? collapsedGroupIds.filter((value) => value !== id) : [...collapsedGroupIds, id]; setCollapsedGroupIds(next); savePreference({ collapsedGroupIds: next }); }} onSelect={selectItem} onDragStart={dragItem} onResize={resizeTask} onResizeStep={resizeTaskStep} onDrop={dropTask} resizePreview={resizePreview} />

      {showArrange ? <ArrangeTasksPanel tasks={unscheduled} isLoading={tasks.isLoading} isError={tasks.isError} onRetry={() => void tasks.refetch()} /> : null}
      {selectedTask ? <TaskDetailModal task={selectedTask} tasks={tasks.data?.data ?? []} isOpen onClose={() => setSelectedTask(null)} /> : null}
      {selectedReadonly ? <ReadonlyDetails item={selectedReadonly} onClose={() => setSelectedReadonly(null)} /> : null}
    </section>
  );
}

export { groupCalendarItems };
