import type { DragEvent, MouseEvent, PointerEvent, ReactNode, RefObject } from 'react';
import { useEffect, useState } from 'react';
import { CalendarDays, FileText, MapPin } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { CalendarTimelineItem } from '@/shared/api/client';
import { CalendarEventCard } from '../CalendarEventCard';
import { calculateDayCollisions } from '../collisionLayout';
import { chunkWeeks, layoutMonthWeek, MAX_VISIBLE_MONTH_LANES, semanticMonthRange, type WeekStart } from '../monthGrid';
import { CALENDAR_DAY_WIDTH, CALENDAR_GUTTER_WIDTH, formatRangeLabel, formatSingleTime, isSameLocalDay, itemSpansDay, localDayIndex, type TimelineZoom, timelineItemColor } from '../timeline';
import type { ResizePreviewState } from '../hooks/useCalendarData';

const DAY_HOUR_HEIGHT = 60;
const MONTH_DATE_WIDTH = 112;
const MONTH_DATE_HEADER_HEIGHT = 28;
const MONTH_LANE_HEIGHT = 28;
const MONTH_LANE_GAP = 4;

export type CalendarGroup = { id: string; label: string; subtitle: string; color: string; items: CalendarTimelineItem[] };

type CalendarTimelineProps = {
  trackRef: RefObject<HTMLDivElement | null>;
  groups: CalendarGroup[];
  days: Date[];
  zoom: TimelineZoom;
  itemCount: number;
  rangeLabel: string;
  anchor: Date;
  firstDayOfWeek: 0 | 1;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  collapsedGroupIds: string[];
  onToggleGroup: (id: string) => void;
  onSelect: (item: CalendarTimelineItem) => void;
  onDragStart: (item: CalendarTimelineItem, event: DragEvent<HTMLElement>) => void;
  onResize: (item: CalendarTimelineItem, edge: 'start' | 'end', event: PointerEvent) => void;
  onResizeStep: (item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  resizePreview: ResizePreviewState | null;
};

export function CalendarTimeline({ trackRef, groups, days, zoom, itemCount, rangeLabel, anchor, firstDayOfWeek, isLoading, isError, onRetry, collapsedGroupIds, onToggleGroup, onSelect, onDragStart, onResize, onResizeStep, onDrop, resizePreview }: CalendarTimelineProps) {
  const [morePopover, setMorePopover] = useState<{ date: Date; items: CalendarTimelineItem[]; x: number; y: number } | null>(null);
  const items = groups.flatMap((group) => collapsedGroupIds.includes(group.id) ? [] : group.items);
  const timelineViewportClass = zoom === 'MONTH' ? 'max-h-[calc(100vh-220px)]' : 'h-[calc(100vh-220px)] min-h-0';
  return (
    <div className="overflow-clip rounded-[var(--itu-radius-m)] border border-border/70 bg-card shadow-[var(--itu-shadow-card)]">
      {zoom !== 'DAY' ? <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[image:var(--itu-gradient-deep)] px-5 py-4 text-[#f4faf7]"><div><p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--itu-teal-400)]">Schedule overview · source timeline</p><h2 className="mt-1 text-lg font-semibold">{rangeLabel}</h2></div><div className="font-mono text-[11px] text-white/70">{itemCount} items · {groups.length} sources</div></div> : null}
      {groups.length ? <div className="flex flex-wrap gap-2 border-b border-border/60 bg-card px-4 py-2" aria-label="Calendar source groups">{groups.map((group) => { const collapsed = collapsedGroupIds.includes(group.id); return <button key={group.id} type="button" aria-expanded={!collapsed} onClick={() => onToggleGroup(group.id)} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-[var(--itu-surface-2)] hover:text-foreground" style={{ borderColor: group.color }}><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />{group.label} · {group.items.length}</button>; })}</div> : null}
      <div ref={trackRef} className={`${timelineViewportClass} overflow-auto bg-[var(--itu-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} tabIndex={0} aria-label="Calendar source timeline">
        {zoom === 'MONTH' ? <MonthGrid anchor={anchor} days={days} groups={groups.filter((group) => !collapsedGroupIds.includes(group.id))} firstDayOfWeek={firstDayOfWeek} onSelect={onSelect} onDragStart={onDragStart} onMore={(date, dayItems, event) => { const rect = event.currentTarget.getBoundingClientRect(); setMorePopover({ date, items: dayItems, x: rect.left + rect.width / 2, y: rect.bottom + 8 }); }} /> : <div className="min-w-full" style={{ width: `max(100%, ${CALENDAR_GUTTER_WIDTH + days.length * CALENDAR_DAY_WIDTH}px)` }}>
          <CalendarAxis days={days} zoom={zoom} />
          {isLoading ? <CalendarStatus title="Loading your calendar…" description="Fetching tasks, Due Dates, Focus Sessions, and subscriptions." /> : null}
          {isError ? <CalendarStatus title="Calendar could not be loaded" description="The timeline request failed." action={<Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>} /> : null}
          {!isLoading && !isError && !items.length ? <CalendarStatus title="Nothing scheduled for this range" description="Arrange an unfinished task or connect a calendar source to begin." /> : null}
          {!isLoading && !isError && items.length ? zoom === 'DAY' ? <DayRow items={items} day={days[0] ?? new Date()} resizePreview={resizePreview} onSelect={onSelect} onDragStart={onDragStart} onResize={onResize} onResizeStep={onResizeStep} /> : <WeekRow items={items} days={days} resizePreview={resizePreview} onSelect={onSelect} onDragStart={onDragStart} onResize={onResize} onResizeStep={onResizeStep} /> : null}
        </div>}
        {morePopover ? <DayItemsPopover date={morePopover.date} items={morePopover.items} x={morePopover.x} y={morePopover.y} onSelect={(item) => { setMorePopover(null); onSelect(item); }} onClose={() => setMorePopover(null)} /> : null}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/60 px-5 py-3 text-xs text-muted-foreground"><span>Tasks can move and resize. Focus Sessions and subscriptions are read-only.</span></div>
    </div>
  );
}

export function groupCalendarItems(items: CalendarTimelineItem[]): CalendarGroup[] {
  const map = new Map<string, CalendarGroup>();
  for (const item of items) {
    const isFocus = item.kind === 'FOCUS_SESSION';
    const isExternal = item.kind === 'EXTERNAL_EVENT';
    const isInbox = !isFocus && !isExternal && (!item.sourceId || item.sourceId === 'inbox' || item.sourceName?.toLowerCase() === 'inbox');
    const id = isFocus ? 'focus' : isExternal ? `calendar:${item.sourceId ?? 'calendar'}` : isInbox ? 'project:inbox' : `project:${item.sourceId}`;
    const label = isFocus ? 'Focus' : isExternal ? item.sourceName ?? 'Calendar subscription' : isInbox ? 'Inbox' : item.sourceName ?? 'Inbox';
    const subtitle = isFocus ? 'Focus Sessions' : isExternal ? 'Calendar subscription' : isInbox ? 'Inbox' : 'Project';
    const existing = map.get(id);
    if (existing) existing.items.push({ ...item, color: existing.color });
    else {
      const color = timelineItemColor(item.kind === 'TASK_DUE' && !item.color ? 'TASK_DURATION' : item.kind, item.color);
      map.set(id, { id, label, subtitle, color, items: [{ ...item, color }] });
    }
  }
  const rank = (group: CalendarGroup): [number, string] => group.id === 'project:inbox' ? [0, ''] : group.id.startsWith('project:') ? [1, group.label.toLocaleLowerCase()] : group.id.startsWith('calendar:') ? [2, group.label.toLocaleLowerCase()] : [3, ''];
  return [...map.values()].sort((a, b) => { const [ar, al] = rank(a); const [br, bl] = rank(b); return ar - br || al.localeCompare(bl); });
}

function CalendarAxis({ days, zoom }: { days: Date[]; zoom: TimelineZoom }) {
  const cellWidth = zoom === 'MONTH' ? MONTH_DATE_WIDTH : CALENDAR_DAY_WIDTH;
  return <div className="sticky top-0 z-30 h-16 w-full border-b border-border/70 bg-card select-none"><div className="flex h-full w-full"><div className="sticky left-0 z-40 flex shrink-0 items-center justify-center border-r border-border/60 bg-card p-2" style={{ width: CALENDAR_GUTTER_WIDTH }}><span className="font-mono text-[9px] font-bold uppercase tracking-wider text-muted-foreground/60">TIME</span></div><div className={`${zoom === 'DAY' ? 'relative flex-1' : 'relative grid min-w-0 flex-1 grid-cols-7'}`} style={zoom === 'DAY' ? undefined : { minWidth: days.length * cellWidth }}>{days.map((date) => <div key={date.toISOString()} className={`flex h-full min-w-0 flex-col justify-center overflow-hidden border-r border-border/60 px-3 ${isSameLocalDay(date, new Date()) ? 'bg-primary/[0.06]' : ''}`}><p className="mb-1 truncate font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{date.toLocaleDateString(undefined, { weekday: 'short' })}</p><div className="flex items-baseline gap-1.5"><span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold leading-none ${isSameLocalDay(date, new Date()) ? 'bg-[var(--itu-teal-600)] text-white' : 'text-foreground'}`}>{date.getDate()}</span><span className="truncate text-xs text-muted-foreground">{date.toLocaleDateString(undefined, { month: 'short' })}</span></div></div>)}</div></div></div>;
}

function DayRow({ items, day, resizePreview, onSelect, onDragStart, onResize, onResizeStep }: { items: CalendarTimelineItem[]; day: Date; resizePreview: ResizePreviewState | null; onSelect: (item: CalendarTimelineItem) => void; onDragStart: (item: CalendarTimelineItem, event: DragEvent<HTMLElement>) => void; onResize: (item: CalendarTimelineItem, edge: 'start' | 'end', event: PointerEvent) => void; onResizeStep: (item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) => void }) {
  const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const due = items.filter((item) => item.kind === 'TASK_DUE' || item.allDay);
  const timed = items.filter((item) => item.kind !== 'TASK_DUE' && !item.allDay);
  const collisions = calculateDayCollisions(timed.map((item) => ({ id: item.id, startAt: item.startAt, endAt: item.endAt })));
  const now = new Date();
  return <div className="flex flex-col bg-background">
    {due.length ? <div className="sticky top-16 z-40 flex border-b border-border/60 bg-[var(--itu-surface-2)] shadow-md"><div aria-label="Due today" className="sticky left-0 z-40 flex shrink-0 flex-col items-center justify-center border-r border-border/60 bg-card/95 p-1.5" style={{ width: CALENDAR_GUTTER_WIDTH }}><span className="text-center font-mono text-[8.5px] font-bold uppercase tracking-wider text-muted-foreground">ALL-DAY</span><span className="mt-1 rounded-full bg-primary/15 px-1.5 font-mono text-[9px] font-semibold text-primary">{due.length}</span></div><div className="flex min-w-0 flex-1 flex-wrap gap-2 p-2.5">{due.map((item) => <CalendarEventCard key={item.id} item={item} density="compact" onSelect={onSelect} onDragStart={onDragStart} className="max-w-xs flex-1" />)}</div></div> : null}
    <div data-calendar-timed-track className="relative flex min-h-[600px]"><div className="sticky left-0 z-20 shrink-0 border-r border-border/60 bg-card select-none" style={{ width: CALENDAR_GUTTER_WIDTH }}>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="relative flex h-[60px] items-start justify-end border-b border-border/30 pr-3 pt-1 text-right"><span className="whitespace-nowrap font-mono text-[10px] font-semibold text-muted-foreground">{formatHourLabel(hour)}</span></div>)}</div><div data-calendar-day={dayStart.toISOString()} className="relative flex-1 cursor-pointer bg-[var(--itu-surface-2)]/40" style={{ height: 24 * DAY_HOUR_HEIGHT }}>
      {Array.from({ length: 24 }, (_, hour) => <div key={hour} className="pointer-events-none absolute inset-x-0 border-t border-border/60" style={{ top: hour * DAY_HOUR_HEIGHT, height: DAY_HOUR_HEIGHT }}><div className="absolute inset-x-0 border-t border-dashed border-border/20" style={{ top: DAY_HOUR_HEIGHT / 2 }} /></div>)}
      {isSameLocalDay(day, now) ? <div className="pointer-events-none absolute left-0 right-0 z-30 flex items-center" style={{ top: `${(now.getHours() * 60 + now.getMinutes()) / 60 * DAY_HOUR_HEIGHT}px` }}><div className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-sm ring-2 ring-rose-500/30" /><div className="h-[2px] flex-1 bg-rose-500" /><span className="ml-1 rounded bg-rose-500 px-1.5 py-0.5 font-mono text-[9px] font-bold text-white shadow-sm">NOW</span></div> : null}
      {timed.map((item) => { const start = new Date(item.startAt); const end = item.endAt ? new Date(item.endAt) : new Date(start.getTime() + 30 * 60_000); const effectiveStart = start < dayStart ? dayStart : start; const effectiveEnd = end > dayEnd ? dayEnd : end; const top = ((effectiveStart.getTime() - dayStart.getTime()) / 3_600_000) * DAY_HOUR_HEIGHT; const height = Math.max(22, ((effectiveEnd.getTime() - effectiveStart.getTime()) / 3_600_000) * DAY_HOUR_HEIGHT); const placement = collisions.placedItems.get(item.id); const lane = placement?.lane ?? 0; const laneCount = placement?.laneCount ?? 1; const preview = resizePreview?.itemId === item.id; return <CalendarEventCard key={item.id} item={item} orientation="vertical" density={height < 36 ? 'compact' : 'regular'} onSelect={onSelect} onDragStart={onDragStart} onResize={onResize} onResizeStep={onResizeStep} isResizing={preview} activeResizeEdge={preview ? resizePreview!.edge : null} resizeTimeLabel={preview ? formatSingleTime(resizePreview!.edge === 'start' ? resizePreview!.startAt : resizePreview!.endAt) : null} className="absolute z-10 transition-[top,height,left,width] duration-100" style={{ top: `${top}px`, height: `${height}px`, left: `calc(${lane / laneCount * 100}% + 2px)`, width: `calc(${1 / laneCount * 100}% - 4px)` }} />; })}
    </div></div>
  </div>;
}

function WeekRow({ items, days, resizePreview, onSelect, onDragStart, onResize, onResizeStep }: { items: CalendarTimelineItem[]; days: Date[]; resizePreview: ResizePreviewState | null; onSelect: (item: CalendarTimelineItem) => void; onDragStart: (item: CalendarTimelineItem, event: DragEvent<HTMLElement>) => void; onResize: (item: CalendarTimelineItem, edge: 'start' | 'end', event: PointerEvent) => void; onResizeStep: (item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) => void }) {
  const cellWidth = CALENDAR_DAY_WIDTH;
  const weekStart = days[0] ?? new Date();
  const entries = items.map((item) => { const startDay = localDayIndex(item.startAt, weekStart); let endDay = item.endAt ? localDayIndex(item.endAt, weekStart) : startDay; if (item.endAt && new Date(item.endAt).getHours() === 0 && new Date(item.endAt).getMinutes() === 0) endDay = Math.max(startDay, endDay - 1); return { item, startDay, endDay, start: Math.max(0, startDay), end: Math.min(6, endDay), span: endDay > startDay || (Boolean(item.endAt) && !isSameLocalDay(item.startAt, item.endAt!)) }; }).filter((entry) => entry.start <= 6 && entry.end >= 0);
  const headers = entries.filter((entry) => entry.item.allDay || entry.item.kind === 'TASK_DUE' || entry.span);
  const timed = entries.filter((entry) => !headers.includes(entry));
  const occupancy: boolean[][] = Array.from({ length: 7 }, () => []);
  const placedHeaders = headers.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start)).map((entry) => { let row = 1; while (occupancy.slice(entry.start, entry.end + 1).some((cell) => cell[row])) row += 1; for (let day = entry.start; day <= entry.end; day += 1) occupancy[day][row] = true; return { ...entry, row }; });
  const timedPlacementsByDay = days.map((day, dayIdx) => {
    const dayStart = new Date(day); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
    const dayTimedEntries = timed.filter(({ item }) => {
      const itemStart = new Date(item.startAt);
      const itemEnd = item.endAt ? new Date(item.endAt) : new Date(itemStart.getTime() + 30 * 60_000);
      return itemStart < dayEnd && itemEnd >= dayStart;
    });
    const placedItems = calculateDayCollisions(dayTimedEntries.map(({ item }) => ({ id: item.id, startAt: item.startAt, endAt: item.endAt }))).placedItems;
    return { dayIdx, dayStart, dayEnd, dayTimedEntries, placedItems };
  });
  const gridHeight = 24 * DAY_HOUR_HEIGHT;
  return <div className="flex w-full flex-col bg-background">
    {placedHeaders.length ? <div className="sticky top-16 z-40 flex w-full border-b border-border/60 bg-[var(--itu-surface-2)]"><div className="sticky left-0 z-40 flex shrink-0 flex-col items-center justify-center border-r border-border/60 bg-card/95 p-1.5" style={{ width: CALENDAR_GUTTER_WIDTH }}><span className="text-center font-mono text-[8.5px] font-bold uppercase tracking-wider text-muted-foreground">ALL-DAY</span><span className="mt-1 rounded-full bg-primary/15 px-1.5 font-mono text-[9px] font-semibold text-primary">{placedHeaders.length}</span></div><div className="relative grid min-w-0 flex-1 grid-cols-7 gap-y-1.5 overflow-hidden p-2.5" style={{ minWidth: 7 * cellWidth }}>{placedHeaders.map(({ item, start, end, span, row }) => <div key={item.id} className="px-1" style={{ gridColumn: `${start + 1} / ${end + 2}`, gridRow: row }}><CalendarEventCard item={item} isSpanning={span} numCols={end - start + 1} density="compact" onSelect={onSelect} onDragStart={onDragStart} onResize={onResize} onResizeStep={onResizeStep} /></div>)}</div></div> : null}
    <div className="relative flex w-full" style={{ height: gridHeight }}><div className="sticky left-0 z-20 shrink-0 border-r border-border/60 bg-card select-none" style={{ width: CALENDAR_GUTTER_WIDTH }}>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="relative flex h-[60px] items-start justify-end border-b border-border/30 pr-3 pt-1"><span className="whitespace-nowrap font-mono text-[10px] font-semibold text-muted-foreground">{formatHourLabel(hour)}</span></div>)}</div><div className="relative grid min-w-0 flex-1 grid-cols-7" style={{ height: gridHeight, minWidth: 7 * cellWidth }}>{Array.from({ length: 24 }, (_, hour) => <div key={hour} className="pointer-events-none absolute inset-x-0 border-t border-border/60" style={{ top: hour * DAY_HOUR_HEIGHT, height: DAY_HOUR_HEIGHT }}><div className="absolute inset-x-0 border-t border-dashed border-border/20" style={{ top: DAY_HOUR_HEIGHT / 2 }} /></div>)}{days.map((date, index) => <div key={date.toISOString()} data-calendar-day={date.toISOString()} className={`relative border-r border-border/40 ${isSameLocalDay(date, new Date()) ? 'bg-primary/[0.04]' : ''}`} style={{ gridColumn: `${index + 1} / ${index + 2}`, height: gridHeight }} />)}{timedPlacementsByDay.flatMap(({ dayIdx, dayStart, dayEnd, dayTimedEntries, placedItems }) => dayTimedEntries.map(({ item }) => { const start = new Date(item.startAt); const end = item.endAt ? new Date(item.endAt) : new Date(start.getTime() + 30 * 60_000); const effectiveStart = start < dayStart ? dayStart : start; const effectiveEnd = end > dayEnd ? dayEnd : end; const top = ((effectiveStart.getTime() - dayStart.getTime()) / 3_600_000) * DAY_HOUR_HEIGHT; const height = Math.max(22, ((effectiveEnd.getTime() - effectiveStart.getTime()) / 3_600_000) * DAY_HOUR_HEIGHT); const placement = placedItems.get(item.id); const lane = placement?.lane ?? 0; const laneCount = placement?.laneCount ?? 1; const preview = resizePreview?.itemId === item.id; return <CalendarEventCard key={`${item.id}-${dayIdx}`} item={item} orientation="vertical" density={height < 36 ? 'compact' : 'regular'} onSelect={onSelect} onDragStart={onDragStart} onResize={onResize} onResizeStep={onResizeStep} isResizing={preview} activeResizeEdge={preview ? resizePreview!.edge : null} resizeTimeLabel={preview ? formatSingleTime(resizePreview!.edge === 'start' ? resizePreview!.startAt : resizePreview!.endAt) : null} className="absolute z-10" style={{ top: `${top}px`, height: `${height}px`, left: `calc(${(dayIdx + lane / laneCount) / 7 * 100}% + 2px)`, width: `calc(${(1 / laneCount) / 7 * 100}% - 4px)` }} />; }))}</div></div>
  </div>;
}

function MonthGrid({ anchor, days, groups, firstDayOfWeek, onSelect, onDragStart, onMore }: { anchor: Date; days: Date[]; groups: CalendarGroup[]; firstDayOfWeek: 0 | 1; onSelect: (item: CalendarTimelineItem) => void; onDragStart: (item: CalendarTimelineItem, event: DragEvent<HTMLElement>) => void; onMore: (date: Date, items: CalendarTimelineItem[], event: MouseEvent<HTMLElement>) => void }) {
  const weeks = chunkWeeks(days); const allItems = groups.flatMap((group) => group.items); const semantic = semanticMonthRange(anchor); const labels = Array.from({ length: 7 }, (_, index) => { const date = new Date(2026, 7, 9 + index); return date.toLocaleDateString(undefined, { weekday: 'short' }); }); const ordered = firstDayOfWeek === 1 ? [...labels.slice(1), labels[0]] : labels;
  return <div className="select-none bg-[var(--itu-surface-2)]"><div className="sticky top-0 z-20 grid grid-cols-7 border-b-2 border-border bg-card/95 backdrop-blur">{ordered.map((label, index) => <div key={`${label}-${index}`} className="border-l border-border/50 px-2 py-2 first:border-l-0"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</p></div>)}</div>{weeks.map((week, weekIndex) => { const weekStart = new Date(week[0]); weekStart.setHours(0, 0, 0, 0); const weekItems = allItems.filter((item) => itemSpansDay(item, week[0]) || itemSpansDay(item, week[6])); const layout = layoutMonthWeek(weekItems.map((item) => ({ id: item.id, start: new Date(item.startAt), end: item.endAt ? new Date(item.endAt) : new Date(new Date(item.startAt).getTime() + 30 * 60_000) })), weekStart); const byId = new Map(weekItems.map((item) => [item.id, item])); return <div key={weekIndex} className="relative grid grid-cols-7 border-b border-border/60" style={{ minHeight: MONTH_DATE_HEADER_HEIGHT + MAX_VISIBLE_MONTH_LANES * (MONTH_LANE_HEIGHT + MONTH_LANE_GAP) + 12 }}>{week.map((date, dayIndex) => { const outside = date.getMonth() !== semantic.from.getMonth(); const today = isSameLocalDay(date, new Date()); const dayItems = weekItems.filter((item) => itemSpansDay(item, date)); const hidden = layout.hiddenCounts[dayIndex] ?? 0; return <div key={date.toISOString()} data-calendar-day={date.toISOString()} className={`min-h-[135px] border-l border-border/50 first:border-l-0 ${outside ? 'bg-black/[0.03]' : ''} ${today ? 'bg-primary/[0.05]' : ''}`}><div className="flex items-center justify-between px-2 pt-1.5" style={{ height: MONTH_DATE_HEADER_HEIGHT }}><span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold leading-none ${today ? 'bg-[var(--itu-teal-600)] text-white' : outside ? 'text-muted-foreground/60' : 'text-foreground'}`}>{date.getDate()}</span>{hidden ? <button type="button" onClick={(event) => onMore(date, dayItems, event)} className="rounded-full px-1.5 font-mono text-[9.5px] font-semibold text-muted-foreground" aria-label={`${hidden} more items on ${date.toLocaleDateString()}`}>+{hidden} more</button> : null}</div></div>; })}<div className="pointer-events-none absolute inset-x-0" style={{ top: MONTH_DATE_HEADER_HEIGHT, bottom: 6 }}>{layout.segments.filter((segment) => segment.lane < MAX_VISIBLE_MONTH_LANES).map((segment) => { const item = byId.get(segment.id); if (!item) return null; return <div key={`${segment.id}-${weekIndex}`} className="pointer-events-auto absolute px-0.5" style={{ left: `${segment.dayStart / 7 * 100}%`, width: `${(segment.dayEnd - segment.dayStart) / 7 * 100}%`, top: segment.lane * (MONTH_LANE_HEIGHT + MONTH_LANE_GAP), height: MONTH_LANE_HEIGHT }}><CalendarEventCard item={item} density="compact" onSelect={onSelect} onDragStart={onDragStart} className="h-full" /></div>; })}</div></div>; })}</div>;
}

export function ReadonlyDetails({ item, onClose }: { item: CalendarTimelineItem; onClose: () => void }) {
  const startDate = new Date(item.startAt);
  const endDate = item.endAt ? new Date(item.endAt) : null;
  const dateLabel = startDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeLabel = item.allDay ? 'All day' : formatSingleTime(item.startAt) + (endDate ? ` – ${formatSingleTime(item.endAt!)}` : '');
  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const showTimeZone = Boolean(item.timeZone && item.timeZone !== localTimeZone);
  const descriptionLines = item.description?.split(/\n|\\n/).map((line) => line.trim()).filter(Boolean) ?? [];
  const locationHref = item.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}` : undefined;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return <div className="fixed inset-0 z-40 grid place-items-center bg-black/20 p-4" role="dialog" aria-label={`${item.title} details`} onClick={onClose}>
    <div className="w-full max-w-md rounded-[var(--itu-radius-l)] border border-border bg-card text-card-foreground shadow-[var(--itu-shadow-pop)]" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4 border-b border-border/60 p-5 pb-4"><div className="min-w-0 flex-1"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Calendar event</p><h2 className="mt-1 text-lg font-semibold leading-snug">{item.title}</h2></div><Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">Close</Button></div>
      <div className="grid divide-y divide-border/50 px-5">
        <div className="flex items-center gap-3 py-3"><CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="text-sm font-medium">{item.sourceName ?? 'Calendar'}</span></div>
        <div className="flex items-start gap-3 py-3"><span className="mt-0.5 h-4 w-4 shrink-0 text-center font-mono text-[10px] font-bold text-muted-foreground" aria-hidden="true">⏰</span><div className="text-sm"><p className="font-medium">{dateLabel}</p><p className="text-muted-foreground">{timeLabel}{showTimeZone ? <span className="ml-1.5 rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px]">{item.timeZone}</span> : null}</p></div></div>
        {item.location ? <div className="flex items-start gap-3 py-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />{locationHref ? <a href={locationHref} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline-offset-2 hover:underline">{item.location}</a> : <span className="text-sm">{item.location}</span>}</div> : null}
        {descriptionLines.length ? <div className="flex items-start gap-3 py-3"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="min-w-0 flex-1 space-y-0.5 text-sm text-foreground">{descriptionLines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div></div> : null}
      </div>
      <div className="px-5 pb-4 pt-2"><p className="text-[10px] text-muted-foreground">Read-only · synced from external calendar</p></div>
    </div>
  </div>;
}

function DayItemsPopover({ date, items, x, y, onSelect, onClose }: { date: Date; items: CalendarTimelineItem[]; x: number; y: number; onSelect: (item: CalendarTimelineItem) => void; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const positioned = { left: Math.min(x, window.innerWidth - 340), top: Math.min(y, window.innerHeight - 420) };
  return <><div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" /><div className="fixed z-50 w-80 overflow-hidden rounded-[14px] border border-border bg-card shadow-[var(--itu-shadow-pop)]" style={positioned} role="dialog" aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} events`}><div className="border-b border-border/60 bg-[image:var(--itu-gradient-deep)] px-4 py-3 text-[#f4faf7]"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--itu-teal-400)]">Day</p><h3 className="mt-0.5 text-sm font-semibold">{date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3></div><div className="max-h-72 divide-y divide-border/40 overflow-y-auto p-2 space-y-1.5">{items.map((item) => <CalendarEventCard key={item.id} item={item} density="compact" onSelect={(selected) => { onClose(); onSelect(selected); }} />)}</div></div></>;
}

function CalendarStatus({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="flex min-h-32 items-center justify-center gap-3 border-b border-border/60 p-8 text-center" role="status"><CalendarDays className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" /><div><p className="text-sm font-semibold text-foreground">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p>{action ? <div className="mt-3">{action}</div> : null}</div></div>; }
function formatHourLabel(hour: number) { const value = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour; return `${value} ${hour < 12 ? 'AM' : 'PM'}`; }

export type { CalendarTimelineProps };
