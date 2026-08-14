import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, CheckSquare2, ChevronDown, Flag, Trash2, X } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { ProductivityTask, TaskInput, TaskPriority } from '@/shared/api/types';
import { useUndoStack, useUndoToast } from '@/shared/hooks/useUndoStack';
import { Button } from '@/shared/ui/button';
import { DatePickerPopover } from '@/shared/ui/DatePickerPopover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';

export function PlanningBulkActions({
  selectedTaskIds,
  selectedTasks,
  visibleTaskCount,
  onClear,
  onSelectAllOrClear,
}: {
  selectedTaskIds: ReadonlySet<string>;
  selectedTasks: ProductivityTask[];
  visibleTaskCount: number;
  onClear: () => void;
  onSelectAllOrClear: () => void;
}) {
  const queryClient = useQueryClient();
  const { push } = useUndoStack();
  const undoToast = useUndoToast();
  const bulkUpdateTasks = useMutation({
    mutationFn: (patch: Pick<Partial<TaskInput>, 'priority' | 'dueAt'>) =>
      Promise.all(selectedTasks.map((task) => api.updateTask(task.id, { ...patch, version: task.version }))),
    onError: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
  const bulkDeleteTasks = useMutation({
    mutationFn: (tasksToDelete: ProductivityTask[]) => Promise.all(tasksToDelete.map((task) => api.deleteTask(task.id))),
    onSuccess: (_, deletedTasks) => {
      onClear();
      const undoAction = {
        label: deletedTasks.length === 1 ? 'Deleted 1 task' : `Deleted ${deletedTasks.length} tasks`,
        undo: async () => {
          await Promise.all(deletedTasks.map((task) => api.restoreTrashTask(task.id)));
        },
      };
      push(undoAction);
      undoToast.show(undoAction);
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  if (!selectedTaskIds.size) return null;
  return (
    <div className="mx-4 mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2 shadow-sm">
      <span className="mr-1 flex items-center gap-2 text-sm font-semibold"><CheckSquare2 className="h-4 w-4 text-primary" />{selectedTaskIds.size} selected</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={bulkUpdateTasks.isPending}><Flag className="h-3.5 w-3.5" />Priority<ChevronDown className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {(['HIGH', 'MEDIUM', 'LOW', 'NONE'] as TaskPriority[]).map((priority) => <DropdownMenuItem key={priority} onSelect={() => bulkUpdateTasks.mutate({ priority } as never)}>{priorityLabel(priority)}</DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <DatePickerPopover onChange={(dueAt) => bulkUpdateTasks.mutate({ dueAt: dueAt ?? null } as never)} trigger={<Button size="sm" variant="outline" disabled={bulkUpdateTasks.isPending}><Calendar className="h-3.5 w-3.5" />Due date</Button>} />
      <Button size="sm" variant="ghost" onClick={onSelectAllOrClear}>{selectedTaskIds.size === visibleTaskCount ? 'Clear selection' : 'Select all'}</Button>
      <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={bulkUpdateTasks.isPending || bulkDeleteTasks.isPending} onClick={() => { if (selectedTasks.length) bulkDeleteTasks.mutate(selectedTasks); }}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
      <Button className="ml-auto" size="icon" variant="ghost" aria-label="Clear task selection" onClick={onClear}><X className="h-4 w-4" /></Button>
    </div>
  );
}

function priorityLabel(priority: TaskPriority) {
  return priority === 'NONE' ? 'No priority' : `${priority[0]}${priority.slice(1).toLowerCase()} priority`;
}
