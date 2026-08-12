import { describe, expect, it } from 'vitest';
import {
  createReminderDraft,
  queueReminderRemove,
  queueReminderUpdate,
  type PendingReminderChange,
} from './taskReminderDraft';

describe('task reminder draft changes', () => {
  it('keeps add, update, and remove changes pending until the task is saved', () => {
    const input = { type: 'ABSOLUTE' as const, remindAt: '2026-08-12T09:00:00.000Z' };
    const draft = createReminderDraft('draft-1', input, '2026-08-12T09:00:00.000Z');
    let changes: PendingReminderChange[] = [{ kind: 'create', draftId: draft.id, input }];

    changes = queueReminderUpdate(changes, draft.id, '2026-08-12T10:00:00.000Z');
    expect(changes).toEqual([
      {
        kind: 'create',
        draftId: 'draft-1',
        input: { type: 'ABSOLUTE', remindAt: '2026-08-12T10:00:00.000Z' },
      },
    ]);

    changes = queueReminderRemove(changes, draft.id);
    expect(changes).toEqual([]);
  });

  it('replaces an existing reminder update with a remove', () => {
    const changes: PendingReminderChange[] = [
      { kind: 'update', id: 'reminder-1', remindAt: '2026-08-12T10:00:00.000Z' },
    ];

    expect(queueReminderRemove(changes, 'reminder-1')).toEqual([{ kind: 'remove', id: 'reminder-1' }]);
  });
});
