import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, LoaderCircle } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { ProductivityTask, TaskSection } from '@/shared/api/types';
import { useUndoStack, useUndoToast } from '@/shared/hooks/useUndoStack';
import { Button } from '@/shared/ui/button';
import { TaskList } from './TaskList';
import type { usePlanningTasks } from '../hooks/usePlanningTasks';
import type { GroupMode } from '../planning.types';
import { groupMovePatch, kanbanGroups } from '../utils/planningGrouping';

type PlanningTaskState = ReturnType<typeof usePlanningTasks>;

export function PlanningTaskWorkspace({
  tasks,
  allTasksData,
  groupedTasks,
  displayMode,
  collapsedGroups,
  onToggleGroup,
  selectedTaskId,
  selectedTaskIds,
  onSelect,
  onToggleSelection,
  onContextMenu,
  hideDetails,
  groupMode,
  sortMode,
  view,
  sections,
  draggedTaskId,
  onTaskDragStart,
  onTaskDragEnd,
  onMoveTask,
}: {
  tasks: PlanningTaskState['tasks'];
  allTasksData: ProductivityTask[];
  groupedTasks: Array<[string, ProductivityTask[]]>;
  displayMode: 'list' | 'kanban';
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (group: string) => void;
  selectedTaskId: string | null;
  selectedTaskIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onContextMenu: (task: ProductivityTask, position: { x: number; y: number }) => void;
  hideDetails: boolean;
  groupMode: GroupMode;
  sortMode: string;
  view: 'all' | 'today' | 'inbox' | 'upcoming';
  sections: TaskSection[];
  draggedTaskId: string | null;
  onTaskDragStart: (id: string) => void;
  onTaskDragEnd: () => void;
  onMoveTask: (input: { taskId: string; targetGroup: string; beforeTaskId?: string }) => void;
}) {
  const undoToast = useUndoToast();
  const taskLoadMoreRef = useRef<HTMLDivElement>(null);
  const isFetchingNextPageRef = useRef(false);
  isFetchingNextPageRef.current = tasks.isFetchingNextPage;
  useEffect(() => {
    const sentinel = taskLoadMoreRef.current;
    if (!sentinel || !tasks.hasNextPage) return;
    const root = sentinel.closest<HTMLElement>('.itu-task-scroll');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && root?.scrollTop && !isFetchingNextPageRef.current) {
          void tasks.fetchNextPage();
        }
      },
      { root, rootMargin: '0px 0px 240px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tasks.fetchNextPage, tasks.hasNextPage]);
  const taskContent =
    displayMode === 'list' ? (
      groupedTasks.map(([group, groupTasks]) => {
        const isGroupCollapsed = collapsedGroups[group];
        return (
          <section
            key={group}
            className={`itu-task-group ${draggedTaskId ? 'is-drop-target' : ''}`}
            onDragOver={(event) => {
              if (sortMode !== 'manual') return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              if (!draggedTaskId || sortMode !== 'manual') return;
              event.preventDefault();
              onMoveTask({ taskId: draggedTaskId, targetGroup: group });
            }}
          >
            <h2
              className="cursor-pointer select-none flex items-center gap-1.5"
              onClick={() => onToggleGroup(group)}
            >
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                  isGroupCollapsed ? '-rotate-90' : ''
                }`}
              />
              <span>{group}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                {groupTasks.length}
              </span>
            </h2>
            {!isGroupCollapsed && (
              <TaskList
                tasks={groupTasks}
                allTasks={allTasksData}
                selectedTaskId={selectedTaskId}
                selectedTaskIds={selectedTaskIds}
                onSelect={onSelect}
                onToggleSelection={onToggleSelection}
                onContextMenu={onContextMenu}
                compact
                showDetails={!hideDetails}
                showTaskList={groupMode !== 'project'}
                draggable={sortMode === 'manual'}
                onTaskDragStart={onTaskDragStart}
                onTaskDrop={(beforeTaskId) => {
                  if (draggedTaskId && draggedTaskId !== beforeTaskId) {
                    onMoveTask({ taskId: draggedTaskId, targetGroup: group, beforeTaskId });
                  }
                }}
                onTaskDragEnd={onTaskDragEnd}
                onUndoAction={undoToast.show}
              />
            )}
          </section>
        );
      })
    ) : (
      <TaskKanban
        groups={groupedTasks}
        allTasks={allTasksData}
        selectedTaskId={selectedTaskId}
        selectedTaskIds={selectedTaskIds}
        onSelect={onSelect}
        onToggleSelection={onToggleSelection}
        onContextMenu={onContextMenu}
        showDetails={!hideDetails}
        groupMode={groupMode}
        view={view}
        sections={sections}
      />
    );

  return (
    <div className="itu-task-scroll">
      {tasks.isLoading && <TaskListSkeleton />}
      {tasks.isError && (
        <div className="itu-task-error" role="alert">
          <AlertCircle className="h-5 w-5" />
          <div>
            <strong>Tasks could not load</strong>
            <p>{tasks.error instanceof Error ? tasks.error.message : 'The API request failed.'}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void tasks.refetch()}>
            Try again
          </Button>
        </div>
      )}
      {!tasks.isLoading && !tasks.isError && taskContent}
      {tasks.hasNextPage && (
        <div ref={taskLoadMoreRef} className="flex min-h-10 items-center justify-center py-4" role="status" aria-live="polite">
          {tasks.isFetchingNextPage && (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="sr-only">Loading more tasks</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TaskKanban({
  groups,
  allTasks,
  selectedTaskId,
  selectedTaskIds,
  onSelect,
  onToggleSelection,
  onContextMenu,
  showDetails,
  groupMode,
  view,
  sections,
}: {
  groups: Array<[string, ProductivityTask[]]>;
  allTasks: ProductivityTask[];
  selectedTaskId: string | null;
  selectedTaskIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onToggleSelection: (id: string) => void;
  onContextMenu: (task: ProductivityTask, position: { x: number; y: number }) => void;
  showDetails: boolean;
  groupMode: GroupMode;
  view: 'all' | 'today' | 'inbox' | 'upcoming';
  sections: TaskSection[];
}) {
  const queryClient = useQueryClient();
  const { push } = useUndoStack();
  const undoToast = useUndoToast();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [collapsedCompletedGroups, setCollapsedCompletedGroups] = useState<Record<string, boolean>>({});
  const boardGroups = kanbanGroups(groups, view, groupMode);
  const tasks = boardGroups.flatMap((group) => [...group.tasks, ...group.completedTasks]);
  const moveTask = useMutation({
    mutationFn: ({ taskId, targetGroup }: { taskId: string; targetGroup: string }) => {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) throw new Error('Task not found');
      const patch = groupMovePatch(groups, targetGroup, task, groupMode, view, sections);
      if (!Object.keys(patch).length) return Promise.resolve(task);
      return api.updateTask(taskId, { ...patch, version: task.version });
    },
    onSuccess: (_, { taskId, targetGroup }) => {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) return;
      const undoAction = {
        label: `Moved "${task.title.slice(0, 25)}" to ${targetGroup}`,
        undo: async () => {
          await api.updateTask(taskId, {
            status: task.status,
            priority: task.priority,
            sectionId: task.sectionId ?? null,
            taskListId: task.taskListId ?? null,
            dueAt: task.dueAt ?? null,
          });
        },
      };
      push(undoAction);
      undoToast.show(undoAction);
    },
    onError: () => void queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  return (
    <div className="itu-kanban p-1">
      {boardGroups.map(({ title, tasks: items, completedTasks }) => {
        const completedCollapsed = collapsedCompletedGroups[title] ?? false;
        return (
          <section
            key={title}
            onDragOver={(event) => {
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (draggedId) {
                moveTask.mutate({ taskId: draggedId, targetGroup: title });
                setDraggedId(null);
              }
            }}
            className="flex flex-col rounded-xl border border-border/80 bg-card/60 p-3 min-h-[380px] shadow-sm transition-colors hover:border-border"
          >
            <div className="flex items-center justify-between pb-3 px-1 border-b border-border/60 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{title}</h2>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                {items.length}
              </span>
            </div>
            <div className="flex-1">
              {items.length > 0 ? (
                <TaskList
                  tasks={items}
                  allTasks={allTasks}
                  selectedTaskId={selectedTaskId}
                  selectedTaskIds={selectedTaskIds}
                  onSelect={onSelect}
                  onToggleSelection={onToggleSelection}
                  onContextMenu={onContextMenu}
                  compact
                  showDetails={showDetails}
                  showTaskList={groupMode !== 'project'}
                  draggable
                  onTaskDragStart={setDraggedId}
                  onTaskDragEnd={() => setDraggedId(null)}
                  onUndoAction={undoToast.show}
                />
              ) : null}
              {completedTasks.length > 0 ? (
                <section className="mt-4 border-t border-border/60 pt-3">
                  <button
                    type="button"
                    className="mb-2 flex w-full items-center gap-1.5 px-1 text-left text-xs font-bold text-muted-foreground transition-colors hover:text-foreground"
                    aria-expanded={!completedCollapsed}
                    onClick={() =>
                      setCollapsedCompletedGroups((current) => ({ ...current, [title]: !completedCollapsed }))
                    }
                  >
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${completedCollapsed ? '-rotate-90' : ''}`} />
                    <span>Completed &amp; Won&apos;t Do</span>
                    <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-[10px]">{completedTasks.length}</span>
                  </button>
                  {!completedCollapsed ? (
                    <TaskList
                      tasks={completedTasks}
                      allTasks={allTasks}
                      selectedTaskId={selectedTaskId}
                      selectedTaskIds={selectedTaskIds}
                      onSelect={onSelect}
                      onToggleSelection={onToggleSelection}
                      onContextMenu={onContextMenu}
                      compact
                      showDetails={showDetails}
                      showTaskList={groupMode !== 'project'}
                      onUndoAction={undoToast.show}
                    />
                  ) : null}
                </section>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function TaskListSkeleton() {
  return (
    <div className="space-y-5 p-1" aria-label="Loading tasks" aria-busy="true">
      {[3, 2].map((rows, groupIndex) => (
        <div key={groupIndex}>
          <div className="mb-3 h-4 w-28 animate-pulse rounded bg-muted" />
          <div className="divide-y">
            {Array.from({ length: rows }, (_, rowIndex) => (
              <div key={rowIndex} className="flex gap-3 py-3">
                <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/3 animate-pulse rounded bg-muted/70" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
