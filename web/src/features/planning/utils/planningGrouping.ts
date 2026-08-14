import type { ProductivityTask, TaskInput, TaskPriority, TaskSection } from '@/shared/api/types';
import type { GroupMode, SortMode } from '../planning.types';

export interface KanbanTaskGroup {
  title: string;
  tasks: ProductivityTask[];
  completedTasks: ProductivityTask[];
}

export function kanbanGroups(
  groups: Array<[string, ProductivityTask[]]>,
  view: 'all' | 'today' | 'inbox' | 'upcoming',
  mode: GroupMode,
): KanbanTaskGroup[] {
  const completed = groups.find(([title]) => title === "Completed & Won't Do")?.[1] ?? [];
  const boardGroups = groups
    .filter(([title]) => title !== "Completed & Won't Do")
    .map(([title, tasks]) => ({ title, tasks, completedTasks: [] as ProductivityTask[] }));
  if (mode === 'status') return boardGroups;
  for (const task of completed) {
    const title = taskGroupLabel(task, view, mode);
    let target = boardGroups.find((group) => group.title === title);
    if (!target) {
      target = { title, tasks: [], completedTasks: [] };
      boardGroups.push(target);
    }
    target.completedTasks.push(task);
  }
  return boardGroups;
}

export function groupTasks(
  tasks: ProductivityTask[],
  view: 'all' | 'today' | 'inbox' | 'upcoming',
  mode: GroupMode,
  sections: TaskSection[],
) {
  const rootTasks = tasks.filter((task) => !task.parentId);
  const active = rootTasks.filter((task) => task.status !== 'COMPLETED' && task.status !== 'CANCELED');
  const completed = rootTasks.filter((task) => task.status === 'COMPLETED' || task.status === 'CANCELED');
  const groups = new Map<string, ProductivityTask[]>();
  if (view === 'today') {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const overdue = active.filter((task) => {
      const dateVal = task.scheduledStartAt ?? task.dueAt;
      return Boolean(dateVal && new Date(dateVal).getTime() < todayStart.getTime());
    });
    const overdueIds = new Set(overdue.map((task) => task.id));
    const nonOverdueActive = active.filter((task) => !overdueIds.has(task.id));
    if (overdue.length) groups.set('Overdue', overdue);
    seedEmptyGroups(groups, mode, sections);
    for (const task of nonOverdueActive) addToGroup(groups, taskGroupLabel(task, view, mode), task);
  } else {
    seedEmptyGroups(groups, mode, sections);
    for (const task of active) addToGroup(groups, taskGroupLabel(task, view, mode), task);
  }
  if (completed.length) groups.set("Completed & Won't Do", completed);
  return [...groups.entries()];
}

function seedEmptyGroups(groups: Map<string, ProductivityTask[]>, mode: GroupMode, sections: TaskSection[]) {
  if (mode === 'section') for (const section of sections) groups.set(section.title, []);
  if (mode === 'priority') {
    for (const priority of ['High priority', 'Medium priority', 'Low priority', 'No priority']) groups.set(priority, []);
  }
}

function addToGroup(groups: Map<string, ProductivityTask[]>, key: string, task: ProductivityTask) {
  groups.set(key, [...(groups.get(key) ?? []), task]);
}

function taskGroupLabel(task: ProductivityTask, view: 'all' | 'today' | 'inbox' | 'upcoming', mode: GroupMode) {
  if (mode === 'none') return 'Tasks';
  if (mode === 'time') return timeGroupLabel(task.scheduledStartAt ?? task.dueAt);
  if (mode === 'status') return statusLabel(task.status);
  if (mode === 'priority') return priorityLabel(task.priority);
  if (mode === 'tag') return task.tags?.[0]?.tag?.name ? `#${task.tags[0].tag.name}` : 'No tag';
  if (mode === 'created') return createdGroupLabel(task.createdAt);
  if (mode === 'section') return task.section?.title ?? 'No section';
  if (view === 'upcoming') {
    return new Date(task.scheduledStartAt ?? task.dueAt ?? Date.now()).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    });
  }
  return (task.taskList ?? task.project)?.title ?? 'Inbox';
}

