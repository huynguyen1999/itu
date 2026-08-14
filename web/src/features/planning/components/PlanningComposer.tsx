import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Calendar, FileText, Flag, List, Plus } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { TaskList, TaskPriority, TaskTag } from '@/shared/api/types';
import { getStoredTaskDefaults } from '@/shared/taskDefaults';
import { Button } from '@/shared/ui/button';
import { DatePickerPopover } from '@/shared/ui/DatePickerPopover';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { parseTaskTitleInput } from '../utils/parseTaskTitleInput';
import { formatTaskDate, TaskOptionChip, taskPriorityLabel, TaskSettingsMenu } from './TaskSettingsMenu';

export function PlanningComposer({
  view,
  selectedTaskList,
  selectedTag,
  projects,
  tags,
  onSectionCreated,
  showSectionCreator,
  onShowSectionCreatorChange,
}: {
  view: 'all' | 'today' | 'inbox' | 'upcoming';
  selectedTaskList: string | null;
  selectedTag: string | null;
  projects: TaskList[];
  tags: TaskTag[];
  onSectionCreated: () => void;
  showSectionCreator: boolean;
  onShowSectionCreatorChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [quickTask, setQuickTask] = useState('');
  const [quickDueAt, setQuickDueAt] = useState('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>(() => getStoredTaskDefaults().priority);
  const [quickTaskListId, setQuickTaskListId] = useState('');
  const [quickTagIds, setQuickTagIds] = useState<string[]>([]);
  const [quickDescription, setQuickDescription] = useState('');
  const [quickRemindAt, setQuickRemindAt] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [sectionTitle, setSectionTitle] = useState('');

  const createTask = useMutation({
    mutationFn: async () => {
      const parsed = parseTaskTitleInput(quickTask);
      const title = parsed.cleanTitle || quickTask.trim();
      const dueAtValue = parsed.dueAtDateString ?? quickDueAt;
      const taskListId = quickTaskListId || selectedTaskList || undefined;
      const dueAt = view === 'today'
        ? dueAtValue ? new Date(dueAtValue).toISOString() : new Date().toISOString()
        : dueAtValue ? new Date(dueAtValue).toISOString() : undefined;
      const tagIds = quickTagIds.length ? quickTagIds : selectedTag ? [selectedTag] : undefined;
      const task = await api.createTask({
        title,
        descriptionMarkdown: quickDescription.trim() || undefined,
        taskListId,
        priority: parsed.priority ?? quickPriority,
        dueAt,
        tagIds,
      });
      if (quickRemindAt) await api.createTaskReminder(task.id, { remindAt: new Date(quickRemindAt).toISOString() });
      return task;
    },
    onSuccess: () => {
      setQuickTask('');
      setQuickDescription('');
      setQuickDueAt('');
      setQuickRemindAt('');
      setQuickPriority(getStoredTaskDefaults().priority);
      setQuickTagIds([]);
      setQuickTaskListId('');
    },
  });
  const createSection = useMutation({
    mutationFn: () => api.createTaskSection({ title: sectionTitle.trim(), taskListId: selectedTaskList }),
    onSuccess: async () => {
      setSectionTitle('');
      onShowSectionCreatorChange(false);
      onSectionCreated();
      await queryClient.invalidateQueries({ queryKey: ['task-sections'] });
    },
  });
  const hasOptions = quickPriority !== 'NONE' || Boolean(quickDueAt || quickRemindAt || quickDescription.trim() || quickTaskListId || quickTagIds.length);

  return (
    <>
      <form className="itu-task-composer mx-5 mt-4 rounded-xl border shadow-[var(--shadow-soft)]" onSubmit={(event: FormEvent) => { event.preventDefault(); if (quickTask.trim()) createTask.mutate(); }}>
        <div className="itu-task-composer__main">
          <div className="itu-task-composer__input-wrap">
            <Plus className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
            <Label htmlFor="plan-quick-task" className="sr-only">Add a task</Label>
            <input id="plan-quick-task" value={quickTask} onChange={(event) => setQuickTask(event.target.value)} onFocus={() => setIsInputFocused(true)} onBlur={() => setTimeout(() => setIsInputFocused(false), 200)} placeholder="What needs to get done? (try '!high' or '#today')" autoComplete="off" />
          </div>
          <div className="itu-task-composer__actions">
            {(isInputFocused || quickTask.trim().length > 0 || hasOptions) && (
              <>
                <DatePickerPopover value={quickDueAt} onChange={(value) => setQuickDueAt(value ?? '')} align="end" trigger={<button type="button" className={`itu-icon-button ${quickDueAt ? 'is-active' : ''}`} aria-label={quickDueAt ? `Change due date, ${formatTaskDate(quickDueAt, '')}` : 'Set due date'} title="Set due date"><Calendar aria-hidden="true" /></button>} />
                <TaskSettingsMenu idPrefix="plan" priority={quickPriority} setPriority={setQuickPriority} dueAt={quickDueAt} setDueAt={setQuickDueAt} remindAt={quickRemindAt} setRemindAt={setQuickRemindAt} description={quickDescription} setDescription={setQuickDescription} taskListId={quickTaskListId || selectedTaskList || ''} setTaskListId={setQuickTaskListId} projects={projects} tagIds={quickTagIds} setTagIds={setQuickTagIds} tags={tags} hasOptions={hasOptions} />
              </>
            )}
            <Button type="submit" size="sm" disabled={!quickTask.trim() || createTask.isPending}><Plus aria-hidden="true" />Add</Button>
          </div>
        </div>
        {hasOptions && <div className="itu-task-composer__chips" aria-label="Task options">
          {quickPriority !== 'NONE' && <TaskOptionChip icon={Flag} label={taskPriorityLabel(quickPriority)} onRemove={() => setQuickPriority('NONE')} />}
          {quickDueAt && <TaskOptionChip icon={Calendar} label={`Due ${formatTaskDate(quickDueAt, '')}`} onRemove={() => setQuickDueAt('')} />}
          {quickRemindAt && <TaskOptionChip icon={Bell} label="Reminder set" onRemove={() => setQuickRemindAt('')} />}
          {quickDescription.trim() && <TaskOptionChip icon={FileText} label="Notes added" onRemove={() => setQuickDescription('')} />}
          {quickTaskListId && <TaskOptionChip icon={List} label={projects.find((project) => project.id === quickTaskListId)?.title ?? 'Selected list'} onRemove={() => setQuickTaskListId('')} />}
          {quickTagIds.map((tagId) => <TaskOptionChip key={tagId} label={`#${tags.find((tag) => tag.id === tagId)?.name ?? 'tag'}`} onRemove={() => setQuickTagIds((current) => current.filter((id) => id !== tagId))} />)}
        </div>}
        <p className="sr-only" role="status" aria-live="polite">{createTask.isPending ? 'Adding task' : createTask.isSuccess ? 'Task added' : createTask.isError ? 'Task could not be added. Please try again.' : ''}</p>
        {createTask.isError && <p className="itu-inline-error" role="alert">Task could not be added. Check your connection and try again.</p>}
      </form>
      {showSectionCreator && <form className="itu-section-creator" onSubmit={(event) => { event.preventDefault(); if (sectionTitle.trim()) createSection.mutate(); }}>
        <Plus className="h-4 w-4" />
        <Input autoFocus value={sectionTitle} onChange={(event) => setSectionTitle(event.target.value)} placeholder="Section name, e.g. Processing" aria-label="Section name" />
        <Button size="sm" type="submit" disabled={!sectionTitle.trim() || createSection.isPending}>Add section</Button>
        <Button size="sm" type="button" variant="ghost" onClick={() => onShowSectionCreatorChange(false)}>Cancel</Button>
      </form>}
    </>
  );
}
