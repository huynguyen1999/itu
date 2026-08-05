import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';

export function TaskComposer({ onCreated }: { onCreated?: () => void }) {
  const queryClient = useQueryClient();
  const taskLists = useQuery({ queryKey: ['task-lists'], queryFn: () => api.taskLists() });
  const tags = useQuery({ queryKey: ['task-tags'], queryFn: () => api.taskTags() });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [taskListId, setTaskListId] = useState('');
  const [priority, setPriority] = useState<'NONE' | 'LOW' | 'MEDIUM' | 'HIGH'>('NONE');
  const [important, setImportant] = useState(false);
  const [dueAt, setDueAt] = useState('');
  const [remindAt, setRemindAt] = useState('');
  const [estimate, setEstimate] = useState('25');
  const [tagIds, setTagIds] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async () => {
      const task = await api.createTask({
        title: title.trim(),
        descriptionMarkdown: description,
        taskListId: taskListId || undefined,
        priority,
        important,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        estimatedMinutes: Number(estimate) || undefined,
        tagIds,
      });
      if (remindAt) await api.createTaskReminder(task.id, { remindAt: new Date(remindAt).toISOString() });
      return task;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setTitle('');
      setDescription('');
      setDueAt('');
      setRemindAt('');
      onCreated?.();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (title.trim()) create.mutate();
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="task-title">Task</Label>
        <Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="task-notes">Notes</Label>
        <Textarea id="task-notes" value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Task List
          <select
            className="h-10 rounded-md border bg-background px-3"
            value={taskListId}
            onChange={(event) => setTaskListId(event.target.value)}
          >
            <option value="">Inbox</option>
            {taskLists.data
              ?.filter((list) => !list.archivedAt)
              .map((list) => (
                <option key={list.id} value={list.id}>
                  {list.title}
                </option>
              ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Priority
          <select
            className="h-10 rounded-md border bg-background px-3"
            value={priority}
            onChange={(event) => setPriority(event.target.value as typeof priority)}
          >
            <option value="NONE">None</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Due
          <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Reminder
          <Input type="datetime-local" value={remindAt} onChange={(event) => setRemindAt(event.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Estimate (minutes)
          <Input type="number" min="1" value={estimate} onChange={(event) => setEstimate(event.target.value)} />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium">
          <input type="checkbox" checked={important} onChange={(event) => setImportant(event.target.checked)} />
          Important
        </label>
      </div>
      {!!tags.data?.length && (
        <div className="flex flex-wrap gap-2">
          {tags.data.map((tag) => (
            <button
              type="button"
              key={tag.id}
              onClick={() =>
                setTagIds((current) =>
                  current.includes(tag.id) ? current.filter((id) => id !== tag.id) : [...current, tag.id],
                )
              }
              className={`rounded-full border px-3 py-1 text-xs ${tagIds.includes(tag.id) ? 'bg-primary text-primary-foreground' : ''}`}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
      {create.isError && <p className="text-sm text-destructive">Task could not be created.</p>}
      <Button disabled={create.isPending || !title.trim()}>{create.isPending ? 'Creating…' : 'Create task'}</Button>
    </form>
  );
}
