import { useMemo, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  Sun,
  Sunrise,
  CalendarDays,
  X,
} from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';

interface DatePickerPopoverProps {
  value?: string | null;
  onChange: (isoValue: string | null) => void;
  trigger?: React.ReactNode;
  align?: 'start' | 'center' | 'end';
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DatePickerPopover({ value, onChange, trigger, align = 'start' }: DatePickerPopoverProps) {
  const [open, setOpen] = useState(false);

  // Parsed initial date or today
  const selectedDate = useMemo(() => {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }, [value]);

  const [viewDate, setViewDate] = useState(() => selectedDate ?? new Date());
  const [time, setTime] = useState(() => {
    if (selectedDate) {
      const h = String(selectedDate.getHours()).padStart(2, '0');
      const m = String(selectedDate.getMinutes()).padStart(2, '0');
      return `${h}:${m}`;
    }
    return '18:00';
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const monthLabel = viewDate.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  // Calendar grid calculations
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  // Previous month trailing days
  const prevMonthDays = new Date(year, month, 0).getDate();

  function selectDay(dayNumber: number) {
    const [hours, minutes] = time.split(':').map(Number);
    const newDate = new Date(year, month, dayNumber, hours || 9, minutes || 0);
    onChange(newDate.toISOString());
    setOpen(false);
  }

  function handlePreset(daysToAdd: number, setHours = 18) {
    const d = new Date();
    d.setDate(d.getDate() + daysToAdd);
    d.setHours(setHours, 0, 0, 0);
    onChange(d.toISOString());
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setOpen(false);
  }

  function changeMonth(delta: number) {
    setViewDate(new Date(year, month + delta, 1));
  }

  const isToday = (day: number) => {
    const today = new Date();
    return today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
  };

  const isSelected = (day: number) => {
    if (!selectedDate) return false;
    return selectedDate.getDate() === day && selectedDate.getMonth() === month && selectedDate.getFullYear() === year;
  };

  const formattedDisplay = useMemo(() => {
    if (!selectedDate) return 'Set Date';
    const today = new Date();
    const isSameYear = today.getFullYear() === selectedDate.getFullYear();
    const dateStr = selectedDate.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: isSameYear ? undefined : 'numeric',
    });
    const timeStr = selectedDate.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${dateStr}, ${timeStr}`;
  }, [selectedDate]);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        {trigger ? (
          trigger
        ) : (
          <button
            type="button"
            className={`flex items-center gap-1.5 rounded-lg border border-input bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground ${
              selectedDate ? 'text-primary font-semibold border-primary/40' : 'text-muted-foreground'
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5 text-primary" />
            <span>{formattedDisplay}</span>
          </button>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={align}
        className="w-72 p-3 bg-popover text-popover-foreground border border-border rounded-2xl shadow-2xl space-y-3"
      >
        {/* Preset Quick Buttons */}
        <div className="grid grid-cols-4 gap-1">
          {/* Today */}
          <div className="relative group flex">
            <button
              type="button"
              onClick={() => handlePreset(0, 18)}
              className="flex flex-1 items-center justify-center h-8 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 transition-colors"
            >
              <Sun className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-popover-foreground/90 px-2 py-0.5 text-[10px] font-medium text-popover opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
              Today (6:00 PM)
            </span>
          </div>

          {/* Tomorrow */}
          <div className="relative group flex">
            <button
              type="button"
              onClick={() => handlePreset(1, 9)}
              className="flex flex-1 items-center justify-center h-8 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 transition-colors"
            >
              <Sunrise className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-popover-foreground/90 px-2 py-0.5 text-[10px] font-medium text-popover opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
              Tomorrow (9:00 AM)
            </span>
          </div>

          {/* Next Week */}
          <div className="relative group flex">
            <button
              type="button"
              onClick={() => handlePreset(7, 9)}
              className="flex flex-1 items-center justify-center h-8 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 transition-colors"
            >
              <CalendarDays className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-popover-foreground/90 px-2 py-0.5 text-[10px] font-medium text-popover opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
              Next Week (+7 days)
            </span>
          </div>

          {/* Clear */}
          <div className="relative group flex">
            <button
              type="button"
              onClick={handleClear}
              className="flex flex-1 items-center justify-center h-8 rounded-lg bg-muted hover:bg-accent text-muted-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-popover-foreground/90 px-2 py-0.5 text-[10px] font-medium text-popover opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
              Clear date
            </span>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* Month Navigation */}
        <div className="flex items-center justify-between text-xs font-semibold px-1">
          <span>{monthLabel}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Calendar Day Grid */}
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {WEEKDAYS.map((wd) => (
            <span key={wd} className="text-[10px] font-bold text-muted-foreground py-0.5">
              {wd}
            </span>
          ))}

          {/* Trailing days from previous month */}
          {Array.from({ length: firstDayOfWeek }).map((_, i) => {
            const dayNum = prevMonthDays - firstDayOfWeek + i + 1;
            return (
              <span key={`prev-${i}`} className="py-1 text-[11px] text-muted-foreground/30 select-none">
                {dayNum}
              </span>
            );
          })}

          {/* Current Month Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const todayClass = isToday(day) ? 'font-bold text-primary underline underline-offset-2' : '';
            const selectedClass = isSelected(day)
              ? 'bg-primary text-primary-foreground font-bold shadow-sm'
              : 'hover:bg-accent text-foreground';

            return (
              <button
                type="button"
                key={day}
                onClick={() => selectDay(day)}
                className={`py-1 rounded-md text-[11px] transition-colors ${selectedClass} ${todayClass}`}
              >
                {day}
              </button>
            );
          })}
        </div>

        <div className="h-px bg-border" />

        {/* Time Selector */}
        <div className="flex items-center justify-between text-xs pt-0.5">
          <span className="flex items-center gap-1 text-muted-foreground font-medium">
            <Clock className="h-3.5 w-3.5 text-primary" />
            Time
          </span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="bg-muted/60 border border-input rounded px-2 py-0.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
