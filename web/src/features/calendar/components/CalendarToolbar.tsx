import { CalendarDays, ChevronLeft, ChevronRight, Plus, Settings2 } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { TimelineZoom } from '../timeline';

type CalendarToolbarProps = {
  zoom: TimelineZoom;
  showArrange: boolean;
  onToggleArrange: () => void;
  onMoveAnchor: (direction: -1 | 1) => void;
  onToday: () => void;
  onZoomChange: (zoom: TimelineZoom) => void;
  onToggleSettings: () => void;
};

export function CalendarToolbar({
  zoom,
  showArrange,
  onToggleArrange,
  onMoveAnchor,
  onToday,
  onZoomChange,
  onToggleSettings,
}: CalendarToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Button variant="outline" size="sm" onClick={onToggleArrange} aria-expanded={showArrange} aria-controls="calendar-arrange-tasks">
        <Plus className="h-3.5 w-3.5" /> Arrange tasks
      </Button>
      <div className="flex items-center gap-1 rounded-[var(--itu-radius-s)] border border-border/70 p-1 shadow-[var(--itu-shadow-card)]">
        <Button variant="ghost" size="icon" aria-label="Previous range" onClick={() => onMoveAnchor(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" onClick={onToday}>Today</Button>
        <Button variant="ghost" size="icon" aria-label="Next range" onClick={() => onMoveAnchor(1)}><ChevronRight className="h-4 w-4" /></Button>
        {(['DAY', 'WEEK', 'MONTH'] as const).map((value) => (
          <Button key={value} variant={zoom === value ? 'default' : 'ghost'} size="sm" onClick={() => onZoomChange(value)}>
            {value[0] + value.slice(1).toLowerCase()}
          </Button>
        ))}
        <Button variant="ghost" size="icon" aria-label="Calendar settings" onClick={() => onToggleSettings()}><Settings2 className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export type { CalendarToolbarProps };
