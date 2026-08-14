import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { ProductivityTask, TaskInput, TaskList as TaskListModel, TaskPriority } from '@/shared/api/types';
import { useTaskSelection } from './hooks/useTaskSelection';
import { TaskContextMenu } from './components/TaskContextMenu';
import { TaskDetailModal } from './components/TaskDetailModal';
import { MATRIX_COLUMNS, MatrixTaskGrid } from './components/MatrixTaskGrid';
import { MatrixTaskDialog } from './components/MatrixTaskDialog';
import { MatrixToolbar, type PriorityFilter } from './components/MatrixToolbar';
import { applyManualTaskOrder, reorderedTaskIds, sortTasks } from './PlanningPage';
import type { SortMode } from './planning.types';
import { DEFAULT_MATRIX_DISPLAY_SETTINGS, type MatrixViewDisplaySettings } from './MatrixSettingsPopover';
import type { MatrixPreferences } from '@/shared/api/preferencesApi';
import { getStoredTaskDefaults } from '@/shared/taskDefaults';
import { matrixQuadrantForTask, readMatrixSettings, saveMatrixSettings } from './utils/matrixSettings';

const columns = MATRIX_COLUMNS;

const quadrantPresets: Record<string, { important: boolean; urgentOverride: boolean | null }> = {
  doFirst: { important: true, urgentOverride: true },
  schedule: { important: true, urgentOverride: false },
  delegate: { important: false, urgentOverride: true },
  dontDo: { important: false, urgentOverride: false },
};

