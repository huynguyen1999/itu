import type { QueryClient } from '@tanstack/react-query';
import type { CalendarTimelineItem, ProductivityTask } from '@/shared/api/types';

export function projectTaskToCalendarItem(
  task: ProductivityTask,
  options?: {
    showCompleted?: boolean;
    color?: string | null;
  },
): CalendarTimelineItem | null {
  const showCompleted = options?.showCompleted ?? false;
  const statusUpper = typeof task.status === 'string' ? task.status.toUpperCase() : '';
  if (!showCompleted && statusUpper === 'COMPLETED') {
    return null;
  }
  if (statusUpper === 'ARCHIVED' || statusUpper === 'CANCELED') {
    return null;
  }

  // Duration task take priority if scheduled start/end exist
  if (task.scheduledStartAt && task.scheduledEndAt) {
    return {
      id: `task-duration-${task.id}`,
      kind: 'TASK_DURATION',
      title: task.title,
      startAt: task.scheduledStartAt,
      endAt: task.scheduledEndAt,
      allDay: false,
      dueAt: task.dueAt,
      color: options?.color ?? task.project?.color ?? null,
      readOnly: false,
      status: task.status,
      taskId: task.id,
      priority: task.priority,
      description: task.descriptionMarkdown,
    };
  }

  // Due-only task
  if (task.dueAt) {
    return {
      id: `task-due-${task.id}`,
      kind: 'TASK_DUE',
      title: task.title,
      startAt: task.dueAt,
      endAt: null,
      allDay: true,
      dueAt: task.dueAt,
      color: options?.color ?? task.project?.color ?? null,
      readOnly: false,
      status: task.status,
      taskId: task.id,
      priority: task.priority,
      description: task.descriptionMarkdown,
    };
  }

  return null;
}

/**
 * Optimistically updates TanStack Query timeline queries in-place when a task is updated or saved.
 */
export function updateTaskInCalendarCache(
  queryClient: QueryClient,
  task: ProductivityTask,
  options?: { showCompleted?: boolean },
): void {
  const newItem = projectTaskToCalendarItem(task, options);

  // Update cached tasks list safely for array or object structures
  queryClient.setQueriesData(
    { queryKey: ['calendar', 'tasks'] },
    (old: any) => {
      if (!old) return old;
      if (Array.isArray(old)) {
        const idx = old.findIndex((t: any) => t?.id === task.id);
        if (idx < 0) return [...old, task];
        const next = [...old];
        next[idx] = task;
        return next;
      }
      if (typeof old === 'object' && old !== null && 'items' in old && Array.isArray((old as any).items)) {
        const items = (old as any).items;
        const index = items.findIndex((t: any) => t?.id === task.id);
        if (index < 0) {
          return { ...old, items: [...items, task] };
        }
        const nextItems = [...items];
        nextItems[index] = task;
        return { ...old, items: nextItems };
      }
      return old;
    },
  );

  // Update cached task query if single task query exists
  queryClient.setQueryData(['task', task.id], task);

  // Update all cached calendar timeline queries safely
  queryClient.setQueriesData(
    { queryKey: ['calendar', 'timeline'] },
    (oldData: any) => {
      if (!oldData || typeof oldData !== 'object' || !('items' in oldData) || !Array.isArray(oldData.items)) {
        return oldData;
      }

      const items = oldData.items as CalendarTimelineItem[];
      // Filter out any previous item corresponding to this taskId
      const filtered = items.filter(
        (item) => item && item.taskId !== task.id && !(item.id && item.id.includes(task.id)),
      );

      if (!newItem) {
        return { ...oldData, items: filtered };
      }

      return {
        ...oldData,
        items: [...filtered, newItem],
      };
    },
  );
}
