import type { TaskInput, TaskPriority } from './api/types';

export type DefaultTaskDate = 'NONE' | 'TODAY' | 'TOMORROW';

export interface TaskDefaults {
  date: DefaultTaskDate;
  priority: TaskPriority;
  taskListId: string;
}

export const DEFAULT_TASK_DEFAULTS: TaskDefaults = {
  date: 'NONE',
  priority: 'NONE',
  taskListId: '',
};

const STORAGE_KEY = 'itu.task-defaults';

export function getStoredTaskDefaults(): TaskDefaults {
  if (typeof window === 'undefined') return DEFAULT_TASK_DEFAULTS;
  try {
    return { ...DEFAULT_TASK_DEFAULTS, ...JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') };
  } catch {
    return DEFAULT_TASK_DEFAULTS;
  }
}

export function saveStoredTaskDefaults(defaults: TaskDefaults): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
}

export function applyTaskDefaults(input: TaskInput, defaults = getStoredTaskDefaults()): TaskInput {
  return {
    ...input,
    priority: input.priority ?? defaults.priority,
    taskListId: input.taskListId === undefined ? defaults.taskListId || undefined : input.taskListId,
    dueAt: input.dueAt ?? defaultDueAt(defaults.date),
  };
}

function defaultDueAt(date: DefaultTaskDate): string | undefined {
  if (date === 'NONE') return undefined;
  const due = new Date();
  if (date === 'TOMORROW') due.setDate(due.getDate() + 1);
  due.setHours(18, 0, 0, 0);
  return due.toISOString();
}
