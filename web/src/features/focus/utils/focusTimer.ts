import type { FocusSession } from '@/shared/api/types';

export function createOptimisticFocusSession(input: {
  id: string;
  taskId?: string;
  taskTitleSnapshot?: string;
  customTitle?: string;
  phase?: 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK';
  plannedSeconds: number;
  startedAt: string;
}): FocusSession {
  return {
    id: input.id,
    taskId: input.taskId,
    mode: 'COUNTDOWN',
    phase: input.phase ?? 'WORK',
    status: 'ACTIVE',
    plannedSeconds: input.plannedSeconds,
    accumulatedPauseSecs: 0,
    cycle: 1,
    taskTitleSnapshot: input.taskTitleSnapshot,
    customTitle: input.customTitle,
    tagNamesSnapshot: [],
    startedAt: input.startedAt,
    ownerDeviceId: 'web',
    version: 1,
  };
}

export function focusElapsedSeconds(session: FocusSession, now = Date.now()) {
  const end = session.pausedAt ? new Date(session.pausedAt).getTime() : now;
  return Math.max(0, Math.floor((end - new Date(session.startedAt).getTime()) / 1000) - session.accumulatedPauseSecs);
}

export function focusDisplaySeconds(session: FocusSession, allowOvertime = false, now = Date.now()) {
  const elapsed = focusElapsedSeconds(session, now);
  if (session.mode === 'COUNTDOWN') {
    const diff = (session.plannedSeconds ?? 0) - elapsed;
    if (session.phase === 'WORK') {
      return allowOvertime ? diff : Math.max(0, diff);
    }
    return Math.max(0, diff);
  }
  return elapsed;
}

/** Whole valid focus minutes used by authoritative reward calculations. */
export function validFocusMinutes(session: FocusSession) {
  const startedAt = new Date(session.adjustedStartedAt ?? session.startedAt).getTime();
  const completedAt = session.adjustedCompletedAt ?? session.completedAt;
  if (!completedAt) return 0;
  const elapsedSeconds = Math.floor((new Date(completedAt).getTime() - startedAt) / 1000);
  return Math.max(0, Math.floor((elapsedSeconds - Math.max(0, session.accumulatedPauseSecs ?? 0)) / 60));
}

/** Mirrors the server's capped account-XP rule; never used as an authoritative balance. */
export function focusAccountXpForMinutes(minutes: number) {
  const validMinutes = Math.max(0, Math.trunc(minutes));
  return validMinutes < 5 ? 0 : Math.min(15, Math.floor(validMinutes / 5));
}

export function formatFocusTime(seconds: number) {
  if (seconds < 0) {
    const abs = Math.abs(seconds);
    const mins = Math.floor(abs / 60);
    const secs = abs % 60;
    return `+${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function parseDurationInput(input: string, fallback: number): number {
  const trimmed = input.trim();
  if (!trimmed) return fallback;
  if (trimmed.includes(':')) {
    const parts = trimmed.split(':');
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseInt(parts[1], 10) || 0;
    const totalMins = Math.round(mins + secs / 60);
    return Math.max(1, Math.min(180, totalMins || fallback));
  }
  const parsed = parseInt(trimmed, 10);
  if (isNaN(parsed)) return fallback;
  return Math.max(1, Math.min(180, parsed));
}
