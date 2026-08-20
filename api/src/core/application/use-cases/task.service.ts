import type { IProductivityRepository, ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import type { IQueueJobHandler, ISyncInvalidationNotifier } from '@core/application/ports/out/services.port';
import { EntityNotFoundException } from '@core/domain/exceptions';
import { deriveUrgency } from './productivity-rules';
import { normalizeCursorOptions } from '@core/application/pagination/cursor-pagination';
import type { CursorPage } from '@core/application/ports/pagination.port';

export class TaskService {
  constructor(
    private readonly repo: IProductivityRepository,
    private readonly invalidationNotifier?: ISyncInvalidationNotifier,
    private readonly devices?: ISyncDeviceRepository,
    private readonly queue?: IQueueJobHandler,
  ) {}

  private async emitSyncChangeAndInvalidate(
    userId: string,
    entityType: string,
    entityId: string,
    operation: 'UPSERT' | 'DELETE',
    data: object,
  ) {
    if (this.queue) {
      await this.queue.enqueueSyncInvalidation({
        userId,
        entityType,
        entityId,
        operation,
        data,
      });
      return;
    }
    const change = await this.repo.recordSyncChange(userId, entityType, entityId, operation, data);
    if (this.invalidationNotifier && this.devices) {
      const targets = await this.devices.listNotificationTargets(userId, '');
      if (targets.length > 0) {
        void this.invalidationNotifier.notifySyncAvailable({
          userId,
          originDeviceId: '',
          originClientInstanceId: '',
          cursor: String(change.cursor),
          targets: targets.map((t) => ({ deviceId: t.id, platform: t.platform, pushToken: t.pushToken })),
        });
      }
    }
  }

  async listTaskLists(userId: string, filter?: any) {
    await this.ensureDefaultTaskList(userId);
    return this.repo.listTaskLists(userId, filter);
  }

  async ensureDefaultTaskList(userId: string) {
    const lists = await this.repo.listTaskLists(userId);
    if (lists.length === 0) {
      const defaultList = await this.repo.createTaskList(userId, { title: 'Inbox', isDefault: true });
      await this.emitSyncChangeAndInvalidate(userId, 'tasklist', defaultList.id, 'UPSERT', defaultList);
      return defaultList;
    }
    return lists.find((l) => l.isDefault) ?? lists[0];
  }

  async createTaskList(userId: string, input: { title: string; color?: string; icon?: string; isDefault?: boolean }) {
    const list = await this.repo.createTaskList(userId, input);
    await this.emitSyncChangeAndInvalidate(userId, 'tasklist', list.id, 'UPSERT', list);
    return list;
  }

  async updateTaskList(userId: string, id: string, input: any) {
    const updated = await this.repo.updateTaskList(userId, id, input);
    if (!updated) throw new EntityNotFoundException('TaskList', id);
    await this.emitSyncChangeAndInvalidate(userId, 'tasklist', updated.id, 'UPSERT', updated);
    return updated;
  }

  async deleteTaskList(userId: string, id: string) {
    const deleted = await this.repo.deleteTaskList(userId, id);
    if (deleted) {
      await this.emitSyncChangeAndInvalidate(userId, 'tasklist', id, 'DELETE', { id });
    }
    return deleted;
  }

  async listSections(userId: string, taskListId?: string, filter?: any) {
    return this.repo.listSections(userId, taskListId, filter);
  }

  async createSection(userId: string, input: { taskListId?: string | null; title: string }) {
    const section = await this.repo.createSection(userId, input);
    await this.emitSyncChangeAndInvalidate(userId, 'tasksection', section.id, 'UPSERT', section);
    return section;
  }

  async updateSection(userId: string, id: string, input: { title?: string; sortOrder?: number }) {
    const updated = await this.repo.updateSection(userId, id, input);
    if (!updated) throw new EntityNotFoundException('TaskSection', id);
    await this.emitSyncChangeAndInvalidate(userId, 'tasksection', updated.id, 'UPSERT', updated);
    return updated;
  }

  async deleteSection(userId: string, id: string) {
    const deleted = await this.repo.deleteSection(userId, id);
    if (deleted) {
      await this.emitSyncChangeAndInvalidate(userId, 'tasksection', id, 'DELETE', { id });
    }
    return deleted;
  }

  async listTasks(userId: string, filter?: any): Promise<CursorPage<any>> {
    const now = new Date();
    const normalized = normalizeCursorOptions(filter);
    const { data, hasNextPage, nextCursor } = await this.repo.listTasks(userId, {
      ...filter,
      limit: normalized.limit,
      cursor: normalized.cursor?.id,
      q: normalized.q,
    });
    return {
      data: data.map((t: any) => ({ ...t, ...deriveUrgency(t, now) })),
      meta: { hasNextPage, nextCursor },
    };
  }

  async findTaskById(userId: string, id: string) {
    const task = await this.repo.findTaskById(userId, id);
    if (!task) return null;
    return { ...task, ...deriveUrgency(task, new Date()) };
  }

  async createTask(userId: string, input: any) {
    const defaultList = await this.ensureDefaultTaskList(userId);
    const task = await this.repo.createTask(userId, {
      ...input,
      taskListId: input.taskListId ?? defaultList.id,
    });
    await this.emitSyncChangeAndInvalidate(userId, 'task', task.id, 'UPSERT', task);
    return { ...task, ...deriveUrgency(task, new Date()) };
  }

  async updateTask(userId: string, id: string, input: any) {
    const updated = await this.repo.updateTask(userId, id, input);
    if (!updated) throw new EntityNotFoundException('Task', id);
    await this.emitSyncChangeAndInvalidate(userId, 'task', updated.id, 'UPSERT', updated);
    return { ...updated, ...deriveUrgency(updated, new Date()) };
  }

  async deleteTask(userId: string, id: string) {
    const deleted = await this.repo.deleteTask(userId, id);
    if (deleted) {
      await this.emitSyncChangeAndInvalidate(userId, 'task', id, 'DELETE', { id });
    }
    return deleted;
  }

  async reorderTasks(userId: string, taskIds: string[]) {
    return this.repo.reorderTasks(userId, taskIds);
  }

  async setTaskStatus(userId: string, id: string, status: string) {
    const updated = await this.repo.updateTask(userId, id, { status });
    if (!updated) throw new EntityNotFoundException('Task', id);
    await this.emitSyncChangeAndInvalidate(userId, 'task', updated.id, 'UPSERT', updated);
    return updated;
  }

  async createReminder(userId: string, taskId: string, input: any) {
    return this.repo.createReminder(userId, taskId, input);
  }

  async updateReminder(userId: string, id: string, input: any) {
    return this.repo.updateReminder(userId, id, input);
  }

  async reminderAction(userId: string, id: string, action: 'snooze' | 'dismiss', remindAt?: string) {
    return this.repo.reminderAction(userId, id, action, remindAt);
  }

  async listTaskTags(userId: string) {
    return this.repo.listTaskTags(userId);
  }

  async createTaskTag(userId: string, input: { name: string; color?: string }) {
    return this.repo.createTaskTag(userId, input);
  }

  async getMatrix(userId: string) {
    const { data: tasks } = await this.listTasks(userId);
    const doFirst = [];
    const schedule = [];
    const delegate = [];
    const dontDo = [];

    for (const t of tasks) {
      const isUrgent = Boolean(t.urgent);
      const isImportant = Boolean(t.important);

      if (isUrgent && isImportant) doFirst.push(t);
      else if (!isUrgent && isImportant) schedule.push(t);
      else if (isUrgent && !isImportant) delegate.push(t);
      else dontDo.push(t);
    }

    return { doFirst, schedule, delegate, dontDo };
  }

  async listNotifications(userId: string, filter?: any) {
    return this.repo.listNotifications(userId, filter);
  }

  async markAllNotificationsRead(userId: string) {
    return this.repo.markAllNotificationsRead(userId);
  }

  async markNotificationRead(userId: string, id: string) {
    return this.repo.markNotificationRead(userId, id);
  }
}
