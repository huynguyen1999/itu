import type { TaskReminder } from '@/shared/api/types';

export type ReminderCreateInput = {
  type: 'ABSOLUTE' | 'RELATIVE';
  remindAt?: string;
  relativeTo?: 'DUE_AT' | 'SCHEDULE_START_AT';
  calendarDayOffset?: number;
  timeOfDayMinutes?: number;
  timeZone?: string;
};

export type PendingReminderChange =
  | { kind: 'create'; draftId: string; input: ReminderCreateInput }
  | { kind: 'update'; id: string; remindAt: string }
  | { kind: 'remove'; id: string };

export function createReminderDraft(id: string, input: ReminderCreateInput, fallbackRemindAt: string): TaskReminder {
  return {
    id,
    remindAt: input.remindAt ?? fallbackRemindAt,
    type: input.type,
    relativeTo: input.relativeTo ?? null,
    calendarDayOffset: input.calendarDayOffset ?? null,
    timeOfDayMinutes: input.timeOfDayMinutes ?? null,
    timeZone: input.timeZone ?? null,
    status: 'SCHEDULED',
    persistent: false,
  };
}

export function queueReminderUpdate(changes: PendingReminderChange[], id: string, remindAt: string) {
  const create = changes.find((change) => change.kind === 'create' && change.draftId === id);
  if (create?.kind === 'create') {
    return changes.map((change) =>
      change === create
        ? { kind: 'create' as const, draftId: id, input: { type: 'ABSOLUTE' as const, remindAt } }
        : change,
    );
  }

  const existing = changes.some((change) => change.kind === 'update' && change.id === id);
  if (existing)
    return changes.map((change) => (change.kind === 'update' && change.id === id ? { ...change, remindAt } : change));
  return [...changes, { kind: 'update' as const, id, remindAt }];
}

export function queueReminderRemove(changes: PendingReminderChange[], id: string) {
  if (changes.some((change) => change.kind === 'create' && change.draftId === id)) {
    return changes.filter((change) => !(change.kind === 'create' && change.draftId === id));
  }

  return [
    ...changes.filter((change) => !((change.kind === 'update' || change.kind === 'remove') && change.id === id)),
    { kind: 'remove' as const, id },
  ];
}
