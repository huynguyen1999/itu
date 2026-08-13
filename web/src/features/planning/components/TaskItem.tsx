import { useState, type DragEvent, type MouseEvent } from 'react';
import { Bell, Calendar, Check, CircleAlert, Clock3, CloudOff, Flag, List, Play, RefreshCw, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ProductivityTask } from '@/shared/api/types';
import type { ClientSyncMutation, SyncConflict, SyncState } from '@/shared/sync/syncQueue';
import { Button } from '@/shared/ui/button';
import { GrowthRewardChip, type GrowthRewardChipModel } from '@/shared/ui/GrowthRewardChip';
import { nextTaskStatus } from '../utils/taskStatus';

export { GrowthRewardChip, groupedGrowthRewardChips } from '@/shared/ui/GrowthRewardChip';
export type { GrowthRewardChipModel } from '@/shared/ui/GrowthRewardChip';

export type TaskDensity = 'standard' | 'matrix';

export interface TaskSyncPresentation {
  kind: 'idle' | 'pending' | 'offline' | 'failed';
  label?: 'Waiting to sync' | 'Couldn’t sync';
  retryMutationIds: string[];
}

export const IDLE_TASK_SYNC_PRESENTATION: TaskSyncPresentation = {
  kind: 'idle',
  retryMutationIds: [],
};

export function taskSyncPresentation(
  taskId: string,
  pendingMutations: readonly ClientSyncMutation[],
  syncState: Pick<SyncState, 'phase'>,
): TaskSyncPresentation {
  const related = pendingMutations
    .filter((mutation) => mutation.entityId === taskId && mutation.kind.startsWith('task.'))
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const failed = related.filter((mutation) => mutation.lastErrorCode || mutation.attemptCount);

  if (failed.length) {
    return {
      kind: 'failed',
      label: 'Couldn’t sync',
      retryMutationIds: failed.map((mutation) => mutation.id),
    };
  }
  if (!related.length) return IDLE_TASK_SYNC_PRESENTATION;
  if (syncState.phase === 'offline') {
    return {
      kind: 'offline',
      label: 'Waiting to sync',
      retryMutationIds: [],
    };
  }
  return {
    kind: 'pending',
    retryMutationIds: [],
  };
}

export function pendingMutationsWithoutConflicts(
  pendingMutations: readonly ClientSyncMutation[],
  conflicts: readonly Pick<SyncConflict, 'mutationId'>[],
) {
  const conflictMutationIds = new Set(conflicts.map((conflict) => conflict.mutationId));
  return pendingMutations.filter((mutation) => !conflictMutationIds.has(mutation.id));
}

export function handleTaskStatusClick(
  event: Pick<MouseEvent<HTMLButtonElement>, 'stopPropagation'>,
  onStatusChange: () => void,
) {
  event.stopPropagation();
  onStatusChange();
}

export async function retryTaskMutationsInOrder(
  mutationIds: readonly string[],
  retryPending: (mutationId: string) => Promise<unknown>,
) {
  for (const mutationId of mutationIds) {
    await retryPending(mutationId);
  }
}

interface TaskItemProps {
  task: ProductivityTask;
  density: TaskDensity;
  compact: boolean;
  selected: boolean;
  showDetails: boolean;
  showTaskList: boolean;
  growthChips: GrowthRewardChipModel[];
  syncPresentation: TaskSyncPresentation;
  draggable: boolean;
  dropEdge: 'before' | 'after' | null;
  onSelect?: (id: string) => void;
  onToggleSelection?: (id: string) => void;
  onContextMenu?: (task: ProductivityTask, position: { x: number; y: number }) => void;
  onStatusChange: () => void;
  onRetrySync: (mutationIds: readonly string[]) => Promise<void>;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDragLeave: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}

