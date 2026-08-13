import type { CSSProperties } from 'react';
import type { CalendarTimelineItem } from '@/shared/api/client';
import { formatSingleTime, isSameLocalDay, timelineItemColor } from './timeline';

export type CalendarEventCardDensity = 'regular' | 'compact';
export type CalendarEventCardVariant = 'timeline' | 'board' | 'monthChip' | 'regular' | 'compact';

export interface CalendarEventCardProps {
  item: CalendarTimelineItem;
  density?: CalendarEventCardDensity;
  variant?: CalendarEventCardVariant;
  orientation?: 'horizontal' | 'vertical';
  day?: Date;
  isSpanning?: boolean;
  numCols?: number;
  startDayLabel?: string;
  endDayLabel?: string;
  overflowsPrev?: boolean;
  overflowsNext?: boolean;
  onSelect: (item: CalendarTimelineItem) => void;
  onDragStart?: (item: CalendarTimelineItem, event: React.DragEvent<HTMLElement>) => void;
  onResize?: (item: CalendarTimelineItem, edge: 'start' | 'end', event: React.PointerEvent) => void;
  onResizeStep?: (item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) => void;
  isResizing?: boolean;
  activeResizeEdge?: 'start' | 'end' | null;
  resizeTimeLabel?: string | null;
  className?: string;
  style?: CSSProperties;
}

function itemLabel(item: CalendarTimelineItem): string {
  if (item.kind === 'TASK_DUE') return 'Due Date';
  if (item.kind === 'FOCUS_SESSION') return 'Focus Session';
  if (item.kind === 'EXTERNAL_EVENT') return 'Subscription';
  return 'Task';
}

function calcSpanningDuration(startAt: string | Date, endAt: string | Date): string {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  const diffMins = Math.max(0, (end - start) / 60_000);
  const hrs = diffMins / 60;
  return hrs % 1 === 0 ? `${hrs}h` : `${hrs.toFixed(1)}h`;
}

function tintStyles(color: string, isCompact: boolean) {
  const isHex = color.startsWith('#');
  if (isCompact) {
    return {
      backgroundColor: isHex ? `${color}26` : 'rgba(45, 212, 191, 0.16)',
      borderColor: isHex ? `${color}55` : 'rgba(45, 212, 191, 0.35)',
    };
  }
  return {
    backgroundColor: isHex ? `${color}24` : color.startsWith('var') ? 'rgba(45, 212, 191, 0.14)' : `${color}`,
    borderColor: isHex ? `${color}60` : color.startsWith('var') ? 'rgba(45, 212, 191, 0.38)' : 'rgba(255, 255, 255, 0.25)',
  };
}

/**
 * Common visual event card component across Day, Week, Month, and Month Popover.
 * Hierarchical structure: Accent rail | Title | Divider | Time section (Start ↓ End or Due time).
 * Layout wrappers own absolute geometry, positioning, and lanes.
 */