export function sortTasks(tasks: ProductivityTask[], mode: SortMode) {
  if (mode === 'manual') {
    return [...tasks].sort((left, right) => {
      const order = left.sortOrder - right.sortOrder;
      if (order !== 0) return order;
      const created = nullableTime(left.createdAt) - nullableTime(right.createdAt);
      return created !== 0 ? created : left.id.localeCompare(right.id);
    });
  }
  const originalIndexById = new Map(tasks.map((task, index) => [task.id, index]));
  const preserveOriginalOrder = (left: ProductivityTask, right: ProductivityTask) =>
    (originalIndexById.get(left.id) ?? 0) - (originalIndexById.get(right.id) ?? 0);
  return [...tasks].sort((left, right) => {
    if (mode === 'created' || mode === 'created-desc') {
      const created = nullableTime(right.createdAt) - nullableTime(left.createdAt);
      return created !== 0 ? created : preserveOriginalOrder(left, right);
    }
    if (mode === 'created-asc') {
      const created = nullableTime(left.createdAt) - nullableTime(right.createdAt);
      return created !== 0 ? created : preserveOriginalOrder(left, right);
    }
    if (mode === 'modified-desc') {
      const modified = nullableTime(right.updatedAt) - nullableTime(left.updatedAt);
      return modified !== 0 ? modified : preserveOriginalOrder(left, right);
    }
    if (mode === 'modified-asc') {
      const modified = nullableTime(left.updatedAt) - nullableTime(right.updatedAt);
      return modified !== 0 ? modified : preserveOriginalOrder(left, right);
    }
    if (mode === 'due') {
      const leftTime = dueSortTime(left);
      const rightTime = dueSortTime(right);
      if (leftTime !== rightTime) return leftTime - rightTime;
      const leftAllDay = isAllDayDue(left.dueAt) ? 1 : 0;
      const rightAllDay = isAllDayDue(right.dueAt) ? 1 : 0;
      if (leftAllDay !== rightAllDay) return leftAllDay - rightAllDay;
      return leftTime - rightTime;
    }
    if (mode === 'title') return left.title.localeCompare(right.title);
    const priority: Record<TaskPriority, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };
    return priority[right.priority] - priority[left.priority];
  });
}

export function reorderedTaskIds(
  groups: Array<[string, ProductivityTask[]]>,
  taskId: string,
  targetGroup: string,
  beforeTaskId?: string,
) {
  const next = groups.map(([group, tasks]) => [group, tasks.filter((task) => task.id !== taskId)] as const);
  const target = next.find(([group]) => group === targetGroup);
  if (!target) return groups.flatMap(([, tasks]) => tasks.map((task) => task.id));
  const dragged = groups.flatMap(([, tasks]) => tasks).find((task) => task.id === taskId);
  if (!dragged) return groups.flatMap(([, tasks]) => tasks.map((task) => task.id));
  const index = beforeTaskId ? target[1].findIndex((task) => task.id === beforeTaskId) : -1;
  target[1].splice(index < 0 ? target[1].length : index, 0, dragged);
  return next.flatMap(([, tasks]) => tasks.map((task) => task.id));
}

export function applyManualTaskOrder(
  tasks: ProductivityTask[],
  orderedTaskIds: string[],
  movedTaskId: string,
  patch: Partial<TaskInput> = {},
) {
  const sortOrderById = new Map(orderedTaskIds.map((id, index) => [id, index + 1]));
  return tasks.map((task) => {
    const nextSortOrder = sortOrderById.get(task.id);
    if (nextSortOrder === undefined && task.id !== movedTaskId) return task;
    return { ...task, ...(task.id === movedTaskId ? patch : {}), sortOrder: nextSortOrder ?? task.sortOrder };
  });
}

export function manualMoveBeforeTaskId(
  tasks: ReadonlyArray<Pick<ProductivityTask, 'id'>>,
  taskId: string,
  direction: 'up' | 'down',
) {
  const index = tasks.findIndex((task) => task.id === taskId);
  if (index < 0) return taskId;
  if (direction === 'up') return tasks[index - 1]?.id ?? taskId;
  if (index >= tasks.length - 1) return taskId;
  return tasks[index + 2]?.id;
}