export function TaskItem({
  task,
  density,
  compact,
  selected,
  showDetails,
  showTaskList,
  growthChips,
  syncPresentation,
  draggable,
  dropEdge,
  onSelect,
  onToggleSelection,
  onContextMenu,
  onStatusChange,
  onRetrySync,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: TaskItemProps) {
  const [retrying, setRetrying] = useState(false);
  const done = task.status === 'COMPLETED';
  const inProgress = task.status === 'IN_PROGRESS';
  const canceled = task.status === 'CANCELED';
  const hasReminder = Boolean(task.reminders?.length);
  const taskPriority = task.priority ?? 'NONE';
  const nextStatus = nextTaskStatus(task.status);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetrySync(syncPresentation.retryMutationIds);
    } catch {
      // The queue retains failed mutations and their error state for another retry.
    } finally {
      setRetrying(false);
    }
  };

  return (
    <article
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragOver={draggable ? onDragOver : undefined}
      onDragLeave={draggable ? onDragLeave : undefined}
      onDrop={draggable ? onDrop : undefined}
      onDragEnd={draggable ? onDragEnd : undefined}
      onClick={(event) => {
        if (event.shiftKey && onToggleSelection) {
          onToggleSelection(task.id);
          return;
        }
        onSelect?.(task.id);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onContextMenu?.(task, { x: event.clientX, y: event.clientY });
      }}
      className={`itu-task-row itu-task-item density-${density} priority-${taskPriority.toLowerCase()} state-${
        syncPresentation.kind
      } ${selected ? 'is-selected' : ''} ${done ? 'is-done' : ''} ${draggable ? 'is-draggable' : ''} ${
        dropEdge ? `is-drop-${dropEdge}` : ''
      }`}
    >
      <span className="itu-task-item__rail" aria-hidden="true" />
      <button
        type="button"
        className={`itu-task-status-button ${done ? 'is-done' : ''} ${inProgress ? 'is-in-progress' : ''} ${
          canceled ? 'is-canceled' : ''
        }`}
        onClick={(event) => handleTaskStatusClick(event, onStatusChange)}
        aria-label={`Current status: ${task.status}. Change to ${nextStatus}`}
        title={`Status: ${task.status} → ${nextStatus}`}
      >
        {done ? (
          <Check className="stroke-[3]" />
        ) : inProgress ? (
          <Play className="ml-px fill-current" />
        ) : canceled ? (
          <X />
        ) : (
          <Check className="itu-task-status-button__preview" />
        )}
      </button>

      <div className="itu-task-item__content">
        <div className="itu-task-item__headline">
          {onSelect ? (
            <button
              type="button"
              className="itu-task-item__title"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(task.id);
              }}
            >
              {task.title}
            </button>
          ) : (
            <h3 className="itu-task-item__title">{task.title}</h3>
          )}

          <div className="itu-task-item__metadata">
            {showTaskList && (task.taskList ?? task.project) && (
              <span className="itu-task-chip is-list">
                <List />
                {(task.taskList ?? task.project)?.title}
              </span>
            )}
            {taskPriority !== 'NONE' && (
              <span className={`itu-task-chip is-priority-${taskPriority.toLowerCase()}`}>
                <Flag />
                {taskPriority.toLowerCase()}
              </span>
            )}
            {task.dueAt && (
              <span
                className={`itu-task-chip is-due ${
                  !done && isOverdue(task.dueAt) ? 'is-urgent' : ''
                }`}
              >
                <Calendar />
                {formatDue(task.dueAt, done)}
              </span>
            )}
            {syncPresentation.label && (
              <span className={`itu-task-chip is-sync-${syncPresentation.kind}`} aria-live="polite">
                {syncPresentation.kind === 'failed' ? (
                  <CircleAlert />
                ) : syncPresentation.kind === 'offline' ? (
                  <CloudOff />
                ) : (
                  <RefreshCw className="motion-safe:animate-spin" />
                )}
                {syncPresentation.label}
              </span>
            )}
            {growthChips.slice(0, 3).map((chip) => (
              <GrowthRewardChip key={chip.key} chip={chip} />
            ))}
            {growthChips.length > 3 ? <span className="itu-task-chip is-more">+{growthChips.length - 3}</span> : null}
            {!compact && task.urgencyReason && <span className="itu-task-chip is-neutral">{task.urgencyReason}</span>}
          </div>
        </div>

        {task.descriptionMarkdown?.trim() && (
          <p className="itu-task-item__description">{task.descriptionMarkdown.trim()}</p>
        )}

        {showDetails && (
          <div className="itu-task-item__details">
            {hasReminder && (
              <span className="itu-task-item__detail-icon" title="Reminder set">
                <Bell />
                <span className="sr-only">Reminder set</span>
              </span>
            )}
            {task.estimatedMinutes && (
              <span className="itu-task-item__detail-icon">
                <Clock3 />
                {task.estimatedMinutes}m
              </span>
            )}
            {(task.tags ?? [])
              .filter((assignment) => assignment.tag)
              .map(({ tag }) => (
                <span key={tag.id} className="itu-task-item__tag">
                  #{tag.name}
                </span>
              ))}
            {!!task.children?.length && (
              <span>
                {task.children.length} {task.children.length === 1 ? 'subtask' : 'subtasks'} ·{' '}
                {task.children.filter((child) => child.status === 'COMPLETED').length} done
              </span>
            )}
          </div>
        )}
      </div>

      <div className="itu-task-item__actions">
        {syncPresentation.kind === 'failed' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="itu-task-retry"
            disabled={retrying}
            onClick={(event) => {
              event.stopPropagation();
              void handleRetry();
            }}
          >
            <RefreshCw className={retrying ? 'motion-safe:animate-spin' : ''} />
            {retrying ? 'Retrying…' : 'Retry'}
          </Button>
        )}
        {!done && !compact && (
          <Button asChild size="sm" variant="outline">
            <Link to={`/focus?task=${task.id}`} onClick={(event) => event.stopPropagation()}>
              <Play />
              Focus
            </Link>
          </Button>
        )}
      </div>
    </article>
  );
}

function formatDue(value: string, completed: boolean) {
  const date = new Date(value);
  if (completed) {
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfDueDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const days = calendarDayDifference(startOfToday, startOfDueDay);

  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'Day' : 'Days'} Overdue`;
  if (days === 0) return 'Due today';
  if (days <= 30) return `${days} ${days === 1 ? 'Day' : 'Days'} Left`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function isOverdue(value: string) {
  return calendarDayDifference(new Date(value), new Date()) > 0;
}

function calendarDayDifference(from: Date, to: Date) {
  const fromDay = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const toDay = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toDay - fromDay) / 86_400_000);
}
