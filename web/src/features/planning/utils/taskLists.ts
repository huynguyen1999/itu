import type { TaskList } from '@/shared/api/types';

export function inboxTaskListId(taskLists: TaskList[] | undefined): string | null {
  return taskLists?.find((list) => list.isDefault)?.id ?? null;
}

export function selectableTaskLists(taskLists: TaskList[] | undefined): TaskList[] {
  const listsById = new Map(
    (taskLists ?? [])
      .filter((list) => !list.archivedAt)
      .filter((list) => !list.isDefault)
      .map((list) => [list.id, list]),
  );

  return Array.from(listsById.values());
}