export function CalendarEventCard({
  item,
  density,
  variant,
  orientation = 'horizontal',
  day,
  isSpanning,
  numCols,
  startDayLabel,
  endDayLabel,
  overflowsPrev,
  overflowsNext,
  onSelect,
  onDragStart,
  onResize,
  onResizeStep,
  isResizing = false,
  activeResizeEdge = null,
  resizeTimeLabel = null,
  className = '',
  style,
}: CalendarEventCardProps) {
  // Resolve effective density (regular vs compact)
  const isCompact = density === 'compact' || variant === 'monthChip' || variant === 'compact';
  const color = timelineItemColor(item.kind, item.color);
  const label = itemLabel(item);
  const hasDuration = !item.allDay && Boolean(item.endAt);
  const sameDay = hasDuration && isSameLocalDay(item.startAt, item.endAt!);
  const isSpanningItem = Boolean(isSpanning) || (hasDuration && !sameDay);
  const isDueOnly = item.kind === 'TASK_DUE' || (item.allDay && Boolean(item.dueAt));
  const tint = tintStyles(color, isCompact);
  const showResizeHandles = onResize && item.kind === 'TASK_DURATION' && !item.readOnly;
  const isVertical = orientation === 'vertical';

  const durationText = (isSpanningItem && hasDuration) ? calcSpanningDuration(item.startAt, item.endAt!) : null;
  const hasPositionClass = /\b(relative|absolute|fixed|sticky)\b/.test(className);
  const positionClass = hasPositionClass ? '' : 'relative';

  // Multi-column Grid Spanning Card Layout (Week View)
  if (isSpanningItem && numCols && numCols > 0 && !isCompact) {
    const midnightLines: React.ReactNode[] = [];
    if (numCols > 1) {
      for (let i = 1; i < numCols; i++) {
        const pct = (i / numCols) * 100;
        midnightLines.push(
          <div
            key={i}
            className="absolute top-0 bottom-0 pointer-events-none z-10 border-l border-dashed border-emerald-400/40"
            style={{ left: `${pct}%` }}
          >
            <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-background px-1 py-0.5 font-mono text-[8px] font-bold text-emerald-400 border border-emerald-500/40 shadow-sm">
              00:00
            </span>
          </div>
        );
      }
    }

    return (
      <div
        role="button"
        tabIndex={0}
        draggable={!item.readOnly && Boolean(onDragStart) && !isResizing}
        onDragStart={(event) => onDragStart?.(item, event)}
        onClick={() => onSelect(item)}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(item);
          }
        }}
        aria-label={`${item.title}, ${label}${item.readOnly ? ', read-only' : ', draggable'}`}
        className={`group ${positionClass} overflow-hidden text-left outline-none transition-all duration-150 rounded-[10px] border py-[6px] px-[12px] ${
          overflowsNext ? 'border-r-dashed border-r-emerald-500/70' : ''
        } ${
          overflowsPrev ? 'border-l-dashed border-l-emerald-500/70' : ''
        } ${
          item.readOnly ? 'cursor-default opacity-90' : 'cursor-grab active:cursor-grabbing'
        } ${isResizing ? 'ring-2 ring-primary brightness-110' : 'hover:-translate-y-px hover:brightness-110 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'} ${className}`}
        style={{ ...tint, ...style }}
      >
        {/* Accent Rail */}
        <div
          className="absolute inset-y-0 left-0 w-[3.5px] rounded-l-[10px]"
          style={{ backgroundColor: color }}
        />

        {/* Midnight Lines */}
        {midnightLines}

        {/* Header Row: Title & Duration Badge */}
        <div className="flex items-start justify-between gap-2 relative z-20">
          <p className="m-0 font-semibold text-[12px] leading-snug text-foreground line-clamp-1">
            {item.title}
          </p>
          {durationText ? (
            <span className="shrink-0 rounded bg-black/40 px-1.5 py-0.5 font-mono text-[9px] font-bold text-emerald-300 border border-emerald-500/30">
              {durationText}
            </span>
          ) : null}
        </div>

        {/* Timeline Nodes Row */}
        <div className="mt-1 pt-1 border-t border-white/10 flex items-center justify-between font-mono text-[9.5px] relative z-20">
          <div className="flex flex-col items-start leading-tight">
            <span className="font-bold text-foreground text-[10px]">{formatSingleTime(item.startAt)}</span>
            <span className="text-[8px] uppercase tracking-wider text-muted-foreground/80 font-sans font-semibold">
              {startDayLabel ?? 'START'}
            </span>
          </div>

          <div className="flex flex-col items-end leading-tight">
            <span className="font-bold text-foreground text-[10px]">
              {item.endAt ? formatSingleTime(item.endAt) : 'END'}
            </span>
            <span className="text-[8px] uppercase tracking-wider text-muted-foreground/80 font-sans font-semibold">
              {endDayLabel ?? 'END'}
            </span>
          </div>
        </div>

        {/* Resize Handles */}
        {showResizeHandles ? (
          <>
            <div
              role="button"
              tabIndex={-1}
              aria-label={`Resize start of ${item.title}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResize!(item, 'start', e);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') onResizeStep?.(item, 'start', -1);
                if (e.key === 'ArrowRight') onResizeStep?.(item, 'start', 1);
              }}
              className="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary/20 z-30"
            />
            <div
              role="button"
              tabIndex={-1}
              aria-label={`Resize end of ${item.title}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResize!(item, 'end', e);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') onResizeStep?.(item, 'end', -1);
                if (e.key === 'ArrowRight') onResizeStep?.(item, 'end', 1);
              }}
              className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary/20 z-30"
            />
          </>
        ) : null}

        {/* Resize Active Floating Tooltip */}
        {isResizing && resizeTimeLabel ? (
          <div
            className={`absolute top-1 z-40 rounded bg-popover px-1.5 py-0.5 font-mono text-[10px] font-bold text-popover-foreground shadow-md ${
              activeResizeEdge === 'start' ? 'left-1' : 'right-1'
            }`}
          >
            {resizeTimeLabel}
          </div>
        ) : null}
      </div>
    );
  }

  const isStartDay = day ? isSameLocalDay(item.startAt, day) : true;
  const isEndDay = day ? isSameLocalDay(item.endAt!, day) : true;
  const isMiddleDay = day ? (!isStartDay && !isEndDay) : false;

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!item.readOnly && Boolean(onDragStart) && !isResizing}
      onDragStart={(event) => onDragStart?.(item, event)}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect(item);
        }
      }}
      aria-label={`${item.title}, ${label}${item.readOnly ? ', read-only' : ', draggable'}`}
      className={`group ${positionClass} overflow-hidden text-left outline-none transition-all duration-150 ${
        isCompact
          ? 'rounded-[6px] border py-[3px] pl-[10px] pr-[6px]'
          : 'rounded-[10px] border py-[5px] pl-[11px] pr-[6px]'
      } ${
        isSpanningItem && isStartDay && !isEndDay
          ? 'rounded-r-none border-r-dashed border-r-primary/50'
          : isSpanningItem && isEndDay && !isStartDay
            ? 'rounded-l-none border-l-dashed border-l-primary/50'
            : isSpanningItem && isMiddleDay
              ? 'rounded-none border-x-dashed border-x-primary/50'
              : ''
      } ${
        item.readOnly ? 'cursor-default opacity-90' : 'cursor-grab active:cursor-grabbing'
      } ${isResizing ? 'ring-2 ring-primary brightness-110' : 'hover:-translate-y-px hover:brightness-110 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1'} ${className}`}
      style={{ ...tint, ...style }}
    >
      {/* Accent Rail */}
      <div
        className={`absolute inset-y-0 left-0 ${
          isCompact ? 'w-[2.5px] rounded-l-[6px]' : 'w-[3.5px] rounded-l-[10px]'
        }`}
        style={{ backgroundColor: color }}
      />

      {/* Header Row: Title & Optional Duration Badge */}
      <div className="flex items-start justify-between gap-1.5">
        <p
          className={`m-0 font-semibold leading-[1.3] text-foreground ${
            isCompact ? 'text-[10.5px] line-clamp-1' : 'text-[12px] line-clamp-2'
          }`}
          style={!isCompact ? { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } : undefined}
        >
          {item.title}
        </p>

        {durationText && !isCompact ? (
          <span className="shrink-0 rounded bg-black/40 px-1 py-0.5 font-mono text-[9px] font-bold text-muted-foreground border border-white/10">
            {durationText}
          </span>
        ) : null}
      </div>

      {/* Time & Due Section */}
      {isDueOnly ? (
        <div
          className={`flex flex-col items-start font-mono ${
            isCompact ? 'mt-0.5 border-t pt-0.5 text-[8.5px]' : 'mt-0.5 border-t pt-[3px] text-[9.5px]'
          }`}
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <span className="leading-tight text-amber-400">
            Due {formatSingleTime(item.dueAt ?? item.startAt)}
          </span>
        </div>
      ) : isSpanningItem && !isCompact ? (
        <div
          className="mt-1 border-t pt-1 font-mono text-[9px] text-muted-foreground flex items-center justify-between"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          {isStartDay ? (
            <>
              <span className="font-semibold text-foreground">{formatSingleTime(item.startAt)}</span>
              <span className="rounded bg-black/40 px-1 text-[8px] font-bold text-emerald-400 border border-emerald-500/30">→ 00:00</span>
            </>
          ) : isEndDay ? (
            <>
              <span className="rounded bg-black/40 px-1 text-[8px] font-bold text-emerald-400 border border-emerald-500/30">00:00 →</span>
              <span className="font-semibold text-foreground">{formatSingleTime(item.endAt!)}</span>
            </>
          ) : (
            <>
              <span className="rounded bg-black/40 px-1 text-[8px] font-bold text-emerald-400 border border-emerald-500/30">00:00 → 24:00</span>
              <span className="text-[8.5px] text-muted-foreground">Full Day</span>
            </>
          )}
        </div>
      ) : hasDuration || item.startAt ? (
        isVertical ? (
          <div className="mt-0.5 font-mono text-[9.5px] leading-tight text-muted-foreground/90 whitespace-nowrap overflow-hidden text-ellipsis">
            {formatSingleTime(item.startAt)}{hasDuration ? ` – ${formatSingleTime(item.endAt!)}` : ''}
          </div>
        ) : (
          <div
            className={`flex flex-col items-start font-mono ${
              isCompact ? 'mt-0.5 border-t pt-0.5 text-[8.5px]' : 'mt-0.5 border-t pt-[3px] text-[9.5px]'
            }`}
            style={{ borderColor: 'rgba(255,255,255,0.08)' }}
          >
            <span className="leading-none text-muted-foreground">
              {formatSingleTime(item.startAt)}
            </span>
            {hasDuration ? (
              <>
                <span className="my-[1px] text-[8px] leading-none text-muted-foreground/40">↓</span>
                <span className="leading-none text-muted-foreground/70 text-[9px]">
                  {formatSingleTime(item.endAt!)}
                </span>
              </>
            ) : null}
          </div>
        )
      ) : null}

      {/* Resize Handles for Editable Task Duration */}
      {showResizeHandles ? (
        isVertical ? (
          <>
            {/* Top Resize Handle (Start) */}
            <div
              role="button"
              tabIndex={-1}
              aria-label={`Resize start of ${item.title}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResize!(item, 'start', e);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') onResizeStep?.(item, 'start', -1);
                if (e.key === 'ArrowDown') onResizeStep?.(item, 'start', 1);
              }}
              className="absolute top-0 inset-x-0 h-2 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary/30 z-30"
            />

            {/* Bottom Resize Handle (End) */}
            <div
              role="button"
              tabIndex={-1}
              aria-label={`Resize end of ${item.title}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResize!(item, 'end', e);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp') onResizeStep?.(item, 'end', -1);
                if (e.key === 'ArrowDown') onResizeStep?.(item, 'end', 1);
              }}
              className="absolute bottom-0 inset-x-0 h-2 cursor-ns-resize opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary/30 z-30"
            />
          </>
        ) : (
          <>
            {/* Left Resize Handle */}
            <div
              role="button"
              tabIndex={-1}
              aria-label={`Resize start of ${item.title}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResize!(item, 'start', e);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') onResizeStep?.(item, 'start', -1);
                if (e.key === 'ArrowRight') onResizeStep?.(item, 'start', 1);
              }}
              className="absolute inset-y-0 left-0 w-2.5 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary/20"
            />

            {/* Right Resize Handle */}
            <div
              role="button"
              tabIndex={-1}
              aria-label={`Resize end of ${item.title}`}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => {
                e.stopPropagation();
                onResize!(item, 'end', e);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft') onResizeStep?.(item, 'end', -1);
                if (e.key === 'ArrowRight') onResizeStep?.(item, 'end', 1);
              }}
              className="absolute inset-y-0 right-0 w-2.5 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-primary/20"
            />
          </>
        )
      ) : null}

      {/* Resize Active Floating Tooltip */}
      {isResizing && resizeTimeLabel ? (
        <div
          className={`absolute top-1 z-30 rounded bg-popover px-1.5 py-0.5 font-mono text-[10px] font-bold text-popover-foreground shadow-md ${
            activeResizeEdge === 'start' ? 'left-1' : 'right-1'
          }`}
        >
          {resizeTimeLabel}
        </div>
      ) : null}
    </div>
  );
}
