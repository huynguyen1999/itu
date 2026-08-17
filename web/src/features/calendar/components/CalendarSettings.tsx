import { useState } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import type { ExternalCalendar } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { timelineItemColor, type TimelineItemKind } from '../timeline';
import type { WeekStart } from '../monthGrid';

type CalendarSettingsProps = {
  visibleKinds: TimelineItemKind[];
  showCompleted: boolean;
  onToggleKind: (kind: TimelineItemKind) => void;
  onToggleCompleted: (value: boolean) => void;
  weekStart: WeekStart;
  onWeekStart: (value: WeekStart) => void;
  sources: ExternalCalendar[];
  sourcesLoading: boolean;
  sourcesError: boolean;
  onRetry: () => void;
  onConnect: (url: string, name?: string) => void;
  onRefresh: (id: string) => void;
  onRemove: (id: string) => void;
  onToggleSource: (id: string, visible: boolean) => void;
};

export function CalendarSettings({
  visibleKinds,
  showCompleted,
  onToggleKind,
  onToggleCompleted,
  weekStart,
  onWeekStart,
  sources,
  sourcesLoading,
  sourcesError,
  onRetry,
  onConnect,
  onRefresh,
  onRemove,
  onToggleSource,
}: CalendarSettingsProps) {
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');

  return (
    <div className="rounded-[var(--itu-radius-m)] border border-border/70 bg-card p-4 shadow-[var(--itu-shadow-pop)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Calendar settings</p><h2 className="mt-1 text-sm font-semibold text-foreground">Sources & filters</h2></div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <label className="flex items-center gap-2"><input type="checkbox" checked={showCompleted} onChange={(event) => onToggleCompleted(event.target.checked)} /> Show completed</label>
          <label className="flex items-center gap-2"><span>Week starts</span><select aria-label="Week start" className="h-7 rounded-[var(--itu-radius-s)] border border-border/70 bg-background px-2 text-xs" value={weekStart} onChange={(event) => onWeekStart(event.target.value as WeekStart)}><option value="SYSTEM">System</option><option value="SUNDAY">Sunday</option><option value="MONDAY">Monday</option></select></label>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {([['TASK_DURATION', 'Tasks'], ['TASK_DUE', 'Due Dates'], ['FOCUS_SESSION', 'Focus Sessions'], ['EXTERNAL_EVENT', 'Subscriptions']] as const).map(([kind, label]) => (
          <label key={kind} className="flex items-center gap-2 rounded-full border border-border/70 px-3 py-1.5 text-xs"><input type="checkbox" checked={visibleKinds.includes(kind)} onChange={() => onToggleKind(kind)} /> {label}</label>
        ))}
      </div>
      <form className="mt-4 flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); const trimmed = url.trim(); if (trimmed) { onConnect(trimmed, name.trim() || undefined); setUrl(''); setName(''); } }}>
        <input aria-label="ICS calendar URL" className="h-9 min-w-56 flex-1 rounded-[var(--itu-radius-s)] border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10" type="text" required placeholder="https://…/calendar.ics or webcal://…" value={url} onChange={(event) => setUrl(event.target.value)} />
        <input aria-label="Calendar name" className="h-9 min-w-40 flex-1 rounded-[var(--itu-radius-s)] border bg-background px-3 text-sm outline-none focus:border-primary/50 focus:ring-4 focus:ring-primary/10" placeholder="Calendar name" value={name} onChange={(event) => setName(event.target.value)} />
        <Button type="submit" size="sm">Add subscription</Button>
      </form>
      <div className="mt-4 grid gap-2 border-t border-border/60 pt-3">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Connected sources</p>
        {sourcesLoading ? <p className="text-xs text-muted-foreground">Loading calendar sources…</p> : sourcesError ? (
          <div className="flex items-center justify-between text-xs text-destructive"><span>Calendar sources could not be loaded.</span><Button variant="outline" size="sm" onClick={onRetry}>Retry</Button></div>
        ) : sources.length ? sources.map((source) => (
          <div key={source.id} className="flex items-center gap-2 rounded-[var(--itu-radius-s)] border border-border/60 bg-[var(--itu-surface-2)] px-2.5 py-2">
            <input type="checkbox" checked={source.visible} onChange={(event) => onToggleSource(source.id, event.target.checked)} aria-label={`Show ${source.name}`} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: timelineItemColor('EXTERNAL_EVENT', source.color) }} />
            <span className="min-w-0 flex-1 truncate text-xs font-semibold">{source.name}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRefresh(source.id)} aria-label={`Refresh ${source.name}`}><RefreshCw className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onRemove(source.id)} aria-label={`Remove ${source.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
            {source.lastError ? <span className="text-[10px] text-destructive">{source.lastError}</span> : null}
          </div>
        )) : <p className="text-xs text-muted-foreground">No external calendars connected yet.</p>}
      </div>
    </div>
  );
}

export type { CalendarSettingsProps };
