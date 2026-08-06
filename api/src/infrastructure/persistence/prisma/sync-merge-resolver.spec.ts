import { SyncMergeResolver } from './sync-merge-resolver';
import { SyncMutation } from '@core/application/ports/in/sync-use-case.port';

describe('SyncMergeResolver', () => {
  let resolver: SyncMergeResolver;

  beforeEach(() => {
    resolver = new SyncMergeResolver();
  });

  it('applies client mutation when no prior field clocks exist', () => {
    const mutation: SyncMutation = {
      id: 'mut-1',
      kind: 'task.update',
      entityId: 'task-1',
      payload: { title: 'New Title', priority: 'HIGH' },
      occurredAt: '2026-08-06T02:00:00.000Z',
    };

    const result = resolver.resolveMutationFields(mutation, 'task', [], null, 'device-a');

    expect(result.outcome.status).toBe('APPLIED');
    expect(result.outcome.appliedFields).toEqual(['title', 'priority']);
    expect(result.resolvedPayload).toEqual({ title: 'New Title', priority: 'HIGH' });
    expect(result.updatedClocks).toHaveLength(2);
  });

  it('wins LWW when client field timestamp is newer than server clock', () => {
    const mutation: SyncMutation = {
      id: 'mut-2',
      kind: 'task.update',
      entityId: 'task-1',
      payload: { title: 'Client Newer Title' },
      occurredAt: '2026-08-06T02:10:00.000Z',
      fieldEditedAt: { title: '2026-08-06T02:10:00.000Z' },
    };

    const existingClocks = [
      {
        fieldName: 'title',
        editedAt: new Date('2026-08-06T02:00:00.000Z'),
        deviceId: 'device-b',
        mutationId: 'mut-0',
      },
    ];

    const result = resolver.resolveMutationFields(mutation, 'task', existingClocks, { title: 'Server Title' }, 'device-a');

    expect(result.outcome.status).toBe('APPLIED');
    expect(result.outcome.appliedFields).toEqual(['title']);
    expect(result.resolvedPayload.title).toBe('Client Newer Title');
  });

  it('auto-merges when client title is newer but server dueAt is newer', () => {
    const mutation: SyncMutation = {
      id: 'mut-3',
      kind: 'task.update',
      entityId: 'task-1',
      payload: { title: 'Client Title', dueAt: '2026-08-10T00:00:00.000Z' },
      occurredAt: '2026-08-06T02:05:00.000Z',
      fieldEditedAt: {
        title: '2026-08-06T02:15:00.000Z', // Client newer
        dueAt: '2026-08-06T02:05:00.000Z', // Server newer
      },
    };

    const existingClocks = [
      {
        fieldName: 'title',
        editedAt: new Date('2026-08-06T02:00:00.000Z'),
        deviceId: 'device-b',
        mutationId: 'mut-0',
      },
      {
        fieldName: 'dueAt',
        editedAt: new Date('2026-08-06T02:10:00.000Z'),
        deviceId: 'device-b',
        mutationId: 'mut-0',
      },
    ];

    const serverData = { title: 'Server Title', dueAt: '2026-08-20T00:00:00.000Z' };

    const result = resolver.resolveMutationFields(mutation, 'task', existingClocks, serverData, 'device-a');

    expect(result.outcome.status).toBe('AUTO_MERGED');
    expect(result.outcome.appliedFields).toEqual(['title']);
    expect(result.outcome.serverWonFields).toEqual(['dueAt']);
    expect(result.resolvedPayload).toEqual({
      title: 'Client Title',
      dueAt: '2026-08-20T00:00:00.000Z',
    });
  });
});
