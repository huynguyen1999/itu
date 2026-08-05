import { describe, expect, it } from 'vitest';
import { nextTaskStatus, taskStatusLabel } from './taskStatus';

describe('task status transitions', () => {
  it('cycles through the task workflow in order', () => {
    expect(nextTaskStatus('INBOX')).toBe('IN_PROGRESS');
    expect(nextTaskStatus('PLANNED')).toBe('IN_PROGRESS');
    expect(nextTaskStatus('IN_PROGRESS')).toBe('COMPLETED');
    expect(nextTaskStatus('COMPLETED')).toBe('PLANNED');
  });

  it('uses the performed transition status in user-facing labels', () => {
    expect(taskStatusLabel(nextTaskStatus('INBOX'))).toBe('In Progress');
    expect(taskStatusLabel(nextTaskStatus('IN_PROGRESS'))).toBe('Completed');
  });
});
