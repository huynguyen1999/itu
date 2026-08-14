import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CalendarDays, Clock, FileText, MapPin, Sparkles } from 'lucide-react';
import type { CalendarTimelineItem } from '@/shared/api/client';
import { formatSingleDate, formatSingleTime, isSameLocalDay, timelineItemColor } from '../timeline';

export interface CalendarHoverPopoverProps {
  item: CalendarTimelineItem | null;
  targetRect: DOMRect | null;
  isOpen: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClose?: () => void;
}

const POPOVER_WIDTH = 300;
const GAP = 8;
const VIEWPORT_MARGIN = 12;

function computePopoverCoords(targetRect: DOMRect | null, popoverHeight = 220, popoverWidth = POPOVER_WIDTH) {
  if (!targetRect) return null;
  const viewportW = typeof window !== 'undefined' && window.innerWidth > 0 ? window.innerWidth : 1200;
  const viewportH = typeof window !== 'undefined' && window.innerHeight > 0 ? window.innerHeight : 800;

  const spaceRight = viewportW - targetRect.right - GAP - VIEWPORT_MARGIN;
  const spaceLeft = targetRect.left - GAP - VIEWPORT_MARGIN;
  const spaceTop = targetRect.top - GAP - VIEWPORT_MARGIN;
  const spaceBottom = viewportH - targetRect.bottom - GAP - VIEWPORT_MARGIN;

  let placement = 'right';
  let left = 0;
  let top = 0;

  if (spaceRight >= popoverWidth) {
    placement = 'right';
    left = targetRect.right + GAP;
    top = Math.max(VIEWPORT_MARGIN, Math.min(targetRect.top, viewportH - popoverHeight - VIEWPORT_MARGIN));
  } else if (spaceLeft >= popoverWidth) {
    placement = 'left';
    left = targetRect.left - popoverWidth - GAP;
    top = Math.max(VIEWPORT_MARGIN, Math.min(targetRect.top, viewportH - popoverHeight - VIEWPORT_MARGIN));
  } else if (spaceTop >= popoverHeight) {
    placement = 'top';
    top = targetRect.top - popoverHeight - GAP;
    left = Math.max(VIEWPORT_MARGIN, Math.min(targetRect.left, viewportW - popoverWidth - VIEWPORT_MARGIN));
  } else if (spaceBottom >= popoverHeight) {
    placement = 'bottom';
    top = targetRect.bottom + GAP;
    left = Math.max(VIEWPORT_MARGIN, Math.min(targetRect.left, viewportW - popoverWidth - VIEWPORT_MARGIN));
  } else {
    // Fallback: place on side with more space
    if (spaceRight >= spaceLeft) {
      placement = 'right';
      left = Math.min(targetRect.right + GAP, viewportW - popoverWidth - VIEWPORT_MARGIN);
    } else {
      placement = 'left';
      left = Math.max(VIEWPORT_MARGIN, targetRect.left - popoverWidth - GAP);
    }
    top = Math.max(VIEWPORT_MARGIN, Math.min(targetRect.top, viewportH - popoverHeight - VIEWPORT_MARGIN));
  }

  return { left, top, placement };
}

