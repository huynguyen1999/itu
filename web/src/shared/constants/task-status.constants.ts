import type { TaskStatus } from '@/shared/api/types';

/* ─── Task Status Constants ─── */
export const TASK_STATUS = {
  INBOX: 'INBOX',
  PLANNED: 'PLANNED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  CANCELED: 'CANCELED',
  ARCHIVED: 'ARCHIVED',
} as const satisfies Record<string, TaskStatus>;

export type TaskStatusValue = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

/* ─── Convenience Status Groups ─── */
export const ACTIVE_TASK_STATUSES: readonly TaskStatus[] = [
  TASK_STATUS.INBOX,
  TASK_STATUS.PLANNED,
  TASK_STATUS.IN_PROGRESS,
] as const;

export const DONE_TASK_STATUSES: readonly TaskStatus[] = [TASK_STATUS.COMPLETED, TASK_STATUS.CANCELED] as const;

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [
  TASK_STATUS.COMPLETED,
  TASK_STATUS.CANCELED,
  TASK_STATUS.ARCHIVED,
] as const;
