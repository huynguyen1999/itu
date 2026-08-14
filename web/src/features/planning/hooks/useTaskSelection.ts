import { useEffect, useMemo, useState } from 'react';
import type { ProductivityTask } from '@/shared/api/types';

export function reconcileTaskSelection(
  selectedTaskIds: Set<string>,
  availableTaskIds: ReadonlySet<string>,
): Set<string> {
  const next = new Set([...selectedTaskIds].filter((id) => availableTaskIds.has(id)));
  return next.size === selectedTaskIds.size ? selectedTaskIds : next;
}

export function useTaskSelection(allTasks: ProductivityTask[], visibleTasks: ProductivityTask[]) {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    if (selectedTaskId && !allTasks.some((task) => task.id === selectedTaskId)) setSelectedTaskId(null);
  }, [allTasks, selectedTaskId]);

  useEffect(() => {
    const availableIds = new Set(allTasks.map((task) => task.id));
    setSelectedTaskIds((current) => reconcileTaskSelection(current, availableIds));
  }, [allTasks]);

  const selectedTask = allTasks.find((task) => task.id === selectedTaskId) ?? null;
  const selectedTasks = useMemo(
    () => allTasks.filter((task) => selectedTaskIds.has(task.id)),
    [allTasks, selectedTaskIds],
  );

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const clearSelection = () => setSelectedTaskIds(new Set());
  const selectAllOrClear = () => {
    setSelectedTaskIds((current) =>
      current.size === visibleTasks.length ? new Set() : new Set(visibleTasks.map((task) => task.id)),
    );
  };

  return {
    selectedTaskId,
    setSelectedTaskId,
    selectedTaskIds,
    selectedTask,
    selectedTasks,
    toggleTaskSelection,
    clearSelection,
    selectAllOrClear,
  };
}
