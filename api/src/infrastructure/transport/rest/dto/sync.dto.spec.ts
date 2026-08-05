import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PullSyncChangesDto, PushSyncMutationsDto, SyncRequestDto } from './sync.dto';

interface SyncContractFixture {
  version: number;
  queuedMutation: Record<string, unknown>;
  pushRequest: Record<string, unknown>;
  pushResponse: Record<string, unknown>;
  pullResponse: Record<string, unknown>;
  invalidation: Record<string, unknown>;
}

const syncContract = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'fixtures/sync-contract-v1.json'), 'utf8'),
) as SyncContractFixture;

describe('SyncRequestDto', () => {
  it('accepts mutation base values used for field-level conflict detection', async () => {
    const dto = plainToInstance(SyncRequestDto, {
      deviceId: 'device-123456',
      clientInstanceId: 'client-123456',
      mutations: [
        {
          id: 'mutation-123456',
          kind: 'task.update',
          entityId: 'entity-123456',
          baseVersion: 1,
          baseValues: { title: 'Original title' },
          payload: { title: 'Updated title' },
          occurredAt: '2026-07-25T10:00:00.000Z',
        },
      ],
    });

    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([]);
  });
});

describe('split sync DTOs', () => {
  it('accepts the canonical cross-client push fixture without local retry metadata', async () => {
    const dto = plainToInstance(PushSyncMutationsDto, syncContract.pushRequest);

    expect(syncContract.version).toBe(1);
    expect(syncContract.queuedMutation).toMatchObject({ attemptCount: 2, lastErrorCode: 'SERVER' });
    expect(syncContract.pushRequest).not.toHaveProperty('mutations.0.attemptCount');
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it('accepts a mutation-only upload without a download cursor', async () => {
    const dto = plainToInstance(PushSyncMutationsDto, {
      deviceId: 'device-123456',
      clientInstanceId: 'client-123456',
      mutations: [],
    });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });

  it('accepts a cursor-only change request for a registered device', async () => {
    const dto = plainToInstance(PullSyncChangesDto, {
      deviceId: 'device-123456',
      cursor: '42',
    });
    expect(await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
  });
});