export function MatrixPage() {
  const queryClient = useQueryClient();
  const [matrixSettings, setMatrixSettings] = useState(readMatrixSettings);
  const [matrixDisplaySettings, setMatrixDisplaySettings] = useState<MatrixViewDisplaySettings>(
    DEFAULT_MATRIX_DISPLAY_SETTINGS,
  );
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    task: ProductivityTask;
    position: { x: number; y: number };
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [showNewTaskDialog, setShowNewTaskDialog] = useState(false);
  const [newTaskQuadrant, setNewTaskQuadrant] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickPriority, setQuickPriority] = useState<TaskPriority>(() => getStoredTaskDefaults().priority);
  const [quickDueAt, setQuickDueAt] = useState('');

  const userPreferences = useQuery({ queryKey: ['user-preferences'], queryFn: () => api.getPreferences() });
  const updateMatrixPref = useMutation({
    mutationFn: (patch: Partial<MatrixPreferences>) => api.updateMatrixPreferences(patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });
  const matrix = useQuery({ queryKey: ['tasks', 'matrix'], queryFn: () => api.taskMatrix() });
  const taskLists = useQuery({ queryKey: ['task-lists'], queryFn: () => api.taskLists() });
  const { searchQuery, showSearch, sortMode } = matrixSettings;
  const priorityFilter = useMemo(
    () => new Set<PriorityFilter>(matrixSettings.priorityFilter),
    [matrixSettings.priorityFilter],
  );

  useEffect(() => saveMatrixSettings(matrixSettings), [matrixSettings]);
  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  const allTasks = useMemo(() => {
    if (!matrix.data) return [];
    return attachTaskLists(Object.values(matrix.data).flat(), taskLists.data ?? []);
  }, [matrix.data, taskLists.data]);
  const selection = useTaskSelection(allTasks, allTasks);

  const { quadrantTaskMap, quadrantCompletedMap, quadrantWontDoMap } = useMemo(() => {
    const active: Record<string, ProductivityTask[]> = Object.fromEntries(columns.map(([key]) => [key, []]));
    const completed: Record<string, ProductivityTask[]> = Object.fromEntries(columns.map(([key]) => [key, []]));
    const wontDo: Record<string, ProductivityTask[]> = Object.fromEntries(columns.map(([key]) => [key, []]));
    const tasksByQuadrant: Record<string, ProductivityTask[]> = {};

    for (const task of allTasks) {
      const key = matrixQuadrantForTask(task, matrixSettings);
      (tasksByQuadrant[key] ??= []).push(task);
    }
    for (const [key] of columns) {
      const buckets = bucketTasksByStatus(tasksByQuadrant[key] ?? []);
      active[key] = buckets.active;
      completed[key] = buckets.completed;
      wontDo[key] = buckets.wontDo;
    }

    const hasSpecificPriority = !priorityFilter.has('ALL') && priorityFilter.size > 0;
    for (const [key] of columns) {
      const filterAndSort = (tasks: ProductivityTask[]) => {
        let filtered = tasks;
        if (searchQuery) {
          const query = searchQuery.toLowerCase();
          filtered = filtered.filter((task) => task.title.toLowerCase().includes(query));
        }
        if (hasSpecificPriority) filtered = filtered.filter((task) => priorityFilter.has(task.priority));
        return sortTasks(filtered, sortMode);
      };
      active[key] = filterAndSort(active[key]);
      completed[key] = filterAndSort(completed[key]);
      wontDo[key] = filterAndSort(wontDo[key]);
    }

    return { quadrantTaskMap: active, quadrantCompletedMap: completed, quadrantWontDoMap: wontDo };
  }, [allTasks, matrixSettings, priorityFilter, searchQuery, sortMode]);

  const moveTask = useMutation({
    mutationFn: async ({ taskId, targetQuadrant, beforeTaskId }: {
      taskId: string;
      targetQuadrant: string;
      beforeTaskId?: string;
    }) => {
      const groups = columns.map(([key]) => [key, quadrantTaskMap[key] ?? []] as [string, ProductivityTask[]]);
      const draggedTask = groups.flatMap(([, tasks]) => tasks).find((task) => task.id === taskId);
      if (!draggedTask) return;
      const targetPreset = quadrantPresets[targetQuadrant];
      const patch: Partial<TaskInput> = targetPreset
        ? { important: targetPreset.important, urgentOverride: targetPreset.urgentOverride }
        : {};
      const orderedTaskIds = reorderedTaskIds(groups, taskId, targetQuadrant, beforeTaskId);
      queryClient.setQueryData<typeof matrix.data>(['tasks', 'matrix'], (current) => {
        if (!current) return current;
        const reordered = applyManualTaskOrder(Object.values(current).flat(), orderedTaskIds, taskId, patch);
        const taskById = new Map(reordered.map((task) => [task.id, task]));
        return Object.fromEntries(
          Object.entries(current).map(([key, tasks]) => [key, tasks.map((task) => taskById.get(task.id) ?? task)]),
        ) as typeof current;
      });
      if (targetPreset) await api.updateTask(taskId, { ...patch, version: draggedTask.version });
      await api.reorderTasks(orderedTaskIds);
    },
    onError: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onSettled: () => setDraggedTaskId(null),
  });

  const createTask = useMutation({
    mutationFn: (overrides?: Partial<TaskInput>) => {
      const presets = newTaskQuadrant ? quadrantPresets[newTaskQuadrant] : null;
      return api.createTask({
        title: quickTitle.trim(),
        priority: quickPriority,
        important: presets?.important ?? false,
        urgentOverride: presets?.urgentOverride ?? null,
        dueAt: quickDueAt ? new Date(quickDueAt).toISOString() : undefined,
        ...overrides,
      });
    },
    onSuccess: () => {
      setQuickTitle('');
      setQuickDueAt('');
      setQuickPriority(getStoredTaskDefaults().priority);
      setNewTaskQuadrant(null);
      setShowNewTaskDialog(false);
    },
  });

  function openNewTaskDialog(quadrant?: string) {
    setNewTaskQuadrant(quadrant ?? null);
    setShowNewTaskDialog(true);
    setQuickTitle('');
    setQuickDueAt('');
    setQuickPriority(getStoredTaskDefaults().priority);
  }

  function togglePriorityFilter(priority: TaskPriority) {
    setMatrixSettings((settings) => {
      const next = new Set(settings.priorityFilter);
      next.delete('ALL');
      if (next.has(priority)) {
        next.delete(priority);
        if (next.size === 0) next.add('ALL');
      } else next.add(priority);
      return { ...settings, priorityFilter: [...next] };
    });
  }

  function clearFilters() {
    setMatrixSettings((settings) => ({
      ...settings,
      searchQuery: '',
      showSearch: false,
      priorityFilter: ['ALL'],
      sortMode: 'manual',
    }));
  }

  const hasActiveFilters =
    searchQuery || (!priorityFilter.has('ALL') && priorityFilter.size > 0) || sortMode !== 'manual';

  function handleQuickCreate(event: FormEvent) {
    event.preventDefault();
    if (quickTitle.trim()) createTask.mutate(undefined);
  }

  return (
    <div className="flex h-[calc(100vh-6.5rem)] flex-col gap-4 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <MatrixToolbar
          searchInputRef={searchInputRef}
          showSearch={showSearch}
          searchQuery={searchQuery}
          sortMode={sortMode}
          priorityFilter={priorityFilter}
          hasActiveFilters={!!hasActiveFilters}
          preferences={userPreferences.data?.matrix}
          displaySettings={matrixDisplaySettings}
          onSearchChange={(value) => setMatrixSettings((settings) => ({ ...settings, searchQuery: value }))}
          onToggleSearch={() => setMatrixSettings((settings) => ({ ...settings, showSearch: !settings.showSearch }))}
          onSortChange={(value) => setMatrixSettings((settings) => ({ ...settings, sortMode: value }))}
          onTogglePriority={togglePriorityFilter}
          onResetPriorityFilter={() => setMatrixSettings((settings) => ({ ...settings, priorityFilter: ['ALL'] }))}
          onRemoveSearch={() => setMatrixSettings((settings) => ({ ...settings, searchQuery: '', showSearch: false }))}
          onClearFilters={clearFilters}
          onNewTask={() => openNewTaskDialog()}
          onChangePreferences={(patch) => updateMatrixPref.mutate(patch)}
          onChangeDisplay={(patch) => setMatrixDisplaySettings((current) => ({ ...current, ...patch }))}
        />

        <MatrixTaskGrid
          active={quadrantTaskMap}
          completed={quadrantCompletedMap}
          wontDo={quadrantWontDoMap}
          selectedTaskId={selection.selectedTaskId}
          draggedTaskId={draggedTaskId}
          sortMode={sortMode}
          onSelect={selection.setSelectedTaskId}
          onContextMenu={(task, position) => setContextMenu({ task, position })}
          onAddTask={openNewTaskDialog}
          onDragStart={setDraggedTaskId}
          onDragEnd={() => setDraggedTaskId(null)}
          onMove={(taskId, targetQuadrant, beforeTaskId) => moveTask.mutate({ taskId, targetQuadrant, beforeTaskId })}
        />
      </div>

      <TaskDetailModal
        task={selection.selectedTask}
        tasks={allTasks}
        isOpen={!!selection.selectedTaskId}
        onClose={() => selection.setSelectedTaskId(null)}
      />
      <TaskContextMenu
        task={contextMenu?.task ?? null}
        position={contextMenu?.position ?? null}
        onClose={() => setContextMenu(null)}
        onOpenDetail={() => {
          if (contextMenu) selection.setSelectedTaskId(contextMenu.task.id);
        }}
      />
      <MatrixTaskDialog
        open={showNewTaskDialog}
        quadrant={newTaskQuadrant}
        title={quickTitle}
        priority={quickPriority}
        dueAt={quickDueAt}
        isPending={createTask.isPending}
        onOpenChange={(open) => {
          if (!open) {
            setShowNewTaskDialog(false);
            setNewTaskQuadrant(null);
          }
        }}
        onTitleChange={setQuickTitle}
        onPriorityChange={setQuickPriority}
        onDueAtChange={setQuickDueAt}
        onSubmit={handleQuickCreate}
      />
    </div>
  );
}

export function attachTaskLists(tasks: ProductivityTask[], taskLists: TaskListModel[]): ProductivityTask[] {
  const taskListById = new Map(taskLists.map((taskList) => [taskList.id, taskList]));
  return tasks.map((task) => ({
    ...task,
    taskList: task.taskList ?? taskListById.get(task.taskListId ?? '') ?? null,
  }));
}

export function bucketTasksByStatus(tasks: ProductivityTask[]) {
  const active: ProductivityTask[] = [];
  const completed: ProductivityTask[] = [];
  const wontDo: ProductivityTask[] = [];
  for (const task of tasks) {
    if (task.status === 'COMPLETED') completed.push(task);
    else if (task.status === 'CANCELED') wontDo.push(task);
    else active.push(task);
  }
  return { active, completed, wontDo };
}
