import type { ProductivityTask, TaskPriority } from '@/shared/api/types';

export type MatrixSortMode =
  | 'manual'
  | 'due'
  | 'priority'
  | 'created'
  | 'created-desc'
  | 'created-asc'
  | 'modified-desc'
  | 'modified-asc'
  | 'title';

const MATRIX_SETTINGS_KEY = 'itu.matrix.settings';

export interface MatrixSettings {
  urgentDueWithinDays: number;
  urgentPriorities: TaskPriority[];
  importantPriorities: TaskPriority[];
  sortMode: MatrixSortMode;
  searchQuery: string;
  showSearch: boolean;
  priorityFilter: Array<TaskPriority | 'ALL'>;
}

export const defaultMatrixSettings: MatrixSettings = {
  urgentDueWithinDays: 2,
  urgentPriorities: ['HIGH'],
  importantPriorities: ['HIGH'],
  sortMode: 'manual',
  searchQuery: '',
  showSearch: false,
  priorityFilter: ['ALL'],
};

const priorities: TaskPriority[] = ['HIGH', 'MEDIUM', 'LOW', 'NONE'];
const sortModes: MatrixSortMode[] = [
  'created',
  'created-desc',
  'created-asc',
  'modified-desc',
  'modified-asc',
  'manual',
  'due',
  'priority',
  'title',
];

export function readMatrixSettings(): MatrixSettings {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(MATRIX_SETTINGS_KEY) || '{}') as Partial<MatrixSettings>;
    return {
      urgentDueWithinDays: readPositiveNumber(parsed.urgentDueWithinDays, defaultMatrixSettings.urgentDueWithinDays),
      urgentPriorities: readPriorityList(parsed.urgentPriorities, defaultMatrixSettings.urgentPriorities),
      importantPriorities: readPriorityList(parsed.importantPriorities, defaultMatrixSettings.importantPriorities),
      sortMode: sortModes.includes(parsed.sortMode as MatrixSortMode)
        ? (parsed.sortMode as MatrixSortMode)
        : defaultMatrixSettings.sortMode,
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : defaultMatrixSettings.searchQuery,
      showSearch: typeof parsed.showSearch === 'boolean' ? parsed.showSearch : defaultMatrixSettings.showSearch,
      priorityFilter: readPriorityFilter(parsed.priorityFilter),
    };
  } catch {
    return defaultMatrixSettings;
  }
}

export function saveMatrixSettings(settings: MatrixSettings) {
  window.localStorage.setItem(MATRIX_SETTINGS_KEY, JSON.stringify(settings));
}

export function matrixQuadrantForTask(task: ProductivityTask, settings: MatrixSettings, now = new Date()) {
  const isImportant = task.important || settings.importantPriorities.includes(task.priority);
  const isUrgent =
    task.urgentOverride ??
    (dueWithinDays(task.dueAt, settings.urgentDueWithinDays, now) || settings.urgentPriorities.includes(task.priority));

  if (isUrgent && isImportant) return 'doFirst';
  if (!isUrgent && isImportant) return 'schedule';
  if (isUrgent && !isImportant) return 'delegate';
  return 'dontDo';
}

function dueWithinDays(dueAt: string | null | undefined, days: number, now: Date) {
  if (!dueAt) return false;
  const due = new Date(dueAt).getTime();
  if (!Number.isFinite(due)) return false;
  return due <= now.getTime() + days * 86_400_000;
}

function readPositiveNumber(value: unknown, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function readPriorityList(value: unknown, fallback: TaskPriority[]) {
  if (!Array.isArray(value)) return fallback;
  const filtered = value.filter((priority): priority is TaskPriority => priorities.includes(priority as TaskPriority));
  return filtered.length ? filtered : fallback;
}

function readPriorityFilter(value: unknown): Array<TaskPriority | 'ALL'> {
  if (!Array.isArray(value)) return defaultMatrixSettings.priorityFilter;
  const filtered = value.filter(
    (priority): priority is TaskPriority | 'ALL' => priority === 'ALL' || priorities.includes(priority as TaskPriority),
  );
  return filtered.length ? filtered : defaultMatrixSettings.priorityFilter;
}
