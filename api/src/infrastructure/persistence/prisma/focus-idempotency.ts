import { FocusMode, FocusPhase } from '@prisma/client';
import { isDeepStrictEqual } from 'node:util';

export const focusPayloadsEqual = (stored: unknown, incoming: unknown) =>
  isDeepStrictEqual(stored, incoming);

export function focusStartSemanticPayload(data: any) {
  return {
    action: 'start',
    taskId: data.taskId ?? null,
    mode: data.mode ?? FocusMode.COUNTDOWN,
    phase: data.phase ?? FocusPhase.WORK,
    presetId: data.presetId ?? null,
    policyId: data.policyId ?? null,
    ownerDeviceId: data.ownerDeviceId ?? null,
    plannedSeconds: data.plannedSeconds ?? null,
  };
}

export function focusActionSemanticPayload(action: string, data: any = {}) {
  return {
    action,
    category: data.category ?? null,
    note: data.note ?? null,
    extendSeconds: data.extendSeconds ?? null,
    ownerDeviceId: data.ownerDeviceId ?? null,
    reflection: data.reflection ?? null,
    taskId: data.taskId ?? null,
    customTitle: data.customTitle ?? null,
  };
}

export function focusAdjustSemanticPayload(startedAt?: string, completedAt?: string, taskId?: string) {
  return {
    action: 'adjust',
    startedAt: startedAt ?? null,
    completedAt: completedAt ?? null,
    taskId: taskId ?? null,
  };
}
