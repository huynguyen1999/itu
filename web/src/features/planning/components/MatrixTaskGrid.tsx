import { useState } from 'react';
import { ChevronDown, Plus } from 'lucide-react';
import type { ProductivityTask } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { TaskList } from './TaskList';
import type { SortMode } from '../planning.types';

export const MATRIX_COLUMNS: Array<[string, string, string, string, string, string]> = [
  ['doFirst', 'Do now', 'Important + urgent', 'from-red-500/20 to-red-400/10', 'border-red-500/30', 'text-red-700 dark:text-red-400'],
  ['schedule', 'Schedule', 'Important + not urgent', 'from-orange-500/20 to-orange-400/10', 'border-orange-500/30', 'text-orange-700 dark:text-orange-400'],
  ['delegate', 'Delegate or minimize', 'Not important + urgent', 'from-blue-500/20 to-blue-400/10', 'border-blue-500/30', 'text-blue-700 dark:text-blue-400'],
  ['dontDo', 'Eliminate', 'Not important + not urgent', 'from-slate-500/20 to-slate-400/10', 'border-slate-500/30', 'text-slate-700 dark:text-slate-400'],
];

type MatrixTaskGridProps = {
  active: Record<string, ProductivityTask[]>;
  completed: Record<string, ProductivityTask[]>;
  wontDo: Record<string, ProductivityTask[]>;
  selectedTaskId: string | null;
  draggedTaskId: string | null;
  sortMode: SortMode;
  onSelect: (taskId: string) => void;
  onContextMenu: (task: ProductivityTask, position: { x: number; y: number }) => void;
  onAddTask: (quadrant: string) => void;
  onDragStart: (taskId: string) => void;
  onDragEnd: () => void;
  onMove: (taskId: string, targetQuadrant: string, beforeTaskId?: string) => void;
};

export function MatrixTaskGrid({
  active,
  completed,
  wontDo,
  selectedTaskId,
  draggedTaskId,
  sortMode,
  onSelect,
  onContextMenu,
  onAddTask,
  onDragStart,
  onDragEnd,
  onMove,
}: MatrixTaskGridProps) {
  return (
    <div className="grid flex-1 grid-cols-1 grid-rows-4 gap-3 min-h-0 overflow-hidden md:grid-cols-2 md:grid-rows-2">
      {MATRIX_COLUMNS.map(([key, title, subtitle, bgGradient, borderColor, textColor]) => {
        const quadrantTasks = active[key] ?? [];
        const completedTasks = completed[key] ?? [];
        const wontDoTasks = wontDo[key] ?? [];
        return (
          <section
            key={key}
            className={`flex flex-col min-h-0 overflow-hidden rounded-xl border bg-gradient-to-br ${bgGradient} ${borderColor} p-4 shadow-sm transition-all hover:shadow-md ${draggedTaskId && sortMode === 'manual' ? 'ring-1 ring-primary/20' : ''}`}
            onDragOver={(event) => {
              if (!draggedTaskId || sortMode !== 'manual') return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              if (!draggedTaskId || sortMode !== 'manual') return;
              event.preventDefault();
              onMove(draggedTaskId, key);
            }}
          >
            <div className="shrink-0 mb-2">
              <div className="flex items-center justify-between">
                <h2 className={`font-bold text-sm sm:text-base ${textColor}`}>{title}</h2>
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full bg-gradient-to-r ${bgGradient} px-2.5 py-1 text-xs font-semibold ${textColor}`}>
                    {quadrantTasks.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={`h-7 w-7 rounded-full hover:bg-black/10 dark:hover:bg-white/10 ${textColor}`}
                    onClick={() => onAddTask(key)}
                    title={`Add task to ${title}`}
                    aria-label={`Add task to ${title}`}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <p className={`text-xs ${textColor} opacity-75`}>{subtitle}</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <TaskList
                tasks={quadrantTasks}
                selectedTaskId={selectedTaskId}
                onSelect={onSelect}
                onContextMenu={onContextMenu}
                compact
                density="matrix"
                showTaskList
                draggable={sortMode === 'manual'}
                onTaskDragStart={onDragStart}
                onTaskDrop={(beforeTaskId) => {
                  if (draggedTaskId && draggedTaskId !== beforeTaskId) onMove(draggedTaskId, key, beforeTaskId);
                }}
                onTaskDragEnd={onDragEnd}
              />
              {completedTasks.length > 0 ? (
                <CollapsibleTaskSection label="Completed" tasks={completedTasks} selectedTaskId={selectedTaskId} onSelect={onSelect} onContextMenu={onContextMenu} />
              ) : null}
              {wontDoTasks.length > 0 ? (
                <CollapsibleTaskSection label="Won't do" tasks={wontDoTasks} selectedTaskId={selectedTaskId} onSelect={onSelect} onContextMenu={onContextMenu} />
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CollapsibleTaskSection({
  label,
  tasks,
  selectedTaskId,
  onSelect,
  onContextMenu,
}: {
  label: string;
  tasks: ProductivityTask[];
  selectedTaskId: string | null;
  onSelect: (id: string) => void;
  onContextMenu: (task: ProductivityTask, position: { x: number; y: number }) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="shrink-0 border-t border-white/20">
      <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-1.5 py-1.5 text-left text-xs font-semibold text-muted-foreground/70 transition-colors hover:text-foreground">
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? '' : '-rotate-90'}`} />
        <span>{label}</span>
        <span className="ml-auto text-muted-foreground/50">{tasks.length}</span>
      </button>
      {open ? <div className="max-h-none overflow-visible pr-1"><TaskList tasks={tasks} selectedTaskId={selectedTaskId} onSelect={onSelect} onContextMenu={onContextMenu} compact density="matrix" showTaskList /></div> : null}
    </div>
  );
}
