import type { CSSProperties } from 'react';
import type { CalendarTimelineItem } from '@/shared/api/client';
import { formatSingleTime, isSameLocalDay, timelineItemColor } from './timeline';

export type CalendarEventCardVariant = 'timeline' | 'board' | 'monthChip';

interface CalendarEventCardProps {
  item: CalendarTimelineItem;
  variant: CalendarEventCardVariant;
  onSelect: (item: CalendarTimelineItem) => void;
  onDragStart?: (item: CalendarTimelineItem, event: React.DragEvent<HTMLElement>) => void;
  onResize?: (item: CalendarTimelineItem, edge: 'start' | 'end', event: React.PointerEvent) => void;
  onResizeStep?: (item: CalendarTimelineItem, edge: 'start' | 'end', direction: -1 | 1) => void;
  className?: string;
  style?: CSSProperties;
}

function itemLabel(item: CalendarTimelineItem): string {
  if (item.kind === 'TASK_DUE') return 'Due Date';
  if (item.kind === 'FOCUS_SESSION') return 'Focus Session';
  if (item.kind === 'EXTERNAL_EVENT') return 'Subscription';
  return 'Task';
}

function tintStyles(color: string, variant: CalendarEventCardVariant) {
  const isHex = color.startsWith('#');
  if (variant === 'monthChip') {
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

/** One shared event visual for Day, Week, and Month. Layout wrappers own geometry. */
export function CalendarEventCard({ item, variant, onSelect, onDragStart, onResize, onResizeStep, className = '', style }: CalendarEventCardProps) {
  const color = timelineItemColor(item.kind, item.color);
  const label = itemLabel(item);
  const hasDuration = !item.allDay && Boolean(item.endAt);
  const sameDay = hasDuration && isSameLocalDay(item.startAt, item.endAt!);
  const tint = tintStyles(color, variant);
  const resizeHandles = onResize && item.kind === 'TASK_DURATION' && !item.readOnly;

  if (variant === 'monthChip') {
    return (
      <div
        role="button"
        tabIndex={0}
        draggable={!item.readOnly && Boolean(onDragStart)}
        onDragStart={(event) => onDragStart?.(item, event)}
        onClick={() => onSelect(item)}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item); } }}
        aria-label={`${item.title}, ${label}${item.readOnly ? ', read-only' : ', draggable'}`}
        className={`group flex min-w-0 items-center gap-1.5 overflow-hidden rounded-[5px] border py-[2px] pl-1.5 pr-2 text-left outline-none transition-colors hover:brightness-110 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring ${item.readOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'} ${className}`}
        style={{ ...tint, ...style }}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="truncate text-[10px] font-semibold leading-[1.3] text-foreground">{item.title}</span>
        {hasDuration && sameDay ? (
          <span className="ml-auto shrink-0 font-mono text-[8.5px] leading-none text-muted-foreground">{formatSingleTime(item.startAt)}</span>
        ) : null}
      </div>
    );
  }

  const board = variant === 'board';
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!item.readOnly && Boolean(onDragStart)}
      onDragStart={(event) => onDragStart?.(item, event)}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => { if (event.target !== event.currentTarget) return; if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(item); } }}
      aria-label={`${item.title}, ${label}${item.readOnly ? ', read-only' : ', draggable'}`}
      className={`group overflow-hidden text-left outline-none transition-all duration-150 hover:-translate-y-px hover:brightness-110 focus-visible:z-20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
        board
          ? 'relative w-full rounded-[10px] border pl-[14px] pr-[10px] py-[10px]'
          : 'rounded-[9px] border pl-[12px] pr-[10px] py-[6px]'
      } ${item.readOnly ? 'cursor-default opacity-90' : 'cursor-grab active:cursor-grabbing'} ${className}`}
      style={board ? { ...tint, ...style } : { ...tint, ...style }}
    >
      <div className={`absolute inset-y-0 left-0 ${board ? 'w-[3.5px] rounded-l-[10px]' : 'w-[3px]'}`} style={{ backgroundColor: color }} />
      {board ? (
        <p
          className="m-0 text-[13px] font-semibold leading-[1.35] text-foreground"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 'calc(1.35em * 2)' }}
        >
          {item.title}
        </p>
      ) : (
        <span className="block line-clamp-2 text-[11px] font-semibold leading-tight text-foreground">{item.title}</span>
      )}
      {!item.allDay && (hasDuration || item.startAt) ? (
        board ? (
          <div className="mt-2 flex flex-col items-start gap-px border-t pt-2 font-mono" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
            <span className="text-[11px] leading-snug text-muted-foreground">{formatSingleTime(item.startAt)}</span>
            {hasDuration && sameDay ? (
              <>
                <span className="ml-0.5 text-[9px] leading-none text-muted-foreground/50">↓</span>
                <span className="text-[11px] leading-snug text-muted-foreground/60">{formatSingleTime(item.endAt!)}</span>
              </>
            ) : null}
          </div>
        ) : hasDuration ? (
          sameDay ? (
            <div className="mt-0.5 block overflow-hidden whitespace-nowrap font-mono text-[9.5px] leading-snug text-muted-foreground">
              {formatSingleTime(item.startAt)} – {formatSingleTime(item.endAt!)}
            </div>
          ) : (
            <div className="mt-0.5 flex items-center justify-between font-mono text-[9.5px] leading-snug text-muted-foreground">
              <span className="whitespace-nowrap">{formatSingleTime(item.startAt)}</span>
              <span className="whitespace-nowrap text-right">{formatSingleTime(item.endAt!)}</span>
            </div>
          )
        ) : (
          <span className="mt-0.5 block overflow-hidden whitespace-nowrap font-mono text-[9.5px] leading-snug text-muted-foreground">
            {formatSingleTime(item.startAt)}
          </span>
        )
      ) : null}
      {resizeHandles ? (
        board ? (
          <>
            <button type="button" aria-label={`Resize start of ${item.title}`} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => onResize!(item, 'start', e)} onKeyDown={(e) => { if (e.key === 'ArrowLeft') onResizeStep?.(item, 'start', -1); if (e.key === 'ArrowRight') onResizeStep?.(item, 'start', 1); }} className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
            <button type="button" aria-label={`Resize end of ${item.title}`} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => onResize!(item, 'end', e)} onKeyDown={(e) => { if (e.key === 'ArrowLeft') onResizeStep?.(item, 'start', -1); if (e.key === 'ArrowRight') onResizeStep?.(item, 'end', 1); }} className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
          </>
        ) : (
          <>
            <button type="button" aria-label={`Resize start of ${item.title}`} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => onResize!(item, 'start', e)} onKeyDown={(e) => { if (e.key === 'ArrowLeft') onResizeStep?.(item, 'start', -1); if (e.key === 'ArrowRight') onResizeStep?.(item, 'start', 1); }} className="absolute inset-y-0 left-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
            <button type="button" aria-label={`Resize end of ${item.title}`} onClick={(e) => e.stopPropagation()} onPointerDown={(e) => onResize!(item, 'end', e)} onKeyDown={(e) => { if (e.key === 'ArrowLeft') onResizeStep?.(item, 'start', -1); if (e.key === 'ArrowRight') onResizeStep?.(item, 'end', 1); }} className="absolute inset-y-0 right-0 w-2 cursor-ew-resize opacity-0 group-hover:opacity-100 focus-visible:opacity-100" />
          </>
        )
      ) : null}
    </div>
  );
}
