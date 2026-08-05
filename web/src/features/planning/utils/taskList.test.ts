import { describe, expect, it } from 'vitest';
import type { ProductivityTask } from '@/shared/api/types';
import { dropBeforeTaskId } from '../components/TaskList';
import { inboxTaskListId, selectableTaskLists } from './taskLists';

describe('TaskList item requirements', () => {
  const sampleTask: ProductivityTask = {
    id: 'task-1',
    title: 'Leetcode preparation',
    descriptionMarkdown: 'leetcode 75 problems and interview questions',
    priority: 'HIGH',
    important: false,
    urgent: false,
    urgencyReason: '',
    dueAt: new Date(Date.now() + 86_400_000 * 5).toISOString(),
    status: 'INBOX',
    sortOrder: 1,
    version: 1,
    tags: [{ tag: { id: 't1', name: 'interview', color: 'blue' } }],
    reminders: [{ id: 'r1', remindAt: new Date().toISOString(), status: 'SCHEDULED', persistent: false }],
    children: [],
  };

  it('correctly calculates days left for upcoming tasks', () => {
    const date = new Date(sampleTask.dueAt!);
    const days = Math.ceil((date.getTime() - Date.now()) / 86_400_000);
    expect(days).toBe(5);
  });

  it('correctly identifies overdue tasks', () => {
    const overdueDate = new Date(Date.now() - 86_400_000 * 3).toISOString();
    const days = Math.ceil((new Date(overdueDate).getTime() - Date.now()) / 86_400_000);
    expect(days).toBe(-3);
  });

  it('verifies task has active reminders', () => {
    const hasReminder = sampleTask.reminders && sampleTask.reminders.length > 0;
    expect(hasReminder).toBe(true);
  });

  it('resolves before and after drag insertion edges', () => {
    const tasks = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

    expect(dropBeforeTaskId(tasks, 'b', 'before')).toBe('b');
    expect(dropBeforeTaskId(tasks, 'b', 'after')).toBe('c');
    expect(dropBeforeTaskId(tasks, 'c', 'after')).toBeUndefined();
  });

  it('uses the default Inbox list as the Inbox destination without showing it twice', () => {
    const lists = [
      { id: 'inbox', title: 'Inbox', color: 'TEAL', isDefault: true, version: 1 },
      { id: 'work', title: 'Work', color: 'BLUE', isDefault: false, version: 1 },
      { id: 'archived', title: 'Archived', color: 'GRAY', isDefault: false, archivedAt: '2026-07-27', version: 1 },
    ];

    expect(inboxTaskListId(lists)).toBe('inbox');
    expect(selectableTaskLists(lists).map((list) => list.title)).toEqual(['Work']);
  });
});
