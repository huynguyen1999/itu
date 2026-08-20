import type { IProductivityRepository, ISyncDeviceRepository } from '@core/application/ports/out/repositories.port';
import type { IQueueJobHandler, IMediaStorage, ISyncInvalidationNotifier } from '@core/application/ports/out/services.port';
import { DomainException, EntityNotFoundException } from '@core/domain/exceptions';
import { FocusSessionStatus } from '@core/application/constants/productivity.constants';
import { FocusPhase } from '@core/domain/enums';
import { BUILTIN_FOCUS_SOUNDS } from '@core/application/constants/focus-sound.constants';

export class FocusService {
  constructor(
    private readonly repo: IProductivityRepository,
    private readonly invalidationNotifier?: ISyncInvalidationNotifier,
    private readonly devices?: ISyncDeviceRepository,
    private readonly queue?: IQueueJobHandler,
    private readonly media?: IMediaStorage,
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

  async listFocusPresets(userId: string) {
    return this.repo.listFocusPresets(userId);
  }

  async findFocusPresetById(userId: string, id: string) {
    const preset = await this.repo.findFocusPresetById(userId, id);
    if (!preset) throw new EntityNotFoundException('FocusPreset', id);
    return preset;
  }

  async createFocusPreset(userId: string, input: any) {
    const preset = await this.repo.createFocusPreset(userId, input);
    await this.emitSyncChangeAndInvalidate(userId, 'focuspreset', preset.id, 'UPSERT', preset);
    return preset;
  }

  async updateFocusPreset(userId: string, id: string, input: any) {
    const updated = await this.repo.updateFocusPreset(userId, id, input);
    if (!updated) throw new EntityNotFoundException('FocusPreset', id);
    await this.emitSyncChangeAndInvalidate(userId, 'focuspreset', updated.id, 'UPSERT', updated);
    return updated;
  }

  async deleteFocusPreset(userId: string, id: string) {
    const deleted = await this.repo.deleteFocusPreset(userId, id);
    if (deleted) {
      await this.emitSyncChangeAndInvalidate(userId, 'focuspreset', id, 'DELETE', { id });
    }
    return deleted;
  }

  async listFocusSessions(userId: string, filter?: any) {
    return this.repo.listFocusSessions(userId, filter);
  }

  async findFocusSessionById(userId: string, id: string) {
    return this.repo.findFocusSessionById(userId, id);
  }

  async getActiveFocusSession(userId: string) {
    return this.repo.findActiveFocusSession(userId);
  }

  async startFocusSession(userId: string, input: any) {
    const session = await this.repo.createFocusSession(userId, {
      ...input,
      phase: input.phase ?? FocusPhase.WORK,
      status: FocusSessionStatus.ACTIVE,
      startedAt: new Date(),
    });
    await this.emitSyncChangeAndInvalidate(userId, 'focussession', session.id, 'UPSERT', session);
    return session;
  }

  async completeFocusSession(userId: string, id: string) {
    const session = await this.repo.findFocusSessionById(userId, id);
    if (!session) throw new EntityNotFoundException('FocusSession', id);
    if (session.status === FocusSessionStatus.COMPLETED) return session;
    const updated = await this.repo.updateFocusSession(userId, id, {
      status: FocusSessionStatus.COMPLETED,
      completedAt: new Date(),
    });
    await this.emitSyncChangeAndInvalidate(userId, 'focussession', updated.id, 'UPSERT', updated);
    return updated;
  }

  async cancelFocusSession(userId: string, id: string) {
    const session = await this.repo.findFocusSessionById(userId, id);
    if (!session) throw new EntityNotFoundException('FocusSession', id);
    const updated = await this.repo.updateFocusSession(userId, id, {
      status: FocusSessionStatus.ABANDONED,
      completedAt: new Date(),
    });
    await this.emitSyncChangeAndInvalidate(userId, 'focussession', updated.id, 'UPSERT', updated);
    return updated;
  }

  async focusAction(userId: string, id: string, action: string, dto: any) {
    const session = await this.repo.focusAction(userId, id, action, dto);
    await this.emitSyncChangeAndInvalidate(userId, 'focussession', session.id, 'UPSERT', session);
    return session;
  }

  async adjustFocus(
    userId: string,
    id: string,
    startedAt?: string,
    completedAt?: string,
    taskId?: string,
    expectedVersion?: number,
    idempotencyKey?: string,
  ) {
    const session = await this.repo.adjustFocus(userId, id, startedAt, completedAt, taskId, expectedVersion, idempotencyKey);
    await this.emitSyncChangeAndInvalidate(userId, 'focussession', session.id, 'UPSERT', session);
    return session;
  }

  async listFocusHistory(userId: string) {
    const sessions = await this.repo.listFocusSessions(userId);
    return sessions.filter((s) =>
      s.phase === FocusPhase.WORK
        ? s.status === FocusSessionStatus.COMPLETED || s.status === FocusSessionStatus.ABANDONED
        : s.status === FocusSessionStatus.COMPLETED,
    );
  }

  async getFocusSummary(userId: string) {
    const sessions = await this.repo.listFocusSessions(userId);
    const workSessions = sessions.filter((s) => s.phase === FocusPhase.WORK);
    const completed = workSessions.filter((s) => s.status === FocusSessionStatus.COMPLETED);
    const totalDurationSeconds = completed.reduce((acc, s) => {
      const start = s.startedAt ? new Date(s.startedAt).getTime() : 0;
      const end = s.completedAt ? new Date(s.completedAt).getTime() : start;
      const secs = Math.max(0, Math.floor((end - start) / 1000) - (s.accumulatedPauseSecs ?? 0));
      return acc + (s.actualSeconds ?? secs);
    }, 0);

    return {
      totalSessions: workSessions.length,
      completedSessions: completed.length,
      completionRate: workSessions.length === 0 ? 0 : Math.round((completed.length / workSessions.length) * 100),
      totalFocusedMinutes: Math.round(totalDurationSeconds / 60),
    };
  }

  async listFocusSounds(userId: string) {
    const [sounds, preferences] = await Promise.all([
      this.repo.listFocusSounds(userId),
      this.repo.listFocusSoundPreferences(userId),
    ]);
    return {
      sounds: [
        ...BUILTIN_FOCUS_SOUNDS,
        ...sounds.map((sound) => ({
          ...sound,
          url: `/media/audio/${sound.storageKey}`,
          source: 'UPLOAD' as const,
          category: 'Uploaded',
          defaultVolume: 0.4,
        })),
      ],
      preferences,
    };
  }

  async createFocusSound(userId: string, input: { name: string; originalName: string; mimeType: string; buffer: Buffer }) {
    if (!this.media) throw new DomainException('Audio storage is not configured');
    const id = crypto.randomUUID();
    const stored = await this.media.storeAudio({ userId, soundId: id, ...input });
    const sound = await this.repo.createFocusSound(userId, {
      id,
      name: input.name,
      originalName: input.originalName,
      storageKey: stored.storageKey,
      mimeType: stored.mimeType,
      sizeBytes: stored.sizeBytes,
    });
    await this.emitSyncChangeAndInvalidate(userId, 'focussound', sound.id, 'UPSERT', sound);
    return { ...sound, url: `/media/audio/${sound.storageKey}` };
  }

  async updateFocusSound(userId: string, id: string, input: { name: string }) {
    const name = input.name.trim().slice(0, 80);
    if (!name) throw new DomainException('Sound name is required');
    const sound = await this.repo.updateFocusSound(userId, id, { name });
    if (!sound) throw new EntityNotFoundException('FocusSound', id);
    await this.emitSyncChangeAndInvalidate(userId, 'focussound', sound.id, 'UPSERT', sound);
    return {
      ...sound,
      url: `/media/audio/${sound.storageKey}`,
      source: 'UPLOAD' as const,
      category: 'Uploaded',
      defaultVolume: 0.4,
    };
  }

  async deleteFocusSound(userId: string, id: string) {
    const sound = await this.repo.deleteFocusSound(userId, id);
    if (!sound) throw new EntityNotFoundException('FocusSound', id);
    if (this.media) await this.media.delete(sound.storageKey);
    await this.emitSyncChangeAndInvalidate(userId, 'focussound', id, 'DELETE', { id });
    return { id };
  }

  async updateFocusSoundPreference(userId: string, soundKey: string, input: { enabled?: boolean; sortOrder?: number; volume?: number }) {
    if (!soundKey.startsWith('builtin:')) {
      const sound = await this.repo.findFocusSoundById(userId, soundKey);
      if (!sound) throw new EntityNotFoundException('FocusSound', soundKey);
    }
    const preference = await this.repo.upsertFocusSoundPreference(userId, soundKey, input);
    await this.emitSyncChangeAndInvalidate(userId, 'focussoundpreference', preference.id, 'UPSERT', preference);
    return preference;
  }
}
