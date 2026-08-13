import { GripVertical } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import type { ProductivityTask } from '@/shared/api/client';

type ArrangeTasksPanelProps = {
  tasks: ProductivityTask[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
};

export function ArrangeTasksPanel({ tasks, isLoading, isError, onRetry }: ArrangeTasksPanelProps) {
  return (
    <aside id="calendar-arrange-tasks" aria-label="Unscheduled tasks" className="rounded-[var(--itu-radius-m)] border border-border/70 bg-card p-4 shadow-[var(--itu-shadow-card)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Arrange tasks</p>
          <h2 className="mt-1 text-sm font-semibold text-foreground">Give unfinished work a place</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Drag-only: drop a task into a source row and date.</p>
        </div>
        <span className="rounded-full bg-[var(--itu-mint-100)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--itu-teal-700)]">{tasks.length}</span>
      </div>
      {isLoading ? <p className="mt-4 text-xs text-muted-foreground">Loading tasks…</p> : isError ? (
        <div className="mt-4 flex items-center justify-between rounded-[var(--itu-radius-s)] border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
          <span>Tasks could not be loaded.</span><Button variant="outline" size="sm" onClick={onRetry}>Retry</Button>
        </div>
      ) : tasks.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {tasks.map((task) => (
            <div
              key={task.id}
              draggable
              role="button"
              tabIndex={0}
              aria-label={`Drag ${task.title} to schedule it`}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('application/iTu-calendar-task', JSON.stringify({ id: task.id, durationMs: (task.estimatedMinutes ?? 30) * 60_000 }));
              }}
              className="group flex min-h-12 cursor-grab items-center gap-2 rounded-[var(--itu-radius-s)] border border-border/70 bg-[var(--itu-surface-2)] px-3 py-2 outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
              <span className="min-w-0 flex-1 truncate text-xs font-semibold text-foreground">{task.title}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{task.estimatedMinutes ?? 30}m</span>
            </div>
          ))}
        </div>
      ) : <p className="mt-4 rounded-[var(--itu-radius-s)] border border-dashed border-border/80 px-3 py-4 text-xs text-muted-foreground">You’re clear. New planned work without dates will land here.</p>}
    </aside>
  );
}

export type { ArrangeTasksPanelProps };
