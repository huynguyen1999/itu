import type { IProductivityRepository, ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import type { IQueueJobHandler, ISyncInvalidationNotifier } from '@core/application/ports/out/services.port';
import { EntityNotFoundException } from '@core/domain/exceptions';
import { HabitOccurrenceStatus } from '@core/domain/enums';

export class HabitService {
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

  async listHabits(userId: string, includeArchived = false) {
    return this.repo.listHabits(userId, includeArchived);
  }

  async listHabitsWithStats(userId: string) {
    const habits = await this.repo.listHabits(userId);
    const stats = await this.repo.listHabitStats(
      userId,
      habits.map((habit) => habit.id),
    );
    return habits.map((habit) => ({ ...habit, stats: stats[habit.id] ?? null }));
  }

  async findHabitById(userId: string, id: string) {
    const habit = await this.repo.findHabitById(userId, id);
    if (!habit) throw new EntityNotFoundException('Habit', id);
    return habit;
  }

  async createHabit(userId: string, input: any) {
    const habit = await this.repo.createHabit(userId, input);
    await this.emitSyncChangeAndInvalidate(userId, 'habit', habit.id, 'UPSERT', habit);
    return habit;
  }

  async updateHabit(userId: string, id: string, input: any) {
    const updated = await this.repo.updateHabit(userId, id, input);
    if (!updated) throw new EntityNotFoundException('Habit', id);
    await this.emitSyncChangeAndInvalidate(userId, 'habit', updated.id, 'UPSERT', updated);
    return updated;
  }

  async deleteHabit(userId: string, id: string) {
    const deleted = await this.repo.deleteHabit(userId, id);
    if (deleted) {
      await this.emitSyncChangeAndInvalidate(userId, 'habit', id, 'DELETE', { id });
    }
    return deleted;
  }

  async listHabitOccurrences(userId: string, filter?: any) {
    return this.repo.listHabitOccurrences(userId, filter);
  }

  async listHabitCalendar(userId: string, filter: { from: string; to: string; habitId?: string }) {
    return this.repo.listHabitCalendar(userId, filter);
  }

  async getCommitmentPolicy(userId: string, habitId: string) {
    return this.repo.getHabitCommitmentPolicy(userId, habitId);
  }

  async upsertCommitmentPolicy(userId: string, habitId: string, input: any) {
    return this.repo.upsertHabitCommitmentPolicy(userId, habitId, input);
  }

  async evaluateCommitment(userId: string, occurrenceId: string, now?: Date, idempotencyKey?: string) {
    return this.repo.evaluateHabitCommitment(userId, occurrenceId, now, idempotencyKey);
  }

  async excuseCommitment(userId: string, occurrenceId: string, idempotencyKey?: string) {
    return this.repo.excuseHabitCommitment(userId, occurrenceId, idempotencyKey);
  }

  async completeHabit(userId: string, habitId: string, date: string, notes?: string) {
    const occurrence = await this.repo.upsertHabitOccurrence(userId, {
      habitId,
      date: new Date(date),
      status: HabitOccurrenceStatus.COMPLETED,
      notes,
    });
    await this.emitSyncChangeAndInvalidate(userId, 'habitoccurrence', occurrence.id, 'UPSERT', occurrence);
    return occurrence;
  }

  async checkIn(userId: string, occurrenceId: string, input: any) {
    const updated = await this.repo.checkIn(userId, occurrenceId, input);
    await this.emitSyncChangeAndInvalidate(userId, 'habitoccurrence', occurrenceId, 'UPSERT', updated);
    return updated;
  }

  async checkInByDate(userId: string, habitId: string, localDate: string, input: any) {
    const updated = await this.repo.checkInByDate(userId, habitId, localDate, input);
    await this.emitSyncChangeAndInvalidate(userId, 'habitoccurrence', updated.occurrenceId ?? updated.id, 'UPSERT', updated);
    return updated;
  }

  async habitOccurrenceAction(userId: string, id: string, action: 'skip' | 'fail' | 'undo', idempotencyKey?: string) {
    const updated = await this.repo.habitOccurrenceAction(userId, id, action, idempotencyKey);
    await this.emitSyncChangeAndInvalidate(userId, 'habitoccurrence', id, 'UPSERT', updated);
    return updated;
  }

  async habitOccurrenceActionByDate(userId: string, habitId: string, localDate: string, action: 'skip' | 'fail' | 'undo', idempotencyKey?: string) {
    const updated = await this.repo.habitOccurrenceActionByDate(userId, habitId, localDate, action, idempotencyKey);
    await this.emitSyncChangeAndInvalidate(userId, 'habitoccurrence', updated.id, 'UPSERT', updated);
    return updated;
  }

  async listHabitProgress(userId: string, habitId: string, filter?: { from?: string; to?: string }) {
    return this.repo.listHabitProgress(userId, habitId, filter);
  }

  async deleteHabitProgress(userId: string, progressId: string) {
    const result = await this.repo.deleteHabitProgress(userId, progressId);
    if (!result) throw new EntityNotFoundException('Habit progress log', progressId);
    await this.emitSyncChangeAndInvalidate(userId, 'habitoccurrence', result.occurrence.id, 'UPSERT', result.occurrence);
    return result;
  }

  async setOccurrenceChecklistItem(userId: string, occurrenceId: string, itemId: string, completed: boolean) {
    return this.repo.setOccurrenceChecklistItem(userId, occurrenceId, itemId, completed);
  }

  async habitStats(userId: string, habitId: string) {
    return this.repo.habitStats(userId, habitId);
  }

  async habitInsights(userId: string, habitId: string, filter: { from: string; to: string }) {
    return this.repo.habitInsights(userId, habitId, filter);
  }

  async habitReminderAction(userId: string, deliveryId: string, action: 'snooze' | 'dismiss' | 'complete', remindAt?: string) {
    return this.repo.habitReminderAction(userId, deliveryId, action, remindAt);
  }

  async listTimeBlocks(userId: string) {
    return this.repo.listTimeBlocks(userId);
  }

  async createTimeBlock(userId: string, input: any) {
    const timeBlock = await this.repo.createTimeBlock(userId, input);
    await this.emitSyncChangeAndInvalidate(userId, 'timeblock', timeBlock.id, 'UPSERT', timeBlock);
    return timeBlock;
  }

  async updateTimeBlock(userId: string, id: string, input: any) {
    const updated = await this.repo.updateTimeBlock(userId, id, input);
    if (!updated) throw new EntityNotFoundException('TimeBlock', id);
    await this.emitSyncChangeAndInvalidate(userId, 'timeblock', updated.id, 'UPSERT', updated);
    return updated;
  }

  async deleteTimeBlock(userId: string, id: string) {
    const deleted = await this.repo.deleteTimeBlock(userId, id);
    if (deleted) {
      await this.emitSyncChangeAndInvalidate(userId, 'timeblock', id, 'DELETE', { id });
    }
    return deleted;
  }
}
