import { describe, expect, it } from 'vitest';
import {
  getSyncStatusLabel,
  isNavigationEntryActive,
  pendingMutationErrorLabel,
  pendingMutationLabel,
  workspaceNavigationGroups,
  workspaceNavigation,
} from './Layout';

describe('workspace navigation', () => {
  it('exposes the canonical groups, stable IDs, order, and routes', () => {
    expect(workspaceNavigationGroups.map(({ id, title }) => ({ id, title }))).toEqual([
      { id: 'productivity', title: 'Productivity' },
      { id: 'tracking', title: 'Tracking' },
      { id: 'knowledge', title: 'Knowledge' },
      { id: 'system', title: 'System' },
    ]);
    expect(workspaceNavigationGroups.map((group) => group.entries.map(({ id, to }) => ({ id, to })))).toEqual([
      [
        { id: 'home', to: '/' },
        { id: 'plan', to: '/plan' },
        { id: 'matrix', to: '/matrix' },
        { id: 'focus', to: '/focus' },
      ],
      [
        { id: 'habits', to: '/habits' },
        { id: 'statistics', to: '/statistics' },
        { id: 'budget', to: '/budget' },
        { id: 'gym', to: '/gym' },
      ],
      [
        { id: 'journal', to: '/journal' },
        { id: 'learn', to: '/learn' },
        { id: 'growth', to: '/growth' },
      ],
      [
        { id: 'conflicts', to: '/conflicts' },
        { id: 'notifications', to: '/notifications' },
        { id: 'trash', to: '/trash' },
        { id: 'profile', to: '/profile' },
        { id: 'settings', to: '/settings' },
      ],
    ]);
    expect(workspaceNavigation).toHaveLength(16);
    expect(workspaceNavigation.slice(0, 5).map((entry) => entry.id)).toEqual([
      'home',
      'plan',
      'matrix',
      'focus',
      'habits',
    ]);
  });

  it('keeps Plan active across every planning destination', () => {
    for (const pathname of ['/plan', '/plan/today', '/inbox', '/today', '/upcoming', '/completed']) {
      expect(isNavigationEntryActive('plan', pathname)).toBe(true);
    }
    expect(isNavigationEntryActive('plan', '/planets')).toBe(false);
    expect(isNavigationEntryActive('home', '/plan')).toBe(false);
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
