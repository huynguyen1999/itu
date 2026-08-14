import type { FormEvent } from 'react';
import type { TaskPriority } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { Calendar, Flag } from 'lucide-react';
import { DatePickerPopover } from '@/shared/ui/DatePickerPopover';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';
import { MATRIX_COLUMNS } from './MatrixTaskGrid';

type MatrixTaskDialogProps = {
  open: boolean;
  quadrant: string | null;
  title: string;
  priority: TaskPriority;
  dueAt: string;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onTitleChange: (title: string) => void;
  onPriorityChange: (priority: TaskPriority) => void;
  onDueAtChange: (dueAt: string) => void;
  onSubmit: (event: FormEvent) => void;
};

export function MatrixTaskDialog({
  open,
  quadrant,
  title,
  priority,
  dueAt,
  isPending,
  onOpenChange,
  onTitleChange,
  onPriorityChange,
  onDueAtChange,
  onSubmit,
}: MatrixTaskDialogProps) {
  const quadrantLabel = MATRIX_COLUMNS.find(([key]) => key === quadrant)?.[1] ?? '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{quadrant ? `New task — ${quadrantLabel}` : 'New task'}</DialogTitle>
          <DialogDescription>
            {quadrant
              ? `This task will be placed in the "${quadrantLabel}" quadrant.`
              : 'Create a new task. You can move it between quadrants later.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="new-task-title" className="mb-1.5 block text-sm font-medium">
              Title
            </label>
            <Input
              id="new-task-title"
              autoFocus
              value={title}
              onChange={(event) => onTitleChange(event.target.value)}
              placeholder="What needs to be done?"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Priority</label>
            <div className="flex items-center gap-2">
              {(['NONE', 'LOW', 'MEDIUM', 'HIGH'] as TaskPriority[]).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onPriorityChange(value)}
                  className={`flex h-9 flex-1 items-center justify-center gap-1 rounded-lg border text-xs font-semibold transition-colors ${
                    priority === value
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-input text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Flag
                    className={`h-3.5 w-3.5 ${
                      value === 'HIGH'
                        ? 'fill-rose-500 text-rose-500'
                        : value === 'MEDIUM'
                          ? 'fill-amber-500 text-amber-500'
                          : value === 'LOW'
                            ? 'fill-blue-500 text-blue-500'
                            : 'text-muted-foreground'
                    }`}
                  />
                  {value === 'NONE' ? 'None' : value.toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium">Due date</label>
            <DatePickerPopover
              value={dueAt}
              onChange={(value) => onDueAtChange(value ?? '')}
              trigger={
                <button
                  type="button"
                  className={`flex h-10 w-full items-center gap-2 rounded-md border bg-background px-3 text-left text-sm transition-colors hover:bg-muted ${
                    dueAt ? 'border-primary' : 'border-input text-muted-foreground'
                  }`}
                >
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>{dueAt ? new Date(dueAt).toLocaleDateString() : 'No due date'}</span>
                </button>
              }
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={!title.trim() || isPending}>
              {isPending ? 'Creating…' : 'Create task'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
