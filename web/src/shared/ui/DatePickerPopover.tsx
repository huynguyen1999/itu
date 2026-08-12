import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
import { getStoredTaskPreferences } from '@/shared/api/preferencesApi';

interface DatePickerPopoverProps {
  value?: string | null;
  onChange: (isoValue: string | null) => void;
  scheduledStartAt?: string | null;
  scheduledEndAt?: string | null;
  onScheduleChange?: (startAt: string | null, endAt: string | null) => void;
  reminders?: Array<{ id: string; remindAt: string; type?: 'ABSOLUTE' | 'RELATIVE'; status?: 'SCHEDULED' | 'SNOOZED' | 'DISMISSED' | 'DELIVERED' | 'CANCELED' }>;
  onReminderCreate?: (reminder: {
    type: 'ABSOLUTE' | 'RELATIVE';
    remindAt?: string;
    relativeTo?: 'DUE_AT' | 'SCHEDULE_START_AT';
    calendarDayOffset?: number;
    timeOfDayMinutes?: number;
    timeZone?: string;
  }) => void;
  onReminderUpdate?: (id: string, remindAt: string) => void;
  onReminderRemove?: (id: string) => void;
  remindersOpenByDefault?: boolean;
  trigger?: ReactNode;
  align?: 'start' | 'center' | 'end';
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function DatePickerPopover({
  value,
  onChange,
  scheduledStartAt,
  scheduledEndAt,
  onScheduleChange,
  reminders = [],
  onReminderCreate,
  onReminderUpdate,
  onReminderRemove,
  remindersOpenByDefault = false,
  trigger,
  align = 'start',
}: DatePickerPopoverProps) {
  const [open, setOpen] = useState(false);
  const defaultDueTime = getStoredTaskPreferences().defaultDueTime;

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
    return defaultDueTime;
  });
  const [customReminderAt, setCustomReminderAt] = useState('');
  const [showReminders, setShowReminders] = useState(remindersOpenByDefault);
  const [reminderTimes, setReminderTimes] = useState<Record<string, string>>({});

  const activeReminders = useMemo(
    () => reminders.filter((reminder) => !reminder.status || reminder.status === 'SCHEDULED' || reminder.status === 'SNOOZED'),
    [reminders],
  );

  useEffect(() => {
    setTime(
      selectedDate
        ? `${String(selectedDate.getHours()).padStart(2, '0')}:${String(selectedDate.getMinutes()).padStart(2, '0')}`
        : defaultDueTime,
    );
  }, [defaultDueTime, open, selectedDate, value]);

  useEffect(() => {
    setReminderTimes(Object.fromEntries(activeReminders.map((reminder) => [reminder.id, toLocalInput(reminder.remindAt)])));
  }, [activeReminders]);

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
    const newDate = new Date(year, month, dayNumber, Number.isFinite(hours) ? hours : 21, Number.isFinite(minutes) ? minutes : 0);
    onChange(newDate.toISOString());
    setOpen(false);
  }

  function handlePreset(daysToAdd: number) {
    const d = new Date();
    d.setDate(d.getDate() + daysToAdd);
    const [hours, minutes] = defaultDueTime.split(':').map(Number);
    d.setHours(Number.isFinite(hours) ? hours : 21, Number.isFinite(minutes) ? minutes : 0, 0, 0);
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
    return dateStr;
  }, [selectedDate]);

  const defaultRelativeAnchor = value ? 'DUE_AT' : scheduledStartAt ? 'SCHEDULE_START_AT' : 'DUE_AT';

  function setScheduleValue(value: string, kind: 'start' | 'end') {
    const next = value ? new Date(value).toISOString() : null;
    onScheduleChange?.(kind === 'start' ? next : scheduledStartAt ?? null, kind === 'end' ? next : scheduledEndAt ?? null);
  }

  function toggleDuration() {
    if (!onScheduleChange) return;
    if (scheduledStartAt || scheduledEndAt) {
      onScheduleChange(null, null);
      return;
    }
    const start = selectedDate ? new Date(selectedDate) : new Date();
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60_000);
    onScheduleChange(start.toISOString(), end.toISOString());
  }

  function createCustomReminder() {
    if (!customReminderAt || !onReminderCreate) return;
    onReminderCreate({ type: 'ABSOLUTE', remindAt: new Date(customReminderAt).toISOString() });
    setCustomReminderAt('');
  }

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
              onClick={() => handlePreset(0)}
              className="flex flex-1 items-center justify-center h-8 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 transition-colors"
            >
              <Sun className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-popover-foreground/90 px-2 py-0.5 text-[10px] font-medium text-popover opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
              Today ({formatTimeLabel(defaultDueTime)})
            </span>
          </div>

          {/* Tomorrow */}
          <div className="relative group flex">
            <button
              type="button"
              onClick={() => handlePreset(1)}
              className="flex flex-1 items-center justify-center h-8 rounded-lg bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 transition-colors"
            >
              <Sunrise className="h-4 w-4" />
            </button>
            <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 whitespace-nowrap rounded-md bg-popover-foreground/90 px-2 py-0.5 text-[10px] font-medium text-popover opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
              Tomorrow ({formatTimeLabel(defaultDueTime)})
            </span>
          </div>

          {/* Next Week */}
          <div className="relative group flex">
            <button
              type="button"
              onClick={() => handlePreset(7)}
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
            Due time
          </span>
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="bg-muted/60 border border-input rounded px-2 py-0.5 text-xs font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        {onScheduleChange ? (
          <>
            <div className="h-px bg-border" />
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Duration</span>
              <button type="button" onClick={toggleDuration} className="font-semibold text-primary hover:underline">
                {scheduledStartAt || scheduledEndAt ? 'On' : 'Off'}
              </button>
            </div>
            {scheduledStartAt || scheduledEndAt ? (
              <div className="grid gap-2 text-xs">
                <label className="flex items-center justify-between gap-2 text-muted-foreground">
                  Start
                  <input type="datetime-local" value={toLocalInput(scheduledStartAt)} onChange={(event) => setScheduleValue(event.target.value, 'start')} className="rounded border bg-muted/60 px-2 py-1 text-foreground" />
                </label>
                <label className="flex items-center justify-between gap-2 text-muted-foreground">
                  End
                  <input type="datetime-local" value={toLocalInput(scheduledEndAt)} onChange={(event) => setScheduleValue(event.target.value, 'end')} className="rounded border bg-muted/60 px-2 py-1 text-foreground" />
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        {onReminderCreate || onReminderUpdate || onReminderRemove ? (
          <>
            <div className="h-px bg-border" />
            <button type="button" aria-expanded={showReminders} onClick={() => setShowReminders((open) => !open)} className="flex w-full items-center justify-between text-xs font-medium">
              <span>Reminder</span>
              <span className="text-muted-foreground">{activeReminders.length ? `${activeReminders.length} set` : 'Add'}</span>
            </button>
            {showReminders ? (
              <div className="grid gap-1.5 text-xs">
                {activeReminders.map((reminder) => (
                  <div key={reminder.id} className="flex items-center gap-1">
                    <input
                      aria-label={`Reminder ${reminder.id}`}
                      type="datetime-local"
                      value={reminderTimes[reminder.id] ?? toLocalInput(reminder.remindAt)}
                      onChange={(event) => setReminderTimes((current) => ({ ...current, [reminder.id]: event.target.value }))}
                      className="min-w-0 flex-1 rounded border bg-muted/60 px-2 py-1"
                    />
                    <button
                      type="button"
                      disabled={!onReminderUpdate || !reminderTimes[reminder.id]}
                      onClick={() => {
                        const value = reminderTimes[reminder.id];
                        if (value) onReminderUpdate?.(reminder.id, new Date(value).toISOString());
                      }}
                      className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      aria-label="Remove reminder"
                      title="Remove reminder"
                      disabled={!onReminderRemove}
                      onClick={() => onReminderRemove?.(reminder.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                {onReminderCreate ? (
                  <>
                    <button type="button" onClick={() => onReminderCreate({ type: 'RELATIVE', relativeTo: 'DUE_AT' })} className="rounded px-2 py-1 text-left hover:bg-accent">At due time</button>
                    <button type="button" onClick={() => onReminderCreate({ type: 'RELATIVE', relativeTo: defaultRelativeAnchor, calendarDayOffset: 0, timeOfDayMinutes: 540, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })} className="rounded px-2 py-1 text-left hover:bg-accent">On the day (09:00)</button>
                    <button type="button" onClick={() => onReminderCreate({ type: 'RELATIVE', relativeTo: defaultRelativeAnchor, calendarDayOffset: -1, timeOfDayMinutes: 540, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })} className="rounded px-2 py-1 text-left hover:bg-accent">1 day early (09:00)</button>
                  </>
                ) : null}
                <div className="flex gap-1">
                  <input aria-label="Custom reminder" type="datetime-local" value={customReminderAt} onChange={(event) => setCustomReminderAt(event.target.value)} className="min-w-0 flex-1 rounded border bg-muted/60 px-2 py-1" />
                  <button type="button" disabled={!onReminderCreate || !customReminderAt} onClick={createCustomReminder} className="rounded bg-primary px-2 py-1 text-primary-foreground disabled:opacity-50">Add</button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function toLocalInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatTimeLabel(value: string) {
  const [hours, minutes] = value.split(':').map(Number);
  const date = new Date();
  date.setHours(Number.isFinite(hours) ? hours : 21, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
