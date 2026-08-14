import { useMemo, useState, type ReactNode } from 'react';
import { ChevronDown, Pencil, Search } from 'lucide-react';
import type { FocusSession } from '@/shared/api/types';
import { Card } from '@/shared/ui/card';

export function FocusRecordsCard({
  sessions,
  onEdit,
}: {
  sessions: FocusSession[];
  onEdit: (session: FocusSession) => void;
}) {
  const [mergeShort, setMergeShort] = useState(true);
  const [recordSearch, setRecordSearch] = useState('');
  const [visibleDayCount, setVisibleDayCount] = useState(3);
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});

  const groupedHistory = useMemo(() => {
    const map = new Map<string, FocusSession[]>();
    for (const session of sessions) {
      const dateStr = new Date(session.adjustedStartedAt ?? session.startedAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
      map.set(dateStr, [...(map.get(dateStr) ?? []), session]);
    }
    return Array.from(map.entries());
  }, [sessions]);

  const filteredGroups = useMemo(() => {
    if (!recordSearch.trim()) return groupedHistory;
    const query = recordSearch.trim().toLocaleLowerCase();
    return groupedHistory.filter(([dateStr]) => dateStr.toLocaleLowerCase().includes(query));
  }, [groupedHistory, recordSearch]);
  const visibleGroups = filteredGroups.slice(0, visibleDayCount);

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-foreground">Focus record</h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-muted/30 px-2 py-1.5 text-xs text-muted-foreground">
            <Search className="h-3 w-3" />
            <input
              type="text"
              placeholder="Search dates..."
              value={recordSearch}
              onChange={(event) => setRecordSearch(event.target.value)}
              className="w-20 bg-transparent outline-none placeholder:text-muted-foreground/50 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() => setMergeShort((value) => !value)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
              mergeShort
                ? 'border-[var(--itu-teal-500)]/30 bg-[var(--itu-mint-50)] text-[var(--itu-teal-700)]'
                : 'border-border/70 bg-muted/30 text-muted-foreground'
            }`}
          >
            <span
              className={`h-3.5 w-[22px] rounded-full transition-colors ${
                mergeShort ? 'bg-[var(--itu-teal-500)]' : 'bg-border'
              } relative`}
            >
              <span
                className={`absolute top-0.5 block h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform ${
                  mergeShort ? 'translate-x-[10px]' : 'translate-x-[2px]'
                }`}
              />
            </span>
            Combine
          </button>
        </div>
      </div>

      {filteredGroups.length > 0 ? (
        <div className="space-y-0">
          {visibleGroups.map(([dateStr, daySessions], groupIndex) => {
            const isToday = groupIndex === 0;
            const collapsed = collapsedDays[dateStr] ?? false;
            const totalMinutes = daySessions.reduce((total, session) => total + sessionDurationMinutes(session), 0);
            const maxDuration = Math.max(1, ...daySessions.map(sessionDurationMinutes));
            const densityBars = daySessions.slice(0, 12).map((session) => {
              const height = Math.max(3, Math.round((sessionDurationMinutes(session) / maxDuration) * 14));
              return (
                <span
                  key={session.id}
                  className="w-[3px] rounded-[1px] bg-[var(--itu-teal-400)]"
                  style={{ height: `${height}px` }}
                />
              );
            });

            return (
              <div key={dateStr} className="border-t border-border/50 first:border-t-0">
                <button
                  type="button"
                  onClick={() => setCollapsedDays((current) => ({ ...current, [dateStr]: !current[dateStr] }))}
                  className="flex w-full items-center gap-2 py-3 text-left"
                >
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-muted-foreground/60 transition-transform ${
                      collapsed ? '-rotate-90' : ''
                    }`}
                  />
                  <span className="text-xs font-semibold text-foreground">
                    {dateStr}
                    {isToday && (
                      <span className="ml-2 rounded bg-[var(--itu-mint-100)] px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-[var(--itu-teal-700)]">
                        Today
                      </span>
                    )}
                  </span>
                  <span className="ml-auto flex items-center gap-3 text-[11px] font-mono text-muted-foreground/70">
                    <span className="flex items-end gap-[2px] h-3.5">{densityBars}</span>
                    <span>
                      {daySessions.length} session{daySessions.length !== 1 ? 's' : ''}
                    </span>
                    <span>{totalMinutes}m</span>
                  </span>
                </button>

                {!collapsed && (
                  <div className="space-y-0.5 pb-2 pl-5">{buildSessionRows(daySessions, mergeShort, onEdit)}</div>
                )}
              </div>
            );
          })}

          {visibleDayCount < filteredGroups.length && (
            <button
              type="button"
              onClick={() => setVisibleDayCount((count) => Math.min(count + 5, filteredGroups.length))}
              className="mt-3 w-full rounded-lg border border-dashed border-border py-2.5 text-xs font-semibold text-muted-foreground hover:border-[var(--itu-teal-500)] hover:text-[var(--itu-teal-700)] transition-colors"
            >
              Show {Math.min(5, filteredGroups.length - visibleDayCount)} earlier day
              {filteredGroups.length - visibleDayCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          {recordSearch.trim() ? 'No matching dates found.' : 'No focus records yet. Complete a session to start tracking.'}
        </div>
      )}
    </Card>
  );
}

