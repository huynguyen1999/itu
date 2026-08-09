import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';

interface TaskComposerFormValues {
  title: string;
  description: string;
  taskListId: string;
  priority: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
  important: boolean;
  dueAt: string;
  remindAt: string;
  estimate: string;
  tagIds: string[];
}

export function TaskComposer({ onCreated }: { onCreated?: () => void }) {
  const queryClient = useQueryClient();
  const taskLists = useQuery({ queryKey: ['task-lists'], queryFn: () => api.taskLists() });
  const tags = useQuery({ queryKey: ['task-tags'], queryFn: () => api.taskTags() });

  const { register, handleSubmit, watch, setValue, reset } = useForm<TaskComposerFormValues>({
    defaultValues: {
      title: '',
      description: '',
      taskListId: '',
      priority: 'NONE',
      important: false,
      dueAt: '',
      remindAt: '',
      estimate: '25',
      tagIds: [],
    },
  });

  const title = watch('title');
  const selectedTagIds = watch('tagIds');

  const create = useMutation({
    mutationFn: async (values: TaskComposerFormValues) => {
      const task = await api.createTask({
        title: values.title.trim(),
        descriptionMarkdown: values.description,
        taskListId: values.taskListId || undefined,
        priority: values.priority,
        important: values.important,
        dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : undefined,
        estimatedMinutes: Number(values.estimate) || undefined,
        tagIds: values.tagIds,
      });
      if (values.remindAt) {
        await api.createTaskReminder(task.id, { remindAt: new Date(values.remindAt).toISOString() });
      }
      return task;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/productivity/tasks'] });
      reset();
      onCreated?.();
    },
  });

  const toggleTag = (tagId: string) => {
    const current = selectedTagIds || [];
    setValue(
      'tagIds',
      current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId],
    );
  };

  return (
    <form onSubmit={handleSubmit((values) => create.mutate(values))} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="task-title">Task</Label>
        <Input id="task-title" {...register('title')} autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="task-notes">Notes</Label>
        <Textarea id="task-notes" {...register('description')} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Task List
          <select className="h-10 rounded-md border bg-background px-3" {...register('taskListId')}>
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
          <select className="h-10 rounded-md border bg-background px-3" {...register('priority')}>
            <option value="NONE">None</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Due
          <Input type="datetime-local" {...register('dueAt')} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Reminder
          <Input type="datetime-local" {...register('remindAt')} />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Estimate (minutes)
          <Input type="number" min="1" {...register('estimate')} />
        </label>
        <label className="flex items-end gap-2 pb-2 text-sm font-medium">
          <input type="checkbox" {...register('important')} />
          Important
        </label>
      </div>
      {!!tags.data?.length && (
        <div className="flex flex-wrap gap-2">
          {tags.data.map((tag) => (
            <button
              type="button"
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className={`rounded-full border px-3 py-1 text-xs ${(selectedTagIds || []).includes(tag.id) ? 'bg-primary text-primary-foreground' : ''}`}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}
      {create.isError && <p className="text-sm text-destructive">Task could not be created.</p>}
      <Button disabled={create.isPending || !title?.trim()}>{create.isPending ? 'Creating…' : 'Create task'}</Button>
    </form>
  );
}