export function groupMovePatch(
  groups: Array<[string, ProductivityTask[]]>,
  targetGroup: string,
  dragged: ProductivityTask,
  mode: GroupMode,
  view: 'all' | 'today' | 'inbox' | 'upcoming',
  sections: TaskSection[],
): Partial<TaskInput> {
  const targetTasks = groups.find(([group]) => group === targetGroup)?.[1] ?? [];
  const example = targetTasks.find((task) => task.id !== dragged.id);
  if (targetGroup === "Completed & Won't Do") return { status: 'COMPLETED' };
  const reopen = dragged.status === 'COMPLETED' || dragged.status === 'CANCELED';
  const status = reopen ? (example?.status === 'INBOX' ? 'INBOX' : 'PLANNED') : undefined;
  if (mode === 'status' && example) return { status: example.status };
  if (mode === 'priority' && example) return { priority: example.priority, status };
  if (mode === 'time' && example) {
    const targetDate = example.dueAt ?? example.scheduledStartAt;
    return targetDate ? { dueAt: targetDate, status } : { dueAt: null, status };
  }
  if (mode === 'section') {
    const section = sections.find((item) => item.title === targetGroup);
    return { sectionId: section?.id ?? null, projectId: section?.projectId ?? dragged.projectId ?? null, status };
  }
  if (mode === 'project') {
    if (view === 'upcoming' && example) {
      const targetDate = example.scheduledStartAt ?? example.dueAt;
      return targetDate ? { scheduledStartAt: targetDate, status } : { status };
    }
    return { projectId: example?.projectId ?? null, status: status ?? (example?.status === 'INBOX' ? 'INBOX' : undefined) };
  }
  return status ? { status } : {};
}

export function isInboxViewTask(task: ProductivityTask, inboxListId?: string | null): boolean {
  const taskListId = task.taskListId ?? task.projectId;
  const isInboxList = !taskListId || taskListId === inboxListId;
  const isTerminalOrUnassigned =
    task.status === 'COMPLETED' || task.status === 'CANCELED' || (task.status === 'INBOX' && !task.scheduledStartAt);
  return isInboxList && isTerminalOrUnassigned;
}

export function countInbox(tasks: ProductivityTask[]) {
  return tasks.filter(
    (task) => task.status === 'INBOX' && !(task.taskListId ?? task.projectId) && !task.scheduledStartAt,
  ).length;
}

export function countToday(tasks: ProductivityTask[]) {
  const today = new Date().toDateString();
  return tasks.filter((task) => {
    const date = task.scheduledStartAt ?? task.dueAt;
    return date && new Date(date).toDateString() === today;
  }).length;
}

function statusLabel(status: ProductivityTask['status']) {
  return status.toLowerCase().split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function priorityLabel(priority: TaskPriority) {
  return priority === 'NONE' ? 'No priority' : `${priority[0]}${priority.slice(1).toLowerCase()} priority`;
}

function dueSortTime(task: ProductivityTask) {
  const value = task.dueAt ?? task.scheduledStartAt;
  if (!value) return Number.POSITIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.POSITIVE_INFINITY;
}

function isAllDayDue(value: string | null | undefined) {
  if (!value) return false;
  const date = new Date(value);
  return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0;
}

function timeGroupLabel(value: string | null | undefined) {
  if (!value) return 'No date';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'No date';
  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(date);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return 'Next 7 Days';
  return 'Later';
}

function createdGroupLabel(value: string | null | undefined) {
  if (!value) return 'Unknown created time';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown created time';
  const today = startOfLocalDay(new Date());
  const target = startOfLocalDay(date);
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Created today';
  if (diffDays === 1) return 'Created yesterday';
  if (diffDays <= 7) return 'Created last 7 days';
  if (diffDays <= 30) return 'Created last 30 days';
  return 'Created earlier';
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function nullableTime(value: string | null | undefined): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}
