import { PrismaSyncRepository } from './prisma-sync.repository';

describe('PrismaSyncRepository commitments', () => {
  it('preserves enabled on a partial policy mutation', async () => {
    const current = { id: 'policy-1', habitId: 'habit-1', userId: 'user-1', enabled: true, version: 1, effectiveFrom: new Date('2026-01-01T00:00:00.000Z') };
    const upsert = jest.fn().mockResolvedValue({ ...current, version: 2 });
    const tx: any = {
      habit: { findFirst: jest.fn().mockResolvedValue({ id: 'habit-1', timezone: 'UTC' }) },
      habitCommitmentPolicy: { findUnique: jest.fn().mockResolvedValue(current), update: jest.fn().mockResolvedValue(current), upsert },
      syncChange: { create: jest.fn() },
    };
    const repository = new PrismaSyncRepository({} as never, {} as never);
    const previousFlag = process.env.COMMITMENT_FEATURE_ENABLED;
    process.env.COMMITMENT_FEATURE_ENABLED = 'true';
    try {
      await (repository as any).applyMutation(tx, 'user-1', {
        id: 'mutation-1', kind: 'habit.commitment-policy', entityId: 'habit-1', payload: {
          level: 'GENTLE', expectedAccountXp: 10, graceMinutes: 5, recoveryWindowMinutes: 10,
          effectiveFrom: '2026-01-02T00:00:00.000Z',
        }, occurredAt: '2026-01-02T00:00:00.000Z',
      }, {});
      expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ enabled: true }), update: expect.objectContaining({ enabled: true }) }));
    } finally {
      if (previousFlag === undefined) delete process.env.COMMITMENT_FEATURE_ENABLED;
      else process.env.COMMITMENT_FEATURE_ENABLED = previousFlag;
    }
  });
});
