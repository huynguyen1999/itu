import { createUlid } from '../sync/syncIdentity';
import type { ApiClientContext } from './apiContext';
import type {
  FocusMutationResponse,
  FocusPreset,
  FocusSession,
  FocusSound,
  FocusSoundPreference,
  Habit,
  HabitMutationResponse,
  HabitOccurrence,
  HabitStats,
  HabitTimeBlock,
} from './types';

export function createFocusProductivityApi(ctx: ApiClientContext) {
  return {
    focusPresets() {
      return ctx.request<FocusPreset[]>('/productivity/focus-presets');
    },
    createFocusPreset(data: Omit<FocusPreset, 'id' | 'isDefault'>) {
      return ctx.request<FocusPreset>('/productivity/focus-presets', { method: 'POST', body: JSON.stringify(data) });
    },
    activeFocus() {
      return ctx.request<FocusSession | null>('/productivity/focus-sessions/active');
    },
    focusHistory() {
      return ctx.request<FocusSession[]>('/productivity/focus-sessions/history');
    },
    focusSummary() {
      return ctx.request<{ completedSessions: number; abandonedSessions: number; focusedSeconds: number }>(
        '/productivity/focus-sessions/summary',
      );
    },
    focusSounds() {
      return ctx.request<{ sounds: FocusSound[]; preferences: FocusSoundPreference[] }>('/productivity/focus-sounds');
    },
    uploadFocusSound(name: string, file: File) {
      const form = new FormData();
      form.set('name', name);
      form.set('audio', file);
      return ctx.request<FocusSound>('/productivity/focus-sounds', { method: 'POST', body: form });
    },
    updateFocusSound(id: string, data: Pick<FocusSound, 'name'>) {
      return ctx.request<FocusSound>(`/productivity/focus-sounds/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    deleteFocusSound(id: string) {
      return ctx.request<{ id: string }>(`/productivity/focus-sounds/${id}`, { method: 'DELETE' });
    },
    updateFocusSoundPreference(
      soundKey: string,
      data: Partial<Pick<FocusSoundPreference, 'enabled' | 'sortOrder' | 'volume'>>,
    ) {
      return ctx.request<FocusSoundPreference>(
        `/productivity/focus-sounds/${encodeURIComponent(soundKey)}/preferences`,
        { method: 'PATCH', body: JSON.stringify(data) },
      );
    },
    startFocus(
      data: {
        taskId?: string;
        customTitle?: string;
        mode: 'COUNTDOWN' | 'STOPWATCH';
        presetId?: string;
        plannedSeconds?: number;
        ownerDeviceId?: string;
        idempotencyKey: string;
      },
      optimistic?: FocusSession,
    ) {
      if (optimistic) {
        return ctx.offlineMutation<FocusMutationResponse>(
          {
            kind: 'focussession.create',
            entityId: optimistic.id,
            payload: { ...data, startedAt: optimistic.startedAt },
            immediate: true,
            optimistic,
          },
          () =>
            ctx.request<FocusMutationResponse>('/productivity/focus-sessions', {
              method: 'POST',
              body: JSON.stringify(data),
            }),
        );
      }
      return ctx.request<FocusMutationResponse>('/productivity/focus-sessions', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    focusAction(
      id: string,
      action: 'pause' | 'resume' | 'complete' | 'abandon' | 'extend' | 'takeover' | 'attach' | 'rename',
      data: {
        idempotencyKey: string;
        expectedVersion: number;
        category?: string;
        note?: string;
        extendSeconds?: number;
        ownerDeviceId?: string;
        reflection?: string;
        taskId?: string | null;
        customTitle?: string;
      },
      current: FocusSession,
    ) {
      const now = new Date().toISOString();
      const pauseSeconds =
        action === 'resume' && current.pausedAt
          ? Math.max(0, Math.floor((Date.now() - new Date(current.pausedAt).getTime()) / 1000))
          : 0;
      const optimistic: FocusSession = {
        ...current,
        status:
          action === 'pause'
            ? 'PAUSED'
            : action === 'resume'
              ? 'ACTIVE'
              : action === 'complete'
                ? 'COMPLETED'
                : action === 'abandon'
                  ? 'ABANDONED'
                  : current.status,
        pausedAt: action === 'pause' ? now : action === 'resume' ? null : current.pausedAt,
        completedAt: action === 'complete' || action === 'abandon' ? now : current.completedAt,
        accumulatedPauseSecs: current.accumulatedPauseSecs + pauseSeconds,
        plannedSeconds:
          action === 'extend' ? (current.plannedSeconds ?? 0) + (data.extendSeconds ?? 300) : current.plannedSeconds,
        taskId: action === 'attach' ? (data.taskId ?? null) : current.taskId,
        ownerDeviceId: action === 'takeover' ? data.ownerDeviceId : current.ownerDeviceId,
        customTitle: action === 'rename' ? (data.customTitle ?? null) : current.customTitle,
        reflection: data.reflection ?? current.reflection,
        version: current.version + 1,
      };
      return ctx.offlineMutation<FocusMutationResponse>(
        {
          kind: 'focussession.action',
          entityId: id,
          payload: { ...data, action, occurredAt: now },
          baseVersion: data.expectedVersion,
          immediate: true,
          optimistic,
        },
        () =>
          ctx.request<FocusMutationResponse>(`/productivity/focus-sessions/${id}/${action}`, {
            method: 'POST',
            body: JSON.stringify(data),
          }),
      );
    },
    adjustFocus(
      id: string,
      data: {
        startedAt: string;
        completedAt: string;
        taskId: string | null;
        idempotencyKey?: string;
        expectedVersion?: number;
      },
      current: FocusSession,
    ) {
      const idempotencyKey = data.idempotencyKey ?? createUlid();
      const expectedVersion = data.expectedVersion ?? current.version;
      const payload = { ...data, idempotencyKey, expectedVersion };
      const optimistic = {
        ...current,
        startedAt: data.startedAt,
        completedAt: data.completedAt,
        taskId: data.taskId,
        version: current.version + 1,
      };
      return ctx.offlineMutation<FocusMutationResponse>(
        {
          kind: 'focussession.adjust',
          entityId: id,
          payload,
          baseVersion: expectedVersion,
          optimistic,
        },
        () =>
          ctx.request<FocusMutationResponse>(`/productivity/focus-sessions/${id}/adjust`, {
            method: 'PATCH',
            body: JSON.stringify(payload),
          }),
      );
    },
    habits() {
      return ctx.request<Habit[]>('/productivity/habits');
    },
    createHabit(data: Record<string, unknown>) {
      const id = createUlid();
      return ctx.offlineMutation<Habit>(
        { kind: 'habit.create', entityId: id, payload: data, optimistic: optimisticHabit(id, data) },
        () => ctx.request<Habit>('/productivity/habits', { method: 'POST', body: JSON.stringify(data) }),
      );
    },
    updateHabit(id: string, data: Record<string, unknown>) {
      const optimistic = {
        id,
        ...data,
        ...(typeof data.archived === 'boolean' ? { archivedAt: data.archived ? new Date().toISOString() : null } : {}),
        ...(typeof data.version === 'number' ? { version: data.version + 1 } : {}),
      } as unknown as Habit;
      return ctx.offlineMutation<Habit>(
        {
          kind: 'habit.update',
          entityId: id,
          payload: data,
          baseVersion: typeof data.version === 'number' ? data.version : undefined,
          optimistic,
        },
        () => ctx.request<Habit>(`/productivity/habits/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
      );
    },
    habitOccurrences(from: string, to: string) {
      return ctx.request<HabitOccurrence[]>(
        `/productivity/habit-occurrences?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
    },
    checkInHabit(
      id: string,
      data: {
        value: number;
        note?: string;
        focusSessionId?: string;
        adjusted?: boolean;
        source?: 'MANUAL' | 'FOCUS_SESSION' | 'TASK_COMPLETION' | 'HEALTH' | 'SCREEN_TIME' | 'CALENDAR' | 'EXTERNAL';
        idempotencyKey: string;
      },
    ) {
      return ctx.offlineMutation<HabitMutationResponse>(
        {
          kind: 'habitoccurrence.checkin',
          entityId: id,
          payload: data,
          immediate: true,
          // A local check-in may be only part of a count/duration/quantity target;
          // leave completion authoritative until the server evaluates the target.
          optimistic: { id, status: 'PENDING' } as HabitMutationResponse,
        },
        () =>
          ctx.request<HabitMutationResponse>(`/productivity/habit-occurrences/${id}/check-in`, {
            method: 'POST',
            body: JSON.stringify(data),
          }),
      );
    },
    habitOccurrenceAction(id: string, action: 'skip' | 'fail' | 'undo', idempotencyKey = createUlid()) {
      const status = action === 'skip' ? 'SKIPPED' : action === 'fail' ? 'FAILED' : 'PENDING';
      return ctx.offlineMutation<HabitMutationResponse>(
        {
          kind: 'habitoccurrence.action',
          entityId: id,
          payload: { action, idempotencyKey },
          immediate: true,
          optimistic: { id, status } as HabitMutationResponse,
        },
        () =>
          ctx.request<HabitMutationResponse>(`/productivity/habit-occurrences/${id}/${action}`, {
            method: 'POST',
            body: JSON.stringify({ idempotencyKey }),
          }),
      );
    },
    setHabitChecklistItem(occurrenceId: string, itemId: string, completed: boolean) {
      return ctx.offlineMutation(
        {
          kind: 'habitoccurrence.checklist',
          entityId: itemId,
          payload: { occurrenceId, completed },
          immediate: true,
          optimistic: { id: itemId, completedAt: completed ? new Date().toISOString() : null },
        },
        () =>
          ctx.request(`/productivity/habit-occurrences/${occurrenceId}/checklist/${itemId}`, {
            method: 'PATCH',
            body: JSON.stringify({ completed }),
          }),
      );
    },
    habitTimeBlocks() {
      return ctx.request<HabitTimeBlock[]>('/productivity/habit-time-blocks');
    },
    createHabitTimeBlock(data: Omit<HabitTimeBlock, 'id' | 'sortOrder'>) {
      return ctx.request<HabitTimeBlock>('/productivity/habit-time-blocks', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    habitStats(id: string) {
      return ctx.request<HabitStats>(`/productivity/habits/${id}/stats`);
    },
  };
}

export type FocusProductivityApi = ReturnType<typeof createFocusProductivityApi>;

function optimisticHabit(id: string, data: Record<string, unknown>): Habit {
  return {
    id,
    name: String(data.name ?? ''),
    description: String(data.description ?? ''),
    icon: String(data.icon ?? 'CHECK'),
    color: String(data.color ?? 'EMERALD'),
    targetType: (data.targetType ?? 'BOOLEAN') as Habit['targetType'],
    targetValue: Number(data.targetValue ?? 1),
    unit: typeof data.unit === 'string' ? data.unit : null,
    direction: (data.direction ?? 'BUILD') as Habit['direction'],
    timezone: String(data.timezone ?? 'UTC'),
    timeBlockId: typeof data.timeBlockId === 'string' ? data.timeBlockId : null,
    timeBlock: null,
    scheduleType: (data.scheduleType ?? 'WEEKDAYS') as Habit['scheduleType'],
    weekdays: Array.isArray(data.weekdays) ? (data.weekdays as number[]) : [],
    intervalDays: typeof data.intervalDays === 'number' ? data.intervalDays : null,
    timesPerPeriod: typeof data.timesPerPeriod === 'number' ? data.timesPerPeriod : null,
    period: typeof data.period === 'string' ? data.period : null,
    startDate: String(data.startDate ?? new Date().toISOString()),
    endDate: typeof data.endDate === 'string' ? data.endDate : null,
    difficulty: Number(data.difficulty ?? 1),
    allowedSkips: Number(data.allowedSkips ?? 0),
    restDays: Array.isArray(data.restDays) ? (data.restDays as number[]) : [],
    taskTemplateId: null,
    focusPresetId: null,
    archivedAt: null,
    version: 1,
    tags: [],
    reminders: [],
    checklistItems: [],
  };
}
