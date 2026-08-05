import type { Dispatch, SetStateAction } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Bell, Calendar, Flag, Settings2, X } from 'lucide-react';
import type { TaskList, TaskPriority } from '@/shared/api/types';
import { DatePickerPopover } from '@/shared/ui/DatePickerPopover';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { selectableTaskLists } from '../utils/taskLists';

interface TaskSettingsMenuProps {
  idPrefix: string;
  priority: TaskPriority;
  setPriority: (value: TaskPriority) => void;
  dueAt: string;
  setDueAt: (value: string) => void;
  remindAt: string;
  setRemindAt: (value: string) => void;
  description: string;
  setDescription: (value: string) => void;
  taskListId: string;
  setTaskListId: (value: string) => void;
  projects: TaskList[];
  tagIds: string[];
  setTagIds: Dispatch<SetStateAction<string[]>>;
  tags: Array<{ id: string; name: string }>;
  hasOptions: boolean;
}

export function TaskSettingsMenu({
  idPrefix,
  priority,
  setPriority,
  dueAt,
  setDueAt,
  remindAt,
  setRemindAt,
  description,
  setDescription,
  taskListId,
  setTaskListId,
  projects,
  tagIds,
  setTagIds,
  tags,
  hasOptions,
}: TaskSettingsMenuProps) {
  const listInputId = `${idPrefix}-task-list`;
  const notesInputId = `${idPrefix}-task-notes`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={`itu-icon-button ${hasOptions ? 'is-active' : ''}`}
          aria-label="Task settings"
          title="Task settings"
        >
          <Settings2 aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))] space-y-4 p-4">
        <DropdownMenuLabel className="p-0 text-sm font-semibold">Task settings</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <fieldset>
          <legend className="mb-2 text-xs font-medium text-muted-foreground">Priority</legend>
          <div className="grid grid-cols-4 gap-2">
            {(['HIGH', 'MEDIUM', 'LOW', 'NONE'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setPriority(value)}
                aria-pressed={priority === value}
                className={`itu-priority-button ${priority === value ? 'is-active' : ''}`}
              >
                <Flag aria-hidden="true" className={priorityFlagColor(value)} />
                <span>{value === 'NONE' ? 'None' : value[0] + value.slice(1).toLowerCase()}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <Label htmlFor={listInputId} className="mb-1.5 block text-xs text-muted-foreground">
            Project / List
          </Label>
          <select
            id={listInputId}
            value={taskListId}
            onChange={(event) => setTaskListId(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Inbox</option>
            {selectableTaskLists(projects).map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Due date</Label>
            <DatePickerPopover
              value={dueAt}
              onChange={(value) => setDueAt(value ?? '')}
              trigger={
                <button type="button" className="itu-field-button">
                  <Calendar aria-hidden="true" />
                  <span>{formatTaskDate(dueAt, 'Set due date')}</span>
                </button>
              }
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">Reminder</Label>
            <DatePickerPopover
              value={remindAt}
              onChange={(value) => setRemindAt(value ?? '')}
              align="end"
              trigger={
                <button type="button" className="itu-field-button">
                  <Bell aria-hidden="true" />
                  <span>{formatTaskDate(remindAt, 'Set reminder')}</span>
                </button>
              }
            />
          </div>
        </div>
        {tags.length > 0 && (
          <fieldset>
            <legend className="mb-2 text-xs font-medium text-muted-foreground">Tags</legend>
            <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">
              {tags.map((tag) => {
                const selected = tagIds.includes(tag.id);
                return (
                  <button
                    type="button"
                    key={tag.id}
                    onClick={() =>
                      setTagIds((current) => (selected ? current.filter((id) => id !== tag.id) : [...current, tag.id]))
                    }
                    aria-pressed={selected}
                    className={`itu-tag-button ${selected ? 'is-active' : ''}`}
                  >
                    #{tag.name}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}
        <div>
          <Label htmlFor={notesInputId} className="mb-1.5 block text-xs text-muted-foreground">
            Description / Notes
          </Label>
          <Textarea
            id={notesInputId}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Add task notes or details..."
            className="min-h-20 resize-y"
          />
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function TaskOptionChip({
  icon: Icon,
  label,
  onRemove,
}: {
  icon?: LucideIcon;
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="itu-option-chip">
      {Icon && <Icon aria-hidden="true" />}
      <span>{label}</span>
      <button type="button" onClick={onRemove} aria-label={`Remove ${label}`}>
        <X aria-hidden="true" />
      </button>
    </span>
  );
}

export function taskPriorityLabel(priority: TaskPriority) {
  return priority === 'NONE' ? 'No priority' : `${priority[0]}${priority.slice(1).toLowerCase()} priority`;
}

export function priorityFlagColor(priority: TaskPriority) {
  return {
    HIGH: 'fill-rose-500 text-rose-500',
    MEDIUM: 'fill-amber-500 text-amber-500',
    LOW: 'fill-blue-500 text-blue-500',
    NONE: '',
  }[priority];
}

export function formatTaskDate(value: string, emptyLabel: string) {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return emptyLabel;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
