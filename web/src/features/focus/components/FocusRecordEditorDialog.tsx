import type { FocusSession } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';

type FocusTask = { id: string; title: string; status: string };

export function FocusRecordEditorDialog({
  session,
  tasks,
  startedAt,
  completedAt,
  taskId,
  isPending,
  onOpenChange,
  onStartedAtChange,
  onCompletedAtChange,
  onTaskChange,
  onCancel,
  onSave,
}: {
  session: FocusSession | null;
  tasks: FocusTask[];
  startedAt: string;
  completedAt: string;
  taskId: string;
  isPending: boolean;
  onOpenChange: (open: boolean) => void;
  onStartedAtChange: (value: string) => void;
  onCompletedAtChange: (value: string) => void;
  onTaskChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const isTimeRangeInvalid = Boolean(startedAt && completedAt && new Date(completedAt) <= new Date(startedAt));

  return (
    <Dialog open={Boolean(session)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Edit Focus Record</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Start</label>
            <Input type="datetime-local" value={startedAt} onChange={(event) => onStartedAtChange(event.target.value)} />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">End</label>
            <Input
              type="datetime-local"
              value={completedAt}
              onChange={(event) => onCompletedAtChange(event.target.value)}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Task</label>
            <select
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
              value={taskId}
              onChange={(event) => onTaskChange(event.target.value)}
            >
              <option value="">No task</option>
              {tasks
                .filter((task) => !['CANCELED', 'ARCHIVED'].includes(task.status))
                .map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
            </select>
          </div>
          {isTimeRangeInvalid && <p className="text-xs text-destructive">End time must be after start time.</p>}
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={isPending || isTimeRangeInvalid}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
