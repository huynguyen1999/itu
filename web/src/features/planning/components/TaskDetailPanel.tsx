import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Calendar, Clock3, Flag, Play, Tag, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/shared/api/client';
import type { ProductivityTask, TaskPriority } from '@/shared/api/types';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';

export function TaskDetailPanel({ task, onClose }: { task: ProductivityTask | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('NONE');
  const [dueAt, setDueAt] = useState('');
  const [estimate, setEstimate] = useState('');

  useEffect(() => {
    setTitle(task?.title ?? '');
    setDescription(task?.descriptionMarkdown ?? '');
    setPriority(task?.priority ?? 'NONE');
    setDueAt(toLocalInput(task?.dueAt));
    setEstimate(task?.estimatedMinutes ? String(task.estimatedMinutes) : '');
  }, [task]);

  const save = useMutation({
    mutationFn: () => {
      if (!task) throw new Error('No task selected');
      return api.updateTask(task.id, {
        title: title.trim(),
        descriptionMarkdown: description,
        priority,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        estimatedMinutes: Number(estimate) || undefined,
        version: task.version,
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (task && title.trim()) save.mutate();
  }

  if (!task) {
    return (
      <aside className="itu-task-detail itu-task-detail--empty">
        <div className="itu-empty-orbit" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p>Select a task to see its details</p>
        <span>Dates, notes, tags, reminders, and Focus live here.</span>
      </aside>
    );
  }

  return (
    <aside className="itu-task-detail">
      <form onSubmit={submit} className="flex h-full flex-col">
        <header className="itu-detail-header">
          <span>{(task.taskList ?? task.project)?.title ?? 'Inbox'}</span>
          <Button type="button" size="icon" variant="ghost" onClick={onClose} aria-label="Close task details">
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="itu-detail-scroll">
          <Input
            className="itu-detail-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            aria-label="Task title"
          />
          <Textarea
            className="itu-detail-description"
            placeholder="Add notes…"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          <div className="itu-detail-fields">
            <label>
              <Calendar />
              <span>Due date</span>
              <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
            </label>
            <label>
              <Flag />
              <span>Priority</span>
              <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
                <option value="NONE">None</option>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
            <label>
              <Clock3 />
              <span>Estimate</span>
              <input
                type="number"
                min="1"
                placeholder="Minutes"
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
              />
            </label>
            <div>
              <Tag />
              <span>Tags</span>
              <p>{task.tags.length ? task.tags.map(({ tag }) => `#${tag.name}`).join(' ') : 'None'}</p>
            </div>
          </div>
        </div>
        <footer className="itu-detail-footer">
          <Button type="button" variant="outline" asChild>
            <Link to={`/focus?task=${task.id}`}>
              <Play className="h-4 w-4" />
              Start Focus
            </Link>
          </Button>
          <Button disabled={save.isPending || !title.trim()}>{save.isPending ? 'Saving…' : 'Save changes'}</Button>
        </footer>
      </form>
    </aside>
  );
}

function toLocalInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
