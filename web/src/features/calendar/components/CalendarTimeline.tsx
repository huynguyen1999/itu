import type { DragEvent, MouseEvent, PointerEvent, ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarDays, FileText, MapPin } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { CalendarTimelineItem } from '@/shared/api/client';
import { CalendarEventCard } from '../CalendarEventCard';
import { CalendarAxis, DayRow, MonthGrid, WeekRow } from './CalendarTimelineViews';
import { CalendarHoverPopover } from './CalendarHoverPopover';
import { CALENDAR_DAY_WIDTH, CALENDAR_GUTTER_WIDTH, formatSingleTime, type TimelineZoom, timelineItemColor } from '../timeline';
import type { ResizePreviewState } from '../calendar.types';

export type CalendarGroup = { id: string; label: string; subtitle: string; color: string; items: CalendarTimelineItem[] };

type CalendarTimelineProps = {
  trackRef: RefObject<HTMLDivElement | null>;
  groups: CalendarGroup[];
  days: Date[];
  zoom: TimelineZoom;
  itemCount: number;
  rangeLabel: string;
  anchor: Date;
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

export function CalendarTimeline({ trackRef, groups, days, zoom, itemCount, rangeLabel, anchor, isLoading, isError, onRetry, collapsedGroupIds, onToggleGroup, onSelect, onDragStart, onResize, onResizeStep, onDrop, resizePreview }: CalendarTimelineProps) {
  const [morePopover, setMorePopover] = useState<{ date: Date; items: CalendarTimelineItem[]; x: number; y: number } | null>(null);
  const [hoveredState, setHoveredState] = useState<{ item: CalendarTimelineItem; targetRect: DOMRect } | null>(null);
  const enterTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);

  const closeHover = useCallback(() => {
    if (enterTimerRef.current) {
      window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    setHoveredState(null);
  }, []);

  const handleItemHover = useCallback((item: CalendarTimelineItem, element: HTMLElement | null) => {
    if (enterTimerRef.current) {
      window.clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }

    if (element) {
      const rect = element.getBoundingClientRect();
      enterTimerRef.current = window.setTimeout(() => {
        setHoveredState({ item, targetRect: rect });
      }, 180);
    } else {
      leaveTimerRef.current = window.setTimeout(() => {
        setHoveredState(null);
      }, 140);
    }
  }, []);

  const handlePopoverMouseEnter = useCallback(() => {
    if (leaveTimerRef.current) {
      window.clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const handlePopoverMouseLeave = useCallback(() => {
    leaveTimerRef.current = window.setTimeout(() => {
      setHoveredState(null);
    }, 140);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (enterTimerRef.current) window.clearTimeout(enterTimerRef.current);
      if (leaveTimerRef.current) window.clearTimeout(leaveTimerRef.current);
    };
  }, []);

  const items = groups.flatMap((group) => collapsedGroupIds.includes(group.id) ? [] : group.items);
  const timelineViewportClass = zoom === 'MONTH' ? 'max-h-[calc(100vh-220px)]' : 'h-[calc(100vh-220px)] min-h-0';
  const interactions = {
    resizePreview,
    onSelect: (item: CalendarTimelineItem) => {
      closeHover();
      onSelect(item);
    },
    onHover: handleItemHover,
    onDragStart: (item: CalendarTimelineItem, event: DragEvent<HTMLElement>) => {
      closeHover();
      onDragStart(item, event);
    },
    onResize: (item: CalendarTimelineItem, edge: 'start' | 'end', event: PointerEvent) => {
      closeHover();
      onResize(item, edge, event);
    },
    onResizeStep,
  };

  return <div className="overflow-clip rounded-[var(--itu-radius-m)] border border-border/70 bg-card shadow-[var(--itu-shadow-card)]">
    {zoom !== 'DAY' ? <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-[image:var(--itu-gradient-deep)] px-4 py-2.5 text-[#f4faf7]"><div><p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--itu-teal-400)]">Schedule overview · source timeline</p><h2 className="text-base font-semibold leading-tight">{rangeLabel}</h2></div><div className="font-mono text-[11px] text-white/70">{itemCount} items · {groups.length} sources</div></div> : null}
    {groups.length ? <div className="flex flex-wrap gap-1.5 border-b border-border/60 bg-card px-3.5 py-1.5" aria-label="Calendar source groups">{groups.map((group) => { const collapsed = collapsedGroupIds.includes(group.id); return <button key={group.id} type="button" aria-expanded={!collapsed} onClick={() => onToggleGroup(group.id)} className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-tight text-muted-foreground transition-colors hover:bg-[var(--itu-surface-2)] hover:text-foreground" style={{ borderColor: group.color }}><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: group.color }} />{group.label} · {group.items.length}</button>; })}</div> : null}
    <div ref={trackRef} onScroll={closeHover} className={`${timelineViewportClass} overflow-auto bg-[var(--itu-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring`} onDragOver={(event) => event.preventDefault()} onDrop={onDrop} tabIndex={0} aria-label="Calendar source timeline">
      {zoom === 'MONTH' ? <MonthGrid anchor={anchor} days={days} groups={groups.filter((group) => !collapsedGroupIds.includes(group.id))} onSelect={interactions.onSelect} onHover={handleItemHover} onDragStart={interactions.onDragStart} onMore={(date, dayItems, event) => { closeHover(); const rect = event.currentTarget.getBoundingClientRect(); setMorePopover({ date, items: dayItems, x: rect.left + rect.width / 2, y: rect.bottom + 8 }); }} /> : <div className="min-w-full" style={{ width: `max(100%, ${CALENDAR_GUTTER_WIDTH + days.length * CALENDAR_DAY_WIDTH}px)` }}>
        <CalendarAxis days={days} zoom={zoom} />
        {isLoading ? <CalendarStatus title="Loading your calendar…" description="Fetching tasks, Due Dates, Focus Sessions, and subscriptions." /> : null}
        {isError ? <CalendarStatus title="Calendar could not be loaded" description="The timeline request failed." action={<Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>} /> : null}
        {!isLoading && !isError && !items.length ? <CalendarStatus title="Nothing scheduled for this range" description="Arrange an unfinished task or connect a calendar source to begin." /> : null}
        {!isLoading && !isError && items.length ? zoom === 'DAY' ? <DayRow items={items} day={days[0] ?? new Date()} {...interactions} /> : <WeekRow items={items} days={days} {...interactions} /> : null}
      </div>}
      {morePopover ? <DayItemsPopover date={morePopover.date} items={morePopover.items} x={morePopover.x} y={morePopover.y} onHover={handleItemHover} onSelect={(item) => { closeHover(); setMorePopover(null); onSelect(item); }} onClose={() => setMorePopover(null)} /> : null}
      <CalendarHoverPopover
        item={hoveredState?.item ?? null}
        targetRect={hoveredState?.targetRect ?? null}
        isOpen={Boolean(hoveredState)}
        onMouseEnter={handlePopoverMouseEnter}
        onMouseLeave={handlePopoverMouseLeave}
        onClose={closeHover}
      />
    </div>
    <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground"><span>Tasks can move and resize. Focus Sessions and subscriptions are read-only.</span></div>
  </div>;
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
  return <div className="fixed inset-0 z-40 grid place-items-center bg-black/20 p-4" role="dialog" aria-label={`${item.title} details`} onClick={onClose}><div className="w-full max-w-md rounded-[var(--itu-radius-l)] border border-border bg-card text-card-foreground shadow-[var(--itu-shadow-pop)]" onClick={(event) => event.stopPropagation()}><div className="flex items-start justify-between gap-4 border-b border-border/60 p-5 pb-4"><div className="min-w-0 flex-1"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Calendar event</p><h2 className="mt-1 text-lg font-semibold leading-snug">{item.title}</h2></div><Button variant="ghost" size="sm" onClick={onClose} className="shrink-0">Close</Button></div><div className="grid divide-y divide-border/50 px-5"><div className="flex items-center gap-3 py-3"><CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><span className="text-sm font-medium">{item.sourceName ?? 'Calendar'}</span></div><div className="flex items-start gap-3 py-3"><span className="mt-0.5 h-4 w-4 shrink-0 text-center font-mono text-[10px] font-bold text-muted-foreground" aria-hidden="true">⏰</span><div className="text-sm"><p className="font-medium">{dateLabel}</p><p className="text-muted-foreground">{timeLabel}{showTimeZone ? <span className="ml-1.5 rounded-sm bg-muted px-1 py-0.5 font-mono text-[10px]">{item.timeZone}</span> : null}</p></div></div>{item.location ? <div className="flex items-start gap-3 py-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />{locationHref ? <a href={locationHref} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline-offset-2 hover:underline">{item.location}</a> : <span className="text-sm">{item.location}</span>}</div> : null}{descriptionLines.length ? <div className="flex items-start gap-3 py-3"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" /><div className="min-w-0 flex-1 space-y-0.5 text-sm text-foreground">{descriptionLines.map((line, index) => <p key={`${line}-${index}`}>{line}</p>)}</div></div> : null}</div><div className="px-5 pb-4 pt-2"><p className="text-[10px] text-muted-foreground">Read-only · synced from external calendar</p></div></div></div>;
}

function DayItemsPopover({ date, items, x, y, onSelect, onHover, onClose }: { date: Date; items: CalendarTimelineItem[]; x: number; y: number; onSelect: (item: CalendarTimelineItem) => void; onHover?: (item: CalendarTimelineItem, element: HTMLElement | null) => void; onClose: () => void }) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);
  const positioned = { left: Math.min(x, window.innerWidth - 340), top: Math.min(y, window.innerHeight - 420) };
  return <><div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" /><div className="fixed z-50 w-80 overflow-hidden rounded-[14px] border border-border bg-card shadow-[var(--itu-shadow-pop)]" style={positioned} role="dialog" aria-label={`${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} events`}><div className="border-b border-border/60 bg-[image:var(--itu-gradient-deep)] px-4 py-3 text-[#f4faf7]"><p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--itu-teal-400)]">Day</p><h3 className="mt-0.5 text-sm font-semibold">{date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3></div><div className="max-h-72 divide-y divide-border/40 overflow-y-auto p-2 space-y-1.5">{items.map((item) => <CalendarEventCard key={item.id} item={item} density="compact" onHover={onHover} onSelect={(selected) => { onClose(); onSelect(selected); }} />)}</div></div></>;
}

function CalendarStatus({ title, description, action }: { title: string; description: string; action?: ReactNode }) { return <div className="flex min-h-32 items-center justify-center gap-3 border-b border-border/60 p-8 text-center" role="status"><CalendarDays className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" /><div><p className="text-sm font-semibold text-foreground">{title}</p><p className="mt-1 text-xs text-muted-foreground">{description}</p>{action ? <div className="mt-3">{action}</div> : null}</div></div>; }

export type { CalendarTimelineProps };
