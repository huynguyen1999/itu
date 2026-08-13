import { FormEvent, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CornerDownRight, Flag, ListTodo, Plus, Play, Trash2, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/shared/api/client';
import type { ProductivityTask, TaskPriority, TaskReminder } from '@/shared/api/types';
import { DatePickerPopover } from '@/shared/ui/DatePickerPopover';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogOverlay, DialogPortal } from '@/shared/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/shared/ui/dropdown-menu';
import { useUndoStack, useUndoToast } from '@/shared/hooks/useUndoStack';
import { UndoToast } from '@/shared/ui/UndoToast';
import { GrowthRewardEditor, type GrowthRewardEditorHandle } from '@/shared/ui/GrowthRewardEditor';
import { nextTaskStatus, taskStatusLabel } from '../utils/taskStatus';
import { inboxTaskListId, selectableTaskLists } from '../utils/taskLists';
import {
  createReminderDraft,
  queueReminderRemove,
  queueReminderUpdate,
  type PendingReminderChange,
  type ReminderCreateInput,
} from '../utils/taskReminderDraft';
import { updateTaskInCalendarCache } from '@/features/calendar/calendarProjection';

export function TaskDetailModal({
  task,
  tasks,
  isOpen,
  onClose,
}: {
  task: ProductivityTask | null;
  tasks: ProductivityTask[];
  isOpen: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('NONE');
  const [dueAt, setDueAt] = useState('');
  const [scheduledStartAt, setScheduledStartAt] = useState<string | null>(null);
  const [scheduledEndAt, setScheduledEndAt] = useState<string | null>(null);
  const [estimate, setEstimate] = useState('');
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [taskListId, setTaskListId] = useState<string | null>(null);
  const [reminderDrafts, setReminderDrafts] = useState<TaskReminder[]>([]);
  const [pendingReminderChanges, setPendingReminderChanges] = useState<PendingReminderChange[]>([]);
  const nextDraftReminderId = useRef(0);
  const growthEditorRef = useRef<GrowthRewardEditorHandle>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const projects = useQuery({ queryKey: ['task-lists'], queryFn: () => api.taskLists() });
  const allTags = useQuery({ queryKey: ['task-tags'], queryFn: () => api.taskTags() });
  const inboxListId = inboxTaskListId(projects.data);

  const subtasks = tasks.filter((candidate) => candidate.parentId === task?.id);

  useEffect(() => {
    setSaveError(null);
    if (task) {
      setTitle(task.title ?? '');
      setDescription(task.descriptionMarkdown ?? '');
      setPriority(task.priority ?? 'NONE');
      setDueAt(toLocalInput(task.dueAt));
      setScheduledStartAt(task.scheduledStartAt ?? null);
      setScheduledEndAt(task.scheduledEndAt ?? null);
      setEstimate(task.estimatedMinutes ? String(task.estimatedMinutes) : '');
      setTaskListId(task.taskListId ?? task.projectId ?? null);
      setReminderDrafts(
        task.reminders.filter((reminder) => reminder.status === 'SCHEDULED' || reminder.status === 'SNOOZED'),
      );
      setPendingReminderChanges([]);
    }
  }, [task?.id, isOpen]);

  function changedValue(next: string | null | undefined, snapshot: string | null | undefined) {
    const n = next ?? null;
    const s = snapshot ?? null;
    if (n === s) return false;
    if (n && s) return new Date(n).getTime() !== new Date(s).getTime();
    return true;
  }

  const saveTask = useMutation({
    mutationFn: () => {
      if (!task) throw new Error('No task selected');
      const patch: Record<string, unknown> = { version: task.version };
      const fieldEditedAt: Record<string, string> = {};
      const editedAt = new Date().toISOString();

      const nextTitle = title.trim();
      if (nextTitle !== task.title) patch.title = nextTitle;
      if (description !== task.descriptionMarkdown) patch.descriptionMarkdown = description;
      if (priority !== task.priority) patch.priority = priority;
      const nextDueAt = dueAt ? new Date(dueAt).toISOString() : null;
      if (changedValue(nextDueAt, task.dueAt)) {
        patch.dueAt = nextDueAt;
        fieldEditedAt.dueAt = editedAt;
      }
      const nextStart = scheduledStartAt ?? null;
      const nextEnd = scheduledEndAt ?? null;
      if (changedValue(nextStart, task.scheduledStartAt) || changedValue(nextEnd, task.scheduledEndAt)) {
        patch.scheduledStartAt = nextStart;
        patch.scheduledEndAt = nextEnd;
        fieldEditedAt.scheduledStartAt = editedAt;
        fieldEditedAt.scheduledEndAt = editedAt;
      }
      const nextEstimate = estimate ? Number(estimate) : undefined;
      if ((nextEstimate ?? null) !== (task.estimatedMinutes ?? null)) patch.estimatedMinutes = nextEstimate;
      if (taskListId !== (task.taskListId ?? task.projectId ?? null)) patch.taskListId = taskListId;
      if (Object.keys(fieldEditedAt).length > 0) patch.fieldEditedAt = fieldEditedAt;
      return api.updateTask(task.id, patch);
    },
    onSuccess: (updatedTask) => {
      updateTaskInCalendarCache(queryClient, updatedTask);
    },
  });
  const [isSaving, setIsSaving] = useState(false);

  const { push } = useUndoStack();
  const undoToast = useUndoToast();

  const toggleStatus = useMutation({
    mutationFn: ({
      taskId,
      nextStatus,
      version,
    }: {
      taskId: string;
      title: string;
      prevStatus: ProductivityTask['status'];
      nextStatus: ProductivityTask['status'];
      version: number;
    }) => api.updateTask(taskId, { status: nextStatus, version }),
    onSuccess: (_, { taskId, title: taskTitle, prevStatus, nextStatus }) => {
      const undoAction = {
        label: `"${taskTitle.slice(0, 25)}" → ${taskStatusLabel(nextStatus)}`,
        undo: async () => {
          await api.updateTask(taskId, { status: prevStatus });
        },
      };
      push(undoAction);
      undoToast.show(undoAction);
    },
  });

  const createSubtask = useMutation({
    mutationFn: (subtaskTitle: string) => {
      if (!task) throw new Error('No task selected');
      return api.createTask({
        title: subtaskTitle.trim(),
        parentId: task.id,
        taskListId: taskListId ?? undefined,
      });
    },
    onSuccess: () => {
      setNewSubtaskTitle('');
    },
  });

  const toggleSubtask = useMutation({
    mutationFn: ({ subtask, isDone }: { subtask: ProductivityTask; isDone: boolean }) => {
      return api.updateTask(subtask.id, {
        status: isDone ? 'PLANNED' : 'COMPLETED',
        version: subtask.version,
      });
    },
  });

  const deleteSubtask = useMutation({
    mutationFn: (subtaskId: string) => api.deleteTask(subtaskId),
  });

  const deleteTask = useMutation({
    mutationFn: () => {
      if (!task) throw new Error('No task selected');
      return api.deleteTask(task.id);
    },
    onSuccess: () => {
      onClose();
    },
  });

  const toggleTag = useMutation({
    mutationFn: (tagId: string) => {
      if (!task) throw new Error('No task selected');
      const currentTagIds = task.tags.map((t) => t.tag.id);
      const nextTagIds = currentTagIds.includes(tagId)
        ? currentTagIds.filter((id) => id !== tagId)
        : [...currentTagIds, tagId];

      return api.updateTask(task.id, {
        tagIds: nextTagIds,
        version: task.version,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  if (!task) return null;

  const selectedTask = task;
  const isDone = task.status === 'COMPLETED';

  async function handleSave(event?: FormEvent) {
    event?.preventDefault();
    if (!title.trim()) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      await growthEditorRef.current?.savePendingChanges();
      await saveTask.mutateAsync();
      for (const change of pendingReminderChanges) {
        if (change.kind === 'create') await api.createTaskReminder(selectedTask.id, change.input);
        if (change.kind === 'update') await api.updateTaskReminder(change.id, { remindAt: change.remindAt });
        if (change.kind === 'remove') await api.dismissTaskReminder(change.id);
      }
      onClose();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Failed to save task.');
    } finally {
      setIsSaving(false);
    }
  }

  function stageReminderCreate(input: ReminderCreateInput) {
    const id = `draft-reminder-${nextDraftReminderId.current++}`;
    const fallbackRemindAt =
      input.relativeTo === 'SCHEDULE_START_AT'
        ? scheduledStartAt
        : dueAt
          ? new Date(dueAt).toISOString()
          : (selectedTask.dueAt ?? scheduledStartAt);
    setReminderDrafts((current) => [
      ...current,
      createReminderDraft(id, input, fallbackRemindAt ?? new Date().toISOString()),
    ]);
    setPendingReminderChanges((current) => [...current, { kind: 'create', draftId: id, input }]);
  }

  function stageReminderUpdate(id: string, remindAt: string) {
    setReminderDrafts((current) =>
      current.map((reminder) => (reminder.id === id ? { ...reminder, remindAt } : reminder)),
    );
    setPendingReminderChanges((current) => queueReminderUpdate(current, id, remindAt));
  }

  function stageReminderRemove(id: string) {
    setReminderDrafts((current) => current.filter((reminder) => reminder.id !== id));
    setPendingReminderChanges((current) => queueReminderRemove(current, id));
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPortal>
        <DialogOverlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm animate-in fade-in-0" />
        <DialogContent
          hideCloseButton
          hideOverlay
          className="fixed left-[50%] top-[50%] z-50 flex h-auto min-h-[18rem] max-h-[90dvh] w-full max-w-xl translate-x-[-50%] translate-y-[-50%] flex-col border bg-card p-0 text-card-foreground shadow-2xl rounded-2xl overflow-hidden duration-200"
        >
          <DialogTitle className="sr-only">Edit Task: {task.title}</DialogTitle>

          {/* Top Header Bar */}
          <div className="flex items-center justify-between border-b border-border px-5 py-3.5 bg-muted/30">
            <div className="flex items-center gap-3">
              {/* Status Square Button */}
              <button
                type="button"
                onClick={() =>
                  toggleStatus.mutate({
                    taskId: task.id,
                    title: task.title,
                    prevStatus: task.status,
                    nextStatus: nextTaskStatus(task.status),
                    version: task.version,
                  })
                }
                className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                  isDone
                    ? 'bg-emerald-600 border-emerald-600 text-white font-bold'
                    : task.status === 'IN_PROGRESS'
                      ? 'border-blue-500 bg-blue-500/20 text-blue-500 font-bold'
                      : task.status === 'CANCELED'
                        ? 'border-slate-500 bg-slate-500/20 text-slate-400 font-bold'
                        : 'border-input hover:border-primary hover:bg-primary/10'
                }`}
                title={`Status: ${task.status} -> Click to cycle next status`}
              >
                {isDone ? (
                  <Check className="h-3.5 w-3.5 stroke-[3]" />
                ) : task.status === 'IN_PROGRESS' ? (
                  <Play className="h-3 w-3 fill-current text-blue-500 animate-pulse ml-0.5" />
                ) : task.status === 'CANCELED' ? (
                  <X className="h-3.5 w-3.5" />
                ) : null}
              </button>

              <span className="h-4 w-px bg-border" />

              {/* Due Date Picker */}
              <DatePickerPopover
                value={dueAt ? new Date(dueAt).toISOString() : task.dueAt}
                onChange={(iso) => {
                  setDueAt(iso ? toLocalInput(iso) : '');
                }}
                scheduledStartAt={scheduledStartAt}
                scheduledEndAt={scheduledEndAt}
                onScheduleChange={(startAt, endAt) => {
                  setScheduledStartAt(startAt);
                  setScheduledEndAt(endAt);
                }}
                reminders={reminderDrafts}
                onReminderCreate={stageReminderCreate}
                onReminderUpdate={stageReminderUpdate}
                onReminderRemove={stageReminderRemove}
              />
            </div>

            <div className="flex items-center gap-2">
              {/* Priority Flag Selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-lg border border-input bg-background px-2.5 py-1 text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
                    title={`Priority: ${priority}`}
                  >
                    <Flag
                      className={`h-3.5 w-3.5 ${
                        priority === 'HIGH'
                          ? 'text-rose-500 fill-rose-500'
                          : priority === 'MEDIUM'
                            ? 'text-amber-500 fill-amber-500'
                            : priority === 'LOW'
                              ? 'text-blue-500 fill-blue-500'
                              : 'text-muted-foreground'
                      }`}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  {(['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const).map((p) => (
                    <DropdownMenuItem
                      key={p}
                      onSelect={() => {
                        setPriority(p);
                      }}
                      className="flex items-center gap-2 text-xs font-medium cursor-pointer"
                    >
                      <Flag
                        className={`h-3.5 w-3.5 ${
                          p === 'HIGH'
                            ? 'text-rose-500 fill-rose-500'
                            : p === 'MEDIUM'
                              ? 'text-amber-500 fill-amber-500'
                              : p === 'LOW'
                                ? 'text-blue-500 fill-blue-500'
                                : 'text-muted-foreground'
                        }`}
                      />
                      <span>{p.charAt(0) + p.slice(1).toLowerCase()} Priority</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Modal Main Content */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6 space-y-5">
            {/* Save error */}
            {saveError ? (
              <p
                className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive"
                role="alert"
              >
                {saveError}
              </p>
            ) : null}
            {/* Title Input */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task Title"
              className={`w-full bg-transparent text-xl font-bold text-foreground placeholder:text-muted-foreground focus:outline-none ${
                isDone ? 'line-through text-muted-foreground' : ''
              }`}
            />

            {/* Description / Notes */}
            <div className="space-y-1">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="• strength:&#10;• weakness:&#10;• what I done:&#10;• skills:"
                rows={4}
                className="w-full bg-muted/30 border border-input rounded-xl p-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary resize-y leading-relaxed font-sans"
              />
            </div>

            {/* Subtasks Section */}
            <GrowthRewardEditor ref={growthEditorRef} sourceType="TASK" sourceId={task.id} />

            {/* Subtasks Section */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground font-semibold">
                <span className="flex items-center gap-1.5">
                  <ListTodo className="h-4 w-4 text-primary" />
                  Subtasks ({subtasks.filter((s) => s.status === 'COMPLETED').length}/{subtasks.length})
                </span>
              </div>

              <div className="space-y-1.5">
                {subtasks.map((st) => {
                  const stDone = st.status === 'COMPLETED';
                  return (
                    <div
                      key={st.id}
                      className="group flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs border border-border/60 hover:border-border transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <button
                          type="button"
                          onClick={() => toggleSubtask.mutate({ subtask: st, isDone: stDone })}
                          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                            stDone ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                          }`}
                        >
                          {stDone && <Check className="h-3 w-3 stroke-[3]" />}
                        </button>
                        <span
                          className={`truncate text-foreground ${stDone ? 'line-through text-muted-foreground' : ''}`}
                        >
                          {st.title}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteSubtask.mutate(st.id)}
                        className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-rose-500 transition-opacity"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}

                {/* Add Subtask Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newSubtaskTitle.trim()) createSubtask.mutate(newSubtaskTitle);
                  }}
                  className="flex items-center gap-2 rounded-lg border border-dashed border-input px-3 py-1.5 hover:border-primary transition-colors"
                >
                  <CornerDownRight className="h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={newSubtaskTitle}
                    onChange={(e) => setNewSubtaskTitle(e.target.value)}
                    placeholder="Add subtask and press Enter..."
                    className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                  {newSubtaskTitle.trim() && (
                    <Button size="sm" type="submit" variant="ghost" className="h-6 px-2 text-xs text-primary">
                      Add
                    </Button>
                  )}
                </form>
              </div>
            </div>

            {/* Tags Section */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                {task.tags.map(({ tag }) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs text-primary font-medium"
                  >
                    #{tag.name}
                    <button
                      type="button"
                      onClick={() => toggleTag.mutate(tag.id)}
                      className="hover:text-rose-500 ml-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}

                {/* Add Tag Dropdown */}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-input bg-muted/40 px-2.5 py-0.5 text-xs text-muted-foreground hover:border-primary hover:text-foreground transition-colors"
                    >
                      <Plus className="h-3 w-3" /> Tag
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    {allTags.data?.map((tag) => {
                      const isSelected = task.tags.some((t) => t.tag.id === tag.id);
                      return (
                        <DropdownMenuItem
                          key={tag.id}
                          onSelect={() => toggleTag.mutate(tag.id)}
                          className="flex items-center justify-between text-xs cursor-pointer"
                        >
                          <span>#{tag.name}</span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>

          {/* Modal Footer Bar */}
          <div className="z-10 flex shrink-0 items-center justify-between border-t border-border bg-muted/95 px-5 py-3.5 backdrop-blur">
            {/* List / Project selector */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-primary transition-colors"
                >
                  <span>{(task.taskList ?? task.project)?.title ?? 'Inbox'}</span>
                  <span className="text-xs text-muted-foreground">▾</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48">
                <DropdownMenuItem
                  onSelect={() => {
                    setTaskListId(inboxListId);
                  }}
                  className="text-xs cursor-pointer"
                >
                  Inbox
                </DropdownMenuItem>
                {selectableTaskLists(projects.data).map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onSelect={() => {
                      setTaskListId(p.id);
                    }}
                    className="text-xs cursor-pointer truncate"
                  >
                    {p.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Link to={`/focus?task=${task.id}`}>
                  <Play className="h-3.5 w-3.5 text-primary fill-primary" />
                  Start Focus
                </Link>
              </Button>

              <button
                type="button"
                onClick={() => deleteTask.mutate()}
                className="rounded-lg p-2 text-muted-foreground hover:bg-rose-500/10 hover:text-rose-500 transition-colors"
                title="Delete task"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <Button
                size="sm"
                onClick={() => handleSave()}
                disabled={isSaving || saveTask.isPending || !title.trim()}
                aria-busy={isSaving || saveTask.isPending}
                className="h-8 min-w-[68px] px-4 text-xs transition-opacity"
              >
                {isSaving || saveTask.isPending ? 'Saving…' : 'Save'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </DialogPortal>
      <UndoToast action={undoToast.current} onUndo={undoToast.handleUndo} onDismiss={undoToast.dismiss} />
    </Dialog>
  );
}

function toLocalInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
