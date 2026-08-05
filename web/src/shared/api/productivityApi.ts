import { createUlid } from '../sync/syncIdentity';
import { applyTaskDefaults } from '../taskDefaults';
import type {
  AppNotification,
  CursorPage,
  GrowthAwardReceipt,
  ProductivityTask,
  TaskInput,
  TaskList,
  TaskSection,
  TaskTag,
} from './types';
import type { ApiClientContext } from './apiContext';

export function createProductivityApi(ctx: ApiClientContext) {
  return {
    taskLists(includeCounts = false) {
      return ctx.request<TaskList[]>(`/productivity/task-lists${includeCounts ? '?includeTaskCount=true' : ''}`);
    },
    projects() {
      return this.taskLists();
    },
    createTaskList(data: { title: string; description?: string; color?: string }) {
      const id = createUlid();
      const optimistic = { id, ...data, color: data.color ?? 'TEAL', version: 1 } as TaskList;
      return ctx.offlineMutation({ kind: 'tasklist.create', entityId: id, payload: data, optimistic }, () =>
        ctx.request<TaskList>('/productivity/task-lists', { method: 'POST', body: JSON.stringify(data) }),
      );
    },
    createProject(data: { title: string; description?: string; color?: string }) {
      return this.createTaskList(data);
    },
    updateTaskList(id: string, data: Partial<TaskList> & { archived?: boolean }) {
      return ctx.offlineMutation(
        {
          kind: 'tasklist.update',
          entityId: id,
          payload: data,
          baseVersion: data.version,
          optimistic: { id, ...data } as TaskList,
        },
        () => ctx.request<TaskList>(`/productivity/task-lists/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      );
    },
    updateProject(id: string, data: Partial<TaskList> & { archived?: boolean }) {
      return this.updateTaskList(id, data);
    },
    deleteTaskList(id: string) {
      return ctx.offlineMutation(
        { kind: 'tasklist.delete', entityId: id, payload: {}, immediate: true, optimistic: undefined },
        () => ctx.request<void>(`/productivity/task-lists/${id}`, { method: 'DELETE' }),
      );
    },
    deleteProject(id: string) {
      return this.deleteTaskList(id);
    },
    taskTags() {
      return ctx.request<TaskTag[]>('/productivity/task-tags');
    },
    createTaskTag(data: { name: string; color?: string }) {
      return ctx.request<TaskTag>('/productivity/task-tags', { method: 'POST', body: JSON.stringify(data) });
    },
    taskSections() {
      return ctx.request<TaskSection[]>('/productivity/task-sections');
    },
    createTaskSection(data: { title: string; taskListId?: string | null; projectId?: string | null }) {
      return ctx.request<TaskSection>('/productivity/task-sections', { method: 'POST', body: JSON.stringify(data) });
    },
    updateTaskSection(id: string, data: { title?: string; version?: number }) {
      return ctx.request<TaskSection>(`/productivity/task-sections/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    deleteTaskSection(id: string) {
      return ctx.request<void>(`/productivity/task-sections/${id}`, { method: 'DELETE' });
    },
    tasks(
      query: {
        view?: string;
        taskListId?: string;
        projectId?: string;
        tagId?: string;
        status?: string;
        q?: string;
        cursor?: string | null;
        limit?: number;
      } = {},
    ) {
      const search = new URLSearchParams();
      Object.entries(query).forEach(([key, value]) => {
        if (value != null && value !== '') search.set(key, String(value));
      });
      return ctx.request<CursorPage<ProductivityTask>>(`/productivity/tasks${search.size ? `?${search}` : ''}`);
    },
    taskMatrix() {
      return ctx.request<Record<string, ProductivityTask[]>>('/productivity/tasks/matrix');
    },
    createTask(data: TaskInput) {
      data = applyTaskDefaults(data);
      const id = createUlid();
      const optimistic = optimisticTask(id, data);
      return ctx.offlineMutation(
        { kind: 'task.create', entityId: id, payload: normalizeTaskPayload(data), optimistic },
        () => ctx.request<ProductivityTask>('/productivity/tasks', { method: 'POST', body: JSON.stringify(data) }),
      );
    },
    createHabitTask(id: string, data: Record<string, unknown>) {
      return this.createTask({ ...(data as unknown as TaskInput), sourceHabitId: id } as TaskInput);
    },
    updateTask(id: string, data: Partial<TaskInput> & { sortOrder?: number }) {
      const optimistic = optimisticTaskUpdate(id, data);
      return ctx.offlineMutation(
        {
          kind: 'task.update',
          entityId: id,
          payload: normalizeTaskPayload(data),
          baseVersion: data.version,
          immediate: data.status !== undefined,
          optimistic,
        },
        () =>
          ctx.request<ProductivityTask & { growthReceipt?: GrowthAwardReceipt | null }>(`/productivity/tasks/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
          }),
      );
    },
    reorderTasks(taskIds: string[]) {
      const id = createUlid();
      return ctx.offlineMutation(
        {
          kind: 'task.reorder',
          entityId: id,
          payload: { taskIds },
          optimistic: { taskIds },
        },
        () =>
          ctx.request<{ taskIds: string[] }>('/productivity/tasks/reorder', {
            method: 'POST',
            body: JSON.stringify({ taskIds }),
          }),
      );
    },
    deleteTask(id: string) {
      return ctx.offlineMutation(
        { kind: 'task.delete', entityId: id, payload: {}, immediate: true, optimistic: undefined },
        () => ctx.request<void>(`/productivity/tasks/${id}`, { method: 'DELETE' }),
      );
    },
    restoreTrashTask(id: string) {
      return ctx.offlineMutation(
        { kind: 'task.restore', entityId: id, payload: {}, immediate: true, optimistic: { ok: true } },
        () => ctx.request<{ ok: boolean }>(`/trash/tasks/${id}/restore`, { method: 'POST' }),
      );
    },
    deleteTrashTask(id: string) {
      return ctx.request<{ ok: boolean }>(`/trash/tasks/${id}`, { method: 'DELETE' });
    },
    taskAction(id: string, action: 'complete' | 'reopen' | 'cancel' | 'archive') {
      const status =
        action === 'complete'
          ? 'COMPLETED'
          : action === 'reopen'
            ? 'INBOX'
            : action === 'cancel'
              ? 'CANCELED'
              : 'ARCHIVED';
      return this.updateTask(id, { status });
    },
    createTaskReminder(id: string, data: { remindAt: string; persistent?: boolean }) {
      return ctx.request(`/productivity/tasks/${id}/reminders`, { method: 'POST', body: JSON.stringify(data) });
    },
    notifications() {
      return ctx.request<AppNotification[]>('/productivity/notifications');
    },
    markNotificationRead(id: string) {
      return ctx.request<AppNotification>(`/productivity/notifications/${id}/read`, { method: 'PATCH' });
    },
    markAllNotificationsRead() {
      return ctx.request<{ count: number }>('/productivity/notifications/read-all', { method: 'POST' });
    },
  };
}

export type ProductivityApi = ReturnType<typeof createProductivityApi>;

function optimisticTask(id: string, data: TaskInput): ProductivityTask {
  const createdAt = new Date().toISOString();
  return {
    id,
    taskListId: data.taskListId ?? data.projectId ?? null,
    projectId: data.projectId ?? data.taskListId ?? null,
    sectionId: data.sectionId ?? null,
    parentId: data.parentId ?? null,
    title: data.title,
    descriptionMarkdown: data.descriptionMarkdown ?? '',
    priority: data.priority ?? 'NONE',
    important: data.important ?? false,
    urgentOverride: data.urgentOverride ?? null,
    urgent: data.urgentOverride ?? false,
    urgencyReason: 'Pending synchronization',
    scheduledStartAt: data.scheduledStartAt ?? null,
    scheduledEndAt: data.scheduledEndAt ?? null,
    dueAt: data.dueAt ?? null,
    estimatedMinutes: data.estimatedMinutes ?? null,
    recurrenceRule: data.recurrenceRule ?? null,
    status: data.status ?? 'INBOX',
    sortOrder: Date.now(),
    completedAt: data.status === 'COMPLETED' ? new Date().toISOString() : null,
    deletedAt: null,
    createdAt,
    version: 1,
    taskList: null,
    project: null,
    section: null,
    tags: [],
    reminders: [],
    children: [],
  };
}

function optimisticTaskUpdate(id: string, data: Partial<TaskInput> & { sortOrder?: number }): ProductivityTask {
  const optimistic: Record<string, unknown> = { id, ...normalizeTaskPayload(data) };
  if (typeof data.version === 'number') optimistic.version = data.version + 1;
  if (data.status === 'COMPLETED') optimistic.completedAt = new Date().toISOString();
  if (data.status !== undefined && data.status !== 'COMPLETED') optimistic.completedAt = null;
  return optimistic as unknown as ProductivityTask;
}

function normalizeTaskPayload(data: Partial<TaskInput>): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...data };
  if (payload.taskListId === undefined && data.projectId !== undefined) payload.taskListId = data.projectId;
  delete payload.projectId;
  delete payload.version;
  return payload;
}
