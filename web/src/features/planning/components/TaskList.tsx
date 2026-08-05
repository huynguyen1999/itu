import { Fragment, useMemo, useState, type DragEvent, type MouseEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CornerDownRight, Play } from 'lucide-react';
import { api } from '@/shared/api/client';
import type { ProductivityTask, TaskStatus } from '@/shared/api/types';
import { type UndoAction, useUndoStack } from '@/shared/hooks/useUndoStack';
import { useSync } from '@/shared/sync/SyncProvider';
import {
  groupedGrowthRewardChips,
  pendingMutationsWithoutConflicts,
  retryTaskMutationsInOrder,
  IDLE_TASK_SYNC_PRESENTATION,
  TaskItem,
  taskSyncPresentation,
  type GrowthRewardChipModel,
  type TaskDensity,
} from './TaskItem';
import { nextTaskStatus, taskStatusLabel } from '../utils/taskStatus';

export function TaskList({
  tasks,
  allTasks = tasks,
  selectedTaskId,
  selectedTaskIds,
  onSelect,
  onToggleSelection,
  onContextMenu,
  compact = false,
  density = 'standard',
  showDetails = true,
  showTaskList = true,
  draggable = false,
  onTaskDragStart,
  onTaskDrop,
  onTaskDragEnd,
  onUndoAction,
}: {
  tasks: ProductivityTask[];
  allTasks?: ProductivityTask[];
  selectedTaskId?: string | null;
  selectedTaskIds?: ReadonlySet<string>;
  onSelect?: (id: string) => void;
  onToggleSelection?: (id: string) => void;
  onContextMenu?: (task: ProductivityTask, position: { x: number; y: number }) => void;
  compact?: boolean;
  density?: TaskDensity;
  showDetails?: boolean;
  showTaskList?: boolean;
  draggable?: boolean;
  onTaskDragStart?: (taskId: string) => void;
  onTaskDrop?: (beforeTaskId?: string) => void;
  onTaskDragEnd?: () => void;
  onUndoAction?: (action: UndoAction) => void;
}) {
  const queryClient = useQueryClient();
  const { push } = useUndoStack();
  const { state: syncState, conflicts, pendingMutations, retryPending } = useSync();
  const growthRules = useQuery({
    queryKey: ['growth', 'rules', 'TASK'],
    queryFn: () => api.growthRules('TASK'),
    staleTime: 30_000,
  });
  const growthRuleByTask = useMemo(
    () => new Map((growthRules.data ?? []).map((rule) => [rule.sourceId, rule])),
    [growthRules.data],
  );
  const childTasksByParent = useMemo(() => {
    const next = new Map<string, ProductivityTask[]>();
    for (const candidate of allTasks) {
      if (!candidate.parentId) continue;
      const current = next.get(candidate.parentId) ?? [];
      current.push(candidate);
      next.set(candidate.parentId, current);
    }
    return next;
  }, [allTasks]);
  const growthChipsByTask = useMemo(() => {
    const next = new Map<string, GrowthRewardChipModel[]>();
    for (const [taskId, rule] of growthRuleByTask) {
      next.set(taskId, groupedGrowthRewardChips(rule));
    }
    return next;
  }, [growthRuleByTask]);
  const visiblePendingMutations = useMemo(() => {
    return pendingMutationsWithoutConflicts(pendingMutations, conflicts);
  }, [conflicts, pendingMutations]);
  const taskSyncById = useMemo(
    () => new Map(tasks.map((task) => [task.id, taskSyncPresentation(task.id, visiblePendingMutations, syncState)])),
    [syncState, tasks, visiblePendingMutations],
  );
  const [dropTarget, setDropTarget] = useState<{ taskId: string; edge: 'before' | 'after' } | null>(null);
  const handleTaskClick = (event: MouseEvent<HTMLElement>, taskId: string) => {
    if (event.shiftKey && onToggleSelection) {
      onToggleSelection(taskId);
      return;
    }
    onSelect?.(taskId);
  };

  const updateStatus = useMutation({
    mutationFn: ({ task, nextStatus }: { task: ProductivityTask; nextStatus: TaskStatus }) =>
      api.updateTask(task.id, { status: nextStatus, version: task.version }),
    onSuccess: (_, { task, nextStatus }) => {
      const prevStatus = task.status;

      const undoAction = {
        label: `"${task.title.slice(0, 30)}" → ${taskStatusLabel(nextStatus)}`,
        undo: async () => {
          await api.updateTask(task.id, { status: prevStatus });
        },
      };
      push(undoAction);
      onUndoAction?.(undoAction);
      void queryClient.invalidateQueries({ queryKey: ['study-calendar'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
  const retryTaskMutations = (mutationIds: readonly string[]) => retryTaskMutationsInOrder(mutationIds, retryPending);

  if (!tasks.length) {
    return (
      <p
        className={
          compact ? 'itu-empty-list' : 'rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground'
        }
      >
        Nothing here yet.
      </p>
    );
  }

  return (
    <>
      <div className={`itu-task-list itu-task-list--${density}`}>
        {tasks.map((task) => {
          const childTasks = childTasksByParent.get(task.id) ?? [];
          const growthChips = growthChipsByTask.get(task.id) ?? [];
          const nextStatus: TaskStatus = nextTaskStatus(task.status);
          const syncPresentation = taskSyncById.get(task.id) ?? IDLE_TASK_SYNC_PRESENTATION;

          return (
            <Fragment key={task.id}>
              <TaskItem
                task={task}
                density={density}
                compact={compact}
                selected={Boolean(selectedTaskIds?.has(task.id) || selectedTaskId === task.id)}
                showDetails={showDetails}
                showTaskList={showTaskList}
                growthChips={growthChips}
                syncPresentation={syncPresentation}
                draggable={draggable}
                dropEdge={dropTarget?.taskId === task.id ? (dropTarget?.edge ?? null) : null}
                onSelect={onSelect}
                onToggleSelection={onToggleSelection}
                onContextMenu={onContextMenu}
                onStatusChange={() => updateStatus.mutate({ task, nextStatus })}
                onRetrySync={retryTaskMutations}
                onDragStart={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest('button, a, input, textarea, select')) {
                    event.preventDefault();
                    return;
                  }
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', task.id);
                  setDragPreview(event, task.title);
                  onTaskDragStart?.(task.id);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  const bounds = event.currentTarget.getBoundingClientRect();
                  setDropTarget({
                    taskId: task.id,
                    edge: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after',
                  });
                }}
                onDragLeave={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onTaskDrop?.(dropBeforeTaskId(tasks, task.id, dropTarget?.edge ?? 'before'));
                  setDropTarget(null);
                }}
                onDragEnd={() => {
                  setDropTarget(null);
                  onTaskDragEnd?.();
                }}
              />
              {childTasks.length > 0 && (
                <div className="itu-subtask-list" aria-label={`Subtasks for ${task.title}`}>
                  {childTasks.map((child) => {
                    const childDone = child.status === 'COMPLETED';
                    const childInProgress = child.status === 'IN_PROGRESS';
                    const childCanceled = child.status === 'CANCELED';
                    const childNextStatus: TaskStatus = childDone ? 'PLANNED' : 'COMPLETED';
                    return (
                      <div
                        key={child.id}
                        className={`itu-subtask-row ${childDone ? 'is-done' : ''} ${
                          childInProgress ? 'is-in-progress' : ''
                        } ${childCanceled ? 'is-canceled' : ''}`}
                        onClick={(event) => handleTaskClick(event, child.id)}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onContextMenu?.(child, { x: event.clientX, y: event.clientY });
                        }}
                      >
                        <span className="itu-subtask-branch" aria-hidden="true">
                          <CornerDownRight className="h-3.5 w-3.5" />
                        </span>
                        <button
                          type="button"
                          className={`itu-subtask-checkbox ${
                            childDone
                              ? 'border-emerald-600 bg-emerald-600 text-white'
                              : childInProgress
                                ? 'border-blue-500 bg-blue-500/15 text-blue-500'
                                : 'border-input hover:border-primary'
                          }`}
                          aria-label={`${childDone ? 'Reopen' : 'Complete'} subtask ${child.title}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            updateStatus.mutate({ task: child, nextStatus: childNextStatus });
                          }}
                        >
                          {childDone ? (
                            <Check className="h-3 w-3 stroke-[3]" />
                          ) : childInProgress ? (
                            <Play className="ml-px h-2.5 w-2.5 fill-current" />
                          ) : null}
                        </button>
                        <span className="itu-subtask-title">{child.title}</span>
                        {(childDone || childInProgress || childCanceled) && (
                          <span className="itu-subtask-status">
                            {childDone ? 'Done' : childInProgress ? 'In progress' : 'Canceled'}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
    </>
  );
}

function setDragPreview(event: DragEvent<HTMLElement>, title: string) {
  const preview = document.createElement('div');
  preview.className = 'itu-task-drag-preview';
  preview.textContent = title;
  document.body.appendChild(preview);
  event.dataTransfer.setDragImage(preview, 24, 22);
  requestAnimationFrame(() => preview.remove());
}

export function dropBeforeTaskId(
  tasks: ReadonlyArray<Pick<ProductivityTask, 'id'>>,
  targetTaskId: string,
  edge: 'before' | 'after',
): string | undefined {
  if (edge === 'before') return targetTaskId;
  const targetIndex = tasks.findIndex((task) => task.id === targetTaskId);
  return targetIndex < 0 ? undefined : tasks[targetIndex + 1]?.id;
}
