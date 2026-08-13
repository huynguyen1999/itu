import type { TaskInput, TaskPriority } from './api/types';
import { getStoredTaskPreferences } from './api/preferencesApi';

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

export function applyDefaultDueTime(date: Date): Date {
  const due = new Date(date);
  const [hours, minutes] = getStoredTaskPreferences().defaultDueTime.split(':').map(Number);
  due.setHours(Number.isFinite(hours) ? hours : 21, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return due;
}

function defaultDueAt(date: DefaultTaskDate): string | undefined {
  if (date === 'NONE') return undefined;
  const due = new Date();
  if (date === 'TOMORROW') due.setDate(due.getDate() + 1);
  return applyDefaultDueTime(due).toISOString();
}
