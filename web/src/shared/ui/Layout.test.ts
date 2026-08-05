import { describe, expect, it } from 'vitest';
import {
  getWorkspaceNavigationDropPosition,
  getSyncStatusLabel,
  orderWorkspaceNavigation,
  pendingMutationErrorLabel,
  pendingMutationLabel,
  reorderWorkspaceNavigation,
  workspaceNavigation,
} from './Layout';

describe('workspace navigation', () => {
  it('exposes the centralized statistics destination', () => {
    expect(workspaceNavigation).toEqual(
      expect.arrayContaining([expect.objectContaining({ to: '/statistics', label: 'Statistics' })]),
    );
  });

  it('restores a saved manual order and appends new destinations', () => {
    const ordered = orderWorkspaceNavigation(workspaceNavigation, ['/learn', '/plan', '/missing']);

    expect(ordered.map((item) => item.to).slice(0, 2)).toEqual(['/learn', '/plan']);
    expect(ordered.map((item) => item.to)).toEqual(expect.arrayContaining(['/statistics', '/trash']));
    expect(ordered).toHaveLength(workspaceNavigation.length);
  });

  it('moves a dragged destination before the drop target', () => {
    const ordered = reorderWorkspaceNavigation(workspaceNavigation, '/learn', '/plan');

    expect(ordered.map((item) => item.to).slice(0, 3)).toEqual(['/', '/learn', '/plan']);
    expect(ordered).toHaveLength(workspaceNavigation.length);
  });

  it('moves a dragged destination downward before the drop target', () => {
    const ordered = reorderWorkspaceNavigation(workspaceNavigation, '/plan', '/learn');

    expect(ordered.map((item) => item.to).slice(5, 8)).toEqual(['/growth', '/plan', '/learn']);
    expect(ordered).toHaveLength(workspaceNavigation.length);
  });

  it('moves a dragged destination after the bottom drop target', () => {
    const ordered = reorderWorkspaceNavigation(workspaceNavigation, '/plan', '/trash', 'after');

    expect(ordered.at(-1)?.to).toBe('/plan');
    expect(ordered).toHaveLength(workspaceNavigation.length);
  });

  it('uses the hovered row half to choose before or after placement', () => {
    const bounds = { top: 100, height: 40 };

    expect(getWorkspaceNavigationDropPosition(bounds, 110)).toBe('before');
    expect(getWorkspaceNavigationDropPosition(bounds, 130)).toBe('after');
  });
});

describe('sync status labels', () => {
  it('describes pending online and offline changes', () => {
    expect(getSyncStatusLabel({ phase: 'pending', pendingCount: 1, conflictCount: 0 })).toBe('1 change pending');
    expect(getSyncStatusLabel({ phase: 'offline', pendingCount: 1, conflictCount: 0 })).toBe(
      'Offline - 1 change pending',
    );
    expect(getSyncStatusLabel({ phase: 'offline', pendingCount: 2, conflictCount: 0 })).toBe(
      'Offline - 2 changes pending',
    );
  });

  it('reports syncing, conflicts, and an empty outbox', () => {
    expect(getSyncStatusLabel({ phase: 'syncing', pendingCount: 1, conflictCount: 0 })).toBe('Syncing');
    expect(getSyncStatusLabel({ phase: 'conflict', pendingCount: 1, conflictCount: 2 })).toBe('2 sync conflicts');
    expect(getSyncStatusLabel({ phase: 'up-to-date', pendingCount: 0, conflictCount: 0 })).toBe('Up to date');
  });
});

describe('pending change reconciliation labels', () => {
  const mutation = {
    id: 'mutation-1',
    kind: 'task.update',
    entityId: 'task-123456789',
    payload: { title: 'Plan the week' },
    occurredAt: '2026-07-28T00:00:00.000Z',
  };

  it('describes the affected item and operation', () => {
    expect(pendingMutationLabel(mutation)).toBe('Update “Plan the week”');
  });

  it('explains permanent client failures', () => {
    expect(pendingMutationErrorLabel({ ...mutation, lastErrorCode: 'CLIENT' })).toContain(
      'Choose Keep local or Use server',
    );
  });
});
