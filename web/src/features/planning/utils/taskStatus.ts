import type { TaskStatus } from '@/shared/api/types';

export function nextTaskStatus(status: TaskStatus): TaskStatus {
  if (status === 'INBOX' || status === 'PLANNED') return 'IN_PROGRESS';
  if (status === 'IN_PROGRESS') return 'COMPLETED';
  return 'PLANNED';
}

export function taskStatusLabel(status: TaskStatus): string {
  const labels: Record<TaskStatus, string> = {
    INBOX: 'Inbox',
    PLANNED: 'Planned',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    CANCELED: 'Abandoned',
    ARCHIVED: 'Archived',
  };
  return labels[status];
}