function sessionDurationMinutes(session: FocusSession): number {
  const start = new Date(session.adjustedStartedAt ?? session.startedAt);
  const end = new Date(session.adjustedCompletedAt ?? session.completedAt ?? Date.now());
  return Math.max(
    1,
    Math.round((end.getTime() - start.getTime()) / 60000) - Math.round((session.accumulatedPauseSecs || 0) / 60),
  );
}

function buildSessionRows(sessions: FocusSession[], mergeShort: boolean, onEdit: (session: FocusSession) => void): ReactNode {
  if (!mergeShort) {
    return sessions.map((session) => {
      const start = new Date(session.adjustedStartedAt ?? session.startedAt);
      const end = new Date(session.adjustedCompletedAt ?? session.completedAt ?? Date.now());
      return (
        <SessionRow
          key={session.id}
          time={`${formatTimeString(start)} – ${formatTimeString(end)}`}
          duration={`${sessionDurationMinutes(session)}m`}
          note=""
          onEdit={() => onEdit(session)}
        />
      );
    });
  }

  const longSessions = sessions.filter((session) => sessionDurationMinutes(session) >= 2);
  const shortSessions = sessions.filter((session) => sessionDurationMinutes(session) < 2);
  const rows: ReactNode[] = longSessions.map((session) => {
    const start = new Date(session.adjustedStartedAt ?? session.startedAt);
    const end = new Date(session.adjustedCompletedAt ?? session.completedAt ?? Date.now());
    return (
      <SessionRow
        key={session.id}
        time={`${formatTimeString(start)} – ${formatTimeString(end)}`}
        duration={`${sessionDurationMinutes(session)}m`}
        note={session.customTitle ?? session.taskTitleSnapshot ?? ''}
        onEdit={() => onEdit(session)}
      />
    );
  });

  if (shortSessions.length > 0) {
    const totalShort = shortSessions.reduce((total, session) => total + sessionDurationMinutes(session), 0);
    rows.push(
      <div key="merged-short" className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs text-muted-foreground/70">
        <span className="h-2 w-2 rounded-full bg-border shrink-0" />
        <span className="font-mono">{shortSessions.length} short sessions</span>
        <span className="flex-1 text-[11px]">under 2m each</span>
        <span className="font-mono">{totalShort}m total</span>
      </div>,
    );
  }
  return rows;
}

function SessionRow({
  time,
  duration,
  note,
  onEdit,
}: {
  time: string;
  duration: string;
  note: string;
  onEdit: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs transition-colors hover:bg-muted/50">
      <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--itu-teal-500)] ring-[3px] ring-[var(--itu-mint-100)]" />
      <span className="font-mono text-muted-foreground min-w-[116px]">{time}</span>
      {note && <span className="flex-1 truncate text-muted-foreground/70">{note}</span>}
      <span className="font-mono text-muted-foreground/70">{duration}</span>
      <button
        type="button"
        onClick={onEdit}
        className="ml-1 flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 opacity-0 transition-all hover:bg-muted hover:text-foreground group-hover:opacity-100"
        title="Edit session"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  );
}

function formatTimeString(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
