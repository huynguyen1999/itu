import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  Circle,
  Clock,
  CornerDownRight,
  Flag,
  FolderInput,
  PlayCircle,
  Sun,
  Sunrise,
  Trash2,
  XCircle,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import type { ProductivityTask, TaskPriority, TaskStatus } from '@/shared/api/types';
import { DatePickerPopover } from '@/shared/ui/DatePickerPopover';
import { useUndoStack, useUndoToast } from '@/shared/hooks/useUndoStack';
import { UndoToast } from '@/shared/ui/UndoToast';
import { inboxTaskListId, selectableTaskLists } from '../utils/taskLists';

interface TaskContextMenuProps {
  task: ProductivityTask | null;
  position: { x: number; y: number } | null;
  onClose: () => void;
  onOpenDetail: () => void;
}

export function TaskContextMenu({ task, position, onClose, onOpenDetail }: TaskContextMenuProps) {
  const queryClient = useQueryClient();
  const menuRef = useRef<HTMLDivElement>(null);
  const [showMoveMenu, setShowMoveMenu] = useState(false);

  const { push } = useUndoStack();
  const undoToast = useUndoToast();

  const projects = useQuery({ queryKey: ['task-lists'], queryFn: () => api.taskLists() });
  const inboxListId = inboxTaskListId(projects.data);

  const updateTask = useMutation({
    mutationFn: ({ patch, label }: { patch: Partial<Parameters<typeof api.updateTask>[1]>; label?: string }) => {
      if (!task) throw new Error('No task selected');
      return api.updateTask(task.id, { ...patch, version: task.version });
    },
    onSuccess: (_, { patch, label }) => {
      if (!task) return;
      const prevTask = task;
      onClose();

      if (label) {
        const undoAction = {
          label,
          undo: async () => {
            await api.updateTask(prevTask.id, {
              status: prevTask.status,
              priority: prevTask.priority,
              taskListId: prevTask.taskListId ?? undefined,
              dueAt: prevTask.dueAt ?? null,
            });
          },
        };
        push(undoAction);
        undoToast.show(undoAction);
      }
    },
  });

  const deleteTask = useMutation({
    mutationFn: () => {
      if (!task) throw new Error('No task selected');
      return api.deleteTask(task.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['trash'] });
      onClose();
      if (task) {
        const undoAction = {
          label: `"${task.title.slice(0, 30)}" moved to trash`,
          undo: async () => {
            await api.restoreTrashTask(task.id);
            void queryClient.invalidateQueries({ queryKey: ['tasks'] });
            void queryClient.invalidateQueries({ queryKey: ['trash'] });
          },
        };
        push(undoAction);
        undoToast.show(undoAction);
      }
    },
  });

  useEffect(() => {
    setShowMoveMenu(false);
  }, [task, position]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    if (position) {
      window.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [position, onClose]);

  if (!task || !position) return null;

  // Keep menu within viewport bounds
  const menuWidth = 240;
  const menuHeight = 360;
  const adjustedX = Math.min(Math.max(12, position.x), window.innerWidth - menuWidth - 12);
  const adjustedY = Math.min(Math.max(12, position.y), window.innerHeight - menuHeight - 12);

  const setDueDate = (dateObj: Date) => {
    updateTask.mutate({
      patch: taskDueDatePatch(dateObj.toISOString()),
      label: `Due date set for "${task.title.slice(0, 25)}"`,
    });
  };

  const setPriority = (priority: TaskPriority) => {
    updateTask.mutate({ patch: { priority }, label: `Priority set to ${priority.toLowerCase()}` });
  };

  const setStatus = (status: TaskStatus) => {
    const statusLabels: Record<string, string> = {
      PLANNED: 'Planned',
      IN_PROGRESS: 'In Progress',
      COMPLETED: 'Completed',
      CANCELED: 'Abandoned',
    };
    updateTask.mutate({ patch: { status }, label: `Status set to ${statusLabels[status] ?? status}` });
  };

  return (
    <>
      <div
        ref={menuRef}
        style={{ top: `${adjustedY}px`, left: `${adjustedX}px` }}
        className="fixed z-50 w-72 rounded-xl border border-border bg-popover text-popover-foreground p-3 shadow-xl text-xs select-none animate-in fade-in-0 zoom-in-95 duration-100 space-y-3"
      >
        {/* Status Quick Selector */}
        <div>
          <p className="px-1 py-0.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</p>
          <div className="grid grid-cols-4 gap-1 mt-1">
            <button
              type="button"
              title="Planned"
              onClick={() => setStatus('PLANNED')}
              className={`flex h-7 items-center justify-center gap-1 rounded-md border px-1 text-[11px] font-medium transition-colors ${
                task.status === 'PLANNED' || task.status === 'INBOX'
                  ? 'border-primary bg-primary/10 text-primary font-bold'
                  : 'border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              <Circle className="h-3 w-3 shrink-0" />
              <span>Plan</span>
            </button>
            <button
              type="button"
              title="In Progress"
              onClick={() => setStatus('IN_PROGRESS')}
              className={`flex h-7 items-center justify-center gap-1 rounded-md border px-1 text-[11px] font-medium transition-colors ${
                task.status === 'IN_PROGRESS'
                  ? 'border-blue-500 bg-blue-500/20 text-blue-500 font-bold'
                  : 'border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              <PlayCircle className="h-3 w-3 shrink-0" />
              <span>Active</span>
            </button>
            <button
              type="button"
              title="Completed"
              onClick={() => setStatus('COMPLETED')}
              className={`flex h-7 items-center justify-center gap-1 rounded-md border px-1 text-[11px] font-medium transition-colors ${
                task.status === 'COMPLETED'
                  ? 'border-emerald-500 bg-emerald-500/20 text-emerald-500 font-bold'
                  : 'border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              <span>Done</span>
            </button>
            <button
              type="button"
              title="Abandoned"
              onClick={() => setStatus('CANCELED')}
              className={`flex h-7 items-center justify-center gap-1 rounded-md border px-1 text-[11px] font-medium transition-colors ${
                task.status === 'CANCELED'
                  ? 'border-slate-500 bg-slate-500/20 text-slate-400 font-bold'
                  : 'border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              <XCircle className="h-3 w-3 shrink-0" />
              <span>Cancel</span>
            </button>
          </div>
        </div>

        {/* Date Quick Actions */}
        <div>
          <p className="px-1 py-0.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Date</p>
          <div className="grid grid-cols-5 gap-1 mt-1">
            <div className="relative group flex">
              <button
                type="button"
                title="Today"
                aria-label="Today"
                onClick={() => {
                  const d = new Date();
                  d.setHours(18, 0, 0, 0);
                  setDueDate(d);
                }}
                className="flex h-7 w-full items-center justify-center rounded-md bg-amber-500/10 hover:bg-amber-500/20 transition-colors text-amber-600 dark:text-amber-400 font-medium"
              >
                <Sun className="h-3.5 w-3.5 shrink-0" />
              </button>
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-popover-foreground px-1.5 py-0.5 text-[10px] font-medium text-popover opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                Today
              </span>
            </div>

            <div className="relative group flex">
              <button
                type="button"
                title="Tomorrow"
                aria-label="Tomorrow"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  d.setHours(9, 0, 0, 0);
                  setDueDate(d);
                }}
                className="flex h-7 w-full items-center justify-center rounded-md bg-orange-500/10 hover:bg-orange-500/20 transition-colors text-orange-600 dark:text-orange-400 font-medium"
              >
                <Sunrise className="h-3.5 w-3.5 shrink-0" />
              </button>
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-popover-foreground px-1.5 py-0.5 text-[10px] font-medium text-popover opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                Tomorrow
              </span>
            </div>

            <div className="relative group flex">
              <button
                type="button"
                title="Next Week"
                aria-label="Next Week"
                onClick={() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 7);
                  d.setHours(9, 0, 0, 0);
                  setDueDate(d);
                }}
                className="flex h-7 w-full items-center justify-center rounded-md bg-blue-500/10 hover:bg-blue-500/20 transition-colors text-blue-600 dark:text-blue-400 font-medium"
              >
                <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              </button>
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-popover-foreground px-1.5 py-0.5 text-[10px] font-medium text-popover opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                Next Week
              </span>
            </div>

            <div className="relative group flex">
              <DatePickerPopover
                value={task.dueAt}
                align="end"
                onChange={(isoStr) => {
                  if (isoStr) {
                    setDueDate(new Date(isoStr));
                    return;
                  }
                  updateTask.mutate({
                    patch: taskDueDatePatch(null),
                    label: `Due date removed from "${task.title.slice(0, 25)}"`,
                  });
                }}
                trigger={
                  <button
                    type="button"
                    title="Custom Date"
                    aria-label="Custom Date"
                    className="flex h-7 w-full items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:bg-muted/80"
                  >
                    <Calendar className="h-3.5 w-3.5 shrink-0" />
                  </button>
                }
              />
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-popover-foreground px-1.5 py-0.5 text-[10px] font-medium text-popover opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                Custom Date
              </span>
            </div>

            <div className="relative group flex">
              <button
                type="button"
                title="Remove due date"
                aria-label="Remove due date"
                onClick={() =>
                  updateTask.mutate({
                    patch: taskDueDatePatch(null),
                    label: `Due date removed from "${task.title.slice(0, 25)}"`,
                  })
                }
                disabled={!task.dueAt}
                className="flex h-7 w-full items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <XCircle className="h-3.5 w-3.5 shrink-0" />
              </button>
              <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 whitespace-nowrap rounded bg-popover-foreground px-1.5 py-0.5 text-[10px] font-medium text-popover opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50">
                Clear Date
              </span>
            </div>
          </div>
        </div>

        {/* Priority Quick Actions */}
        <div>
          <p className="px-1 py-0.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Priority
          </p>
          <div className="grid grid-cols-4 gap-1 mt-1">
            <button
              type="button"
              title="High Priority"
              onClick={() => setPriority('HIGH')}
              className={`flex h-7 items-center justify-center gap-1 rounded-md border text-[11px] font-semibold transition-colors ${
                task.priority === 'HIGH'
                  ? 'border-rose-500 bg-rose-500/20 text-rose-500'
                  : 'border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              <Flag className="h-3 w-3 fill-rose-500 text-rose-500 shrink-0" />
              <span>High</span>
            </button>
            <button
              type="button"
              title="Medium Priority"
              onClick={() => setPriority('MEDIUM')}
              className={`flex h-7 items-center justify-center gap-1 rounded-md border text-[11px] font-semibold transition-colors ${
                task.priority === 'MEDIUM'
                  ? 'border-amber-500 bg-amber-500/20 text-amber-500'
                  : 'border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              <Flag className="h-3 w-3 fill-amber-500 text-amber-500 shrink-0" />
              <span>Med</span>
            </button>
            <button
              type="button"
              title="Low Priority"
              onClick={() => setPriority('LOW')}
              className={`flex h-7 items-center justify-center gap-1 rounded-md border text-[11px] font-semibold transition-colors ${
                task.priority === 'LOW'
                  ? 'border-blue-500 bg-blue-500/20 text-blue-500'
                  : 'border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              <Flag className="h-3 w-3 fill-blue-500 text-blue-500 shrink-0" />
              <span>Low</span>
            </button>
            <button
              type="button"
              title="No Priority"
              onClick={() => setPriority('NONE')}
              className={`flex h-7 items-center justify-center gap-1 rounded-md border text-[11px] font-semibold transition-colors ${
                task.priority === 'NONE'
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-muted text-muted-foreground'
              }`}
            >
              <Flag className="h-3 w-3 text-muted-foreground shrink-0" />
              <span>None</span>
            </button>
          </div>
        </div>

        <div className="h-px bg-border my-1" />

        {/* Action Menu Options */}
        <div className="space-y-0.5">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenDetail();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors text-left font-medium"
          >
            <CornerDownRight className="h-4 w-4 text-muted-foreground" />
            <span>Open Details</span>
          </button>

          {/* Move to List Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowMoveMenu(!showMoveMenu)}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md hover:bg-muted transition-colors text-left font-medium"
            >
              <div className="flex items-center gap-2">
                <FolderInput className="h-4 w-4 text-muted-foreground" />
                <span>Move to List</span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">▸</span>
            </button>

            {showMoveMenu && (
              <div className="absolute left-full top-0 ml-1.5 w-44 rounded-lg border bg-popover text-popover-foreground p-1 shadow-xl text-xs space-y-0.5 z-50">
                <button
                  type="button"
                  onClick={() => {
                    updateTask.mutate({ patch: { taskListId: inboxListId }, label: `Moved to Inbox` });
                    setShowMoveMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted text-left"
                >
                  <span>Inbox</span>
                </button>
                {selectableTaskLists(projects.data).map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => {
                      updateTask.mutate({ patch: { taskListId: project.id }, label: `Moved to "${project.title}"` });
                      setShowMoveMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted text-left truncate"
                  >
                    <span className="truncate">{project.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => deleteTask.mutate()}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-rose-500/10 hover:text-rose-600 transition-colors text-left font-medium text-rose-500"
          >
            <Trash2 className="h-4 w-4" />
            <span>Move to Trash</span>
          </button>
        </div>
      </div>
      <UndoToast action={undoToast.current} onUndo={undoToast.handleUndo} onDismiss={undoToast.dismiss} />
    </>
  );
}

export function taskDueDatePatch(value: string | null): { dueAt: string | null } {
  return { dueAt: value };
}
