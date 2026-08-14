import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/api/client';
import type { ProductivityTask, TaskInput } from '@/shared/api/types';
import type { TaskPreferences } from '@/shared/api/preferencesApi';
import { useGlobalUndo, useUndoToast } from '@/shared/hooks/useUndoStack';
import { UndoToast } from '@/shared/ui/UndoToast';
import { usePlanning } from './PlanningContext';
import { PlanningHeader } from './components/PlanningHeader';
import { PlanningComposer } from './components/PlanningComposer';
import { PlanningBulkActions } from './components/PlanningBulkActions';
import { PlanningTaskWorkspace } from './components/PlanningTaskWorkspace';
import { TaskContextMenu } from './components/TaskContextMenu';
import { TaskDetailModal } from './components/TaskDetailModal';
import { usePlanningTasks } from './hooks/usePlanningTasks';
import { useTaskSelection } from './hooks/useTaskSelection';
import { readPlanningViewSettings, savePlanningViewSettings, type PlanningViewSettings } from './utils/planningViewSettings';
import {
  applyManualTaskOrder,
  groupMovePatch,
  groupTasks,
  isInboxViewTask,
  reorderedTaskIds,
  sortTasks,
} from './utils/planningGrouping';

export function PlanningPage({ view = 'all' }: { view?: 'all' | 'today' | 'inbox' | 'upcoming' }) {
  const queryClient = useQueryClient();
  const undoToast = useUndoToast();
  useGlobalUndo();
  const planning = usePlanning();
  const { selectedTaskList, selectedTag, searchQuery, setSearchQuery } = planning;
  const [contextMenu, setContextMenu] = useState<{ task: ProductivityTask; position: { x: number; y: number } } | null>(null);
  const [showSectionCreator, setShowSectionCreator] = useState(false);
  const [viewSettings, setViewSettings] = useState<PlanningViewSettings>(() => readPlanningViewSettings(view));
  const { sortMode, groupMode, displayMode, hideCompleted, hideDetails, collapsedGroups } = viewSettings;

  const userPreferences = useQuery({ queryKey: ['user-preferences'], queryFn: () => api.getPreferences() });
  const updateTaskPref = useMutation({
    mutationFn: (patch: Partial<TaskPreferences>) => api.updateTaskPreferences(patch),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['user-preferences'] }),
  });
  const { tasks, allTasksData, setAllTasksData, projects, inboxListId, tags, sections } = usePlanningTasks({
    view,
    selectedTaskList,
    selectedTag,
    searchQuery,
  });

  useEffect(() => setViewSettings(readPlanningViewSettings(view)), [view]);
  useEffect(() => savePlanningViewSettings(view, viewSettings), [view, viewSettings]);

  const groupedTasks = useMemo(() => {
    const filtered = allTasksData.filter((task) => {
      if (view === 'inbox' && !selectedTaskList && !selectedTag && !isInboxViewTask(task, inboxListId)) return false;
      return !hideCompleted || (task.status !== 'COMPLETED' && task.status !== 'CANCELED');
    });
    const visibleSections = (sections.data ?? []).filter((section) =>
      selectedTaskList
        ? (section.taskListId ?? section.projectId) === selectedTaskList
        : view === 'inbox'
          ? !(section.taskListId ?? section.projectId)
          : true,
    );
    return groupTasks(sortTasks(filtered, sortMode), view, groupMode, visibleSections);
  }, [allTasksData, groupMode, hideCompleted, inboxListId, sections.data, selectedTag, selectedTaskList, sortMode, view]);
  const visibleTasks = useMemo(() => groupedTasks.flatMap(([, items]) => items), [groupedTasks]);
  const selection = useTaskSelection(allTasksData, visibleTasks);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const sidebarTasks = useQuery({
    queryKey: ['tasks', 'all'],
    queryFn: () => api.tasks({ view: 'all' }),
    retry: 1,
    enabled: Boolean(selection.selectedTaskId),
  });

  const moveTask = useMutation({
    mutationFn: async ({ taskId, targetGroup, beforeTaskId }: { taskId: string; targetGroup: string; beforeTaskId?: string }) => {
      const draggedTask = visibleTasks.find((task) => task.id === taskId);
      if (!draggedTask) return;
      const patch = groupMovePatch(groupedTasks, targetGroup, draggedTask, groupMode, view, sections.data ?? []);
      const orderedTaskIds = reorderedTaskIds(groupedTasks, taskId, targetGroup, beforeTaskId);
      setAllTasksData((current) => applyManualTaskOrder(current, orderedTaskIds, taskId, patch));
      if (Object.keys(patch).length) await api.updateTask(taskId, { ...patch, version: draggedTask.version });
      await api.reorderTasks(orderedTaskIds);
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
    onSettled: () => setDraggedTaskId(null),
  });

  const title = selectedTaskList
    ? (projects.data?.find((project) => project.id === selectedTaskList)?.title ?? 'Project')
    : selectedTag
      ? `#${tags.data?.find((tag) => tag.id === selectedTag)?.name ?? 'Tag'}`
      : view === 'inbox' ? 'Inbox' : view === 'today' ? 'Today' : view === 'upcoming' ? 'Next 7 Days' : 'All Tasks';
  const updateViewSettings = (patch: Partial<PlanningViewSettings>) => setViewSettings((current) => ({ ...current, ...patch }));

  return (
    <>
      <section className="itu-task-list-pane">
        <PlanningHeader
          title={title}
          kicker={selectedTaskList ? 'List' : selectedTag ? 'Tag' : 'Smart list'}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          groupMode={groupMode}
          sortMode={sortMode}
          displayMode={displayMode}
          hideCompleted={hideCompleted}
          hideDetails={hideDetails}
          taskPreferences={userPreferences.data?.tasks}
          taskLists={projects.data ?? []}
          onViewChange={updateViewSettings}
          onAddSection={() => {
            setShowSectionCreator(true);
            updateViewSettings({ groupMode: 'section' });
          }}
          onTaskPreferencesChange={(patch) => updateTaskPref.mutate(patch)}
        />
        <PlanningComposer
          view={view}
          selectedTaskList={selectedTaskList}
          selectedTag={selectedTag}
          projects={projects.data ?? []}
          tags={tags.data ?? []}
          onSectionCreated={() => updateViewSettings({ groupMode: 'section' })}
          showSectionCreator={showSectionCreator}
          onShowSectionCreatorChange={setShowSectionCreator}
        />
        <PlanningBulkActions
          selectedTaskIds={selection.selectedTaskIds}
          selectedTasks={selection.selectedTasks}
          visibleTaskCount={visibleTasks.length}
          onClear={selection.clearSelection}
          onSelectAllOrClear={selection.selectAllOrClear}
        />
        <PlanningTaskWorkspace
          tasks={tasks}
          allTasksData={allTasksData}
          groupedTasks={groupedTasks}
          displayMode={displayMode}
          collapsedGroups={collapsedGroups}
          onToggleGroup={(group) => updateViewSettings({ collapsedGroups: { ...collapsedGroups, [group]: !collapsedGroups[group] } })}
          selectedTaskId={selection.selectedTaskId}
          selectedTaskIds={selection.selectedTaskIds}
          onSelect={selection.setSelectedTaskId}
          onToggleSelection={selection.toggleTaskSelection}
          onContextMenu={(task, position) => setContextMenu({ task, position })}
          hideDetails={hideDetails}
          groupMode={groupMode}
          sortMode={sortMode}
          view={view}
          sections={sections.data ?? []}
          draggedTaskId={draggedTaskId}
          onTaskDragStart={setDraggedTaskId}
          onTaskDragEnd={() => setDraggedTaskId(null)}
          onMoveTask={(input) => moveTask.mutate(input)}
        />
      </section>
      <TaskDetailModal
        task={selection.selectedTask}
        tasks={sidebarTasks.data?.data ?? []}
        isOpen={Boolean(selection.selectedTaskId)}
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
      <UndoToast action={undoToast.current} onUndo={undoToast.handleUndo} onDismiss={undoToast.dismiss} />
    </>
  );
}

export {
  applyManualTaskOrder,
  countInbox,
  countToday,
  groupTasks,
  isInboxViewTask,
  kanbanGroups,
  manualMoveBeforeTaskId,
  reorderedTaskIds,
  sortTasks,
} from './utils/planningGrouping';