function formatDuration(startAt: string | Date, endAt: string | Date): string {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const diffMins = Math.max(0, Math.round((end - start) / 60_000));
  const hours = Math.floor(diffMins / 60);
  const minutes = diffMins % 60;
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

function priorityLabel(priority?: string | null): { text: string; color: string } | null {
  if (!priority) return null;
  const p = priority.toUpperCase();
  if (p === 'HIGH' || p === 'P1') return { text: 'P1 High', color: 'text-red-400 bg-red-500/10 border-red-500/30' };
  if (p === 'MEDIUM' || p === 'P2') return { text: 'P2 Med', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
  if (p === 'LOW' || p === 'P3') return { text: 'P3 Low', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };
  return { text: 'P4 None', color: 'text-muted-foreground bg-muted/40 border-border/40' };
}

function statusLabel(status?: string | null): { text: string; color: string } | null {
  if (!status) return null;
  const s = status.toUpperCase();
  if (s === 'COMPLETED') return { text: 'Completed', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
  if (s === 'IN_PROGRESS') return { text: 'In Progress', color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };
  if (s === 'PLANNED') return { text: 'Planned', color: 'text-teal-400 bg-teal-500/10 border-teal-500/30' };
  if (s === 'CANCELED') return { text: 'Canceled', color: 'text-muted-foreground bg-muted/30 border-border/30' };
  return null;
}

export function CalendarHoverPopover({
  item,
  targetRect,
  isOpen,
  onMouseEnter,
  onMouseLeave,
  onClose,
}: CalendarHoverPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ left: number; top: number; placement: string } | null>(() =>
    computePopoverCoords(targetRect),
  );

  // Compute dynamic position based on target element bounding rect & popover height
  useLayoutEffect(() => {
    if (!isOpen || !targetRect) {
      setCoords(null);
      return;
    }

    const popoverEl = popoverRef.current;
    const popoverHeight = popoverEl ? popoverEl.offsetHeight : 220;
    setCoords(computePopoverCoords(targetRect, popoverHeight));
  }, [isOpen, targetRect, item]);

  // Handle ESC key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item || !targetRect) return null;
  const effectiveCoords = coords ?? computePopoverCoords(targetRect);
  if (!effectiveCoords) return null;

  const color = timelineItemColor(item.kind, item.color);
  const isFocus = item.kind === 'FOCUS_SESSION';
  const isExternal = item.kind === 'EXTERNAL_EVENT';
  const isDueOnly = item.kind === 'TASK_DUE' || (item.allDay && Boolean(item.dueAt));
  const hasDuration = !item.allDay && Boolean(item.endAt);
  const sameDay = hasDuration && isSameLocalDay(item.startAt, item.endAt!);

  const priority = priorityLabel(item.priority);
  const status = statusLabel(item.status);
  const durationText = hasDuration ? formatDuration(item.startAt, item.endAt!) : null;

  const localTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const showTimeZone = Boolean(item.timeZone && item.timeZone !== localTimeZone);
  const locationHref = item.location ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}` : undefined;
  const descriptionLines = item.description?.split(/\r?\n|\\n/).map((line) => line.trim()).filter(Boolean) ?? [];

  let kindBadge = 'TASK';
  if (isFocus) kindBadge = 'FOCUS SESSION';
  else if (isDueOnly) kindBadge = 'DUE DATE';
  else if (isExternal) kindBadge = 'CALENDAR EVENT';

  return (
    <div
      ref={popoverRef}
      role="tooltip"
      aria-label={`${item.title} detail preview`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-50 overflow-hidden rounded-[12px] border border-border/80 bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md transition-opacity duration-150 animate-in fade-in zoom-in-95 pointer-events-auto select-text"
      style={{
        left: `${effectiveCoords.left}px`,
        top: `${effectiveCoords.top}px`,
        width: `${POPOVER_WIDTH}px`,
      }}
    >
      {/* Accent Color Rail */}
      <div className="absolute inset-y-0 left-0 w-[3.5px]" style={{ backgroundColor: color }} />

      <div className="pl-3.5 pr-3 py-3 space-y-2.5">
        {/* Header Badges: Kind, Priority, Status */}
        <div className="flex items-center justify-between gap-1.5 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[9px] font-bold tracking-wider uppercase border"
              style={{
                backgroundColor: `${color}18`,
                borderColor: `${color}40`,
                color: color,
              }}
            >
              {isFocus ? <Sparkles className="h-2.5 w-2.5" /> : null}
              {kindBadge}
            </span>

            {priority ? (
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold border ${priority.color}`}>
                {priority.text}
              </span>
            ) : null}

            {status ? (
              <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 font-mono text-[9px] font-semibold border ${status.color}`}>
                {status.text}
              </span>
            ) : null}
          </div>

          {durationText ? (
            <span className="font-mono text-[9.5px] font-bold text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded border border-border/50">
              {durationText}
            </span>
          ) : null}
        </div>

        {/* Title */}
        <h4 className="font-semibold text-[13px] leading-snug text-foreground m-0 line-clamp-3">
          {item.title}
        </h4>

        {/* Source / Calendar Feed Info */}
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-medium text-foreground/90 truncate">
            {item.sourceName ?? (isFocus ? 'Focus' : isExternal ? 'Subscription' : 'Inbox')}
          </span>
        </div>

        {/* Date & Time Section */}
        <div className="rounded-md bg-muted/40 border border-border/40 p-2 space-y-1 font-mono text-[10.5px]">
          <div className="flex items-center gap-1.5 text-foreground">
            <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span>
              {isDueOnly ? (
                <span className="text-amber-400 font-semibold">
                  Due {formatSingleDate(item.dueAt ?? item.startAt)} · {formatSingleTime(item.dueAt ?? item.startAt)}
                </span>
              ) : item.allDay ? (
                <span>All day · {formatSingleDate(item.startAt)}</span>
              ) : (
                <span>
                  {formatSingleDate(item.startAt)} · {formatSingleTime(item.startAt)}
                  {hasDuration ? ` – ${!sameDay ? formatSingleDate(item.endAt!) + ' ' : ''}${formatSingleTime(item.endAt!)}` : ''}
                </span>
              )}
            </span>
          </div>

          {showTimeZone ? (
            <div className="text-[9.5px] text-muted-foreground/80 pl-4.5">
              Timezone: {item.timeZone}
            </div>
          ) : null}
        </div>

        {/* Location if present */}
        {item.location ? (
          <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
            {locationHref ? (
              <a
                href={locationHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline-offset-2 hover:underline truncate"
              >
                {item.location}
              </a>
            ) : (
              <span className="truncate">{item.location}</span>
            )}
          </div>
        ) : null}

        {/* Description / Notes if present */}
        {descriptionLines.length ? (
          <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground/90 border-t border-border/40 pt-2">
            <FileText className="h-3.5 w-3.5 shrink-0 mt-0.5 text-muted-foreground" />
            <div className="min-w-0 flex-1 space-y-0.5">
              {descriptionLines.map((line, index) => (
                <p key={`${line}-${index}`} className="m-0 leading-snug">
                  {line}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        {/* Footer Hint */}
        <div className="border-t border-border/40 pt-2 flex items-center justify-between text-[9.5px] text-muted-foreground/70">
          <span>{item.readOnly ? 'Read-only item' : 'Click to view details · Drag to schedule'}</span>
        </div>
      </div>
    </div>
  );
}
