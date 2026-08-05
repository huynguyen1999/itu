import { PrismaStudySessionRepository } from './prisma-study.repository';

describe('PrismaStudySessionRepository', () => {
  it('replays a completed session with its persisted growth receipt', async () => {
    const receipt = {
      sourceType: 'REVIEW_DECK',
      sourceId: 'session-1',
      title: 'Study Session',
      progressAwards: [],
      accountAward: { amount: 5, beforeXp: 10, afterXp: 15, beforeLevel: 1, afterLevel: 1, nextLevelXp: 100 },
      coinAward: null,
      itemAwards: [],
    };
    const session = {
      id: 'session-1', userId: 'user-1', deckId: 'deck-1', mode: 'DUE', rating: 8,
      startedAt: new Date('2026-01-01T00:00:00Z'), completedAt: new Date('2026-01-01T00:01:00Z'),
      reviewed: 1, correct: 1, growthReceipt: receipt,
    };
    const db = {
      $transaction: jest.fn().mockImplementation(async (callback: (tx: typeof db) => unknown) => callback(db)),
      studySession: { findFirst: jest.fn().mockResolvedValue(session), update: jest.fn() },
      growthLedgerEntry: { create: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    };
    const repository = new PrismaStudySessionRepository(db as never);

    const replay = await repository.complete('user-1', 'session-1', { rating: 8 });

    expect(replay?.growthReceipt).toEqual(receipt);
    expect(db.studySession.update).not.toHaveBeenCalled();
    expect(db.growthLedgerEntry.create).not.toHaveBeenCalled();
  });

  it('retries study completion after a P2034 conflict', async () => {
    const session = { id: 'session-1', userId: 'user-1', completedAt: new Date(), growthReceipt: null };
    const tx: any = { studySession: { findFirst: jest.fn().mockResolvedValue(session) } };
    const transaction = jest.fn().mockRejectedValueOnce({ code: 'P2034' }).mockImplementation(async (cb: any) => cb(tx));
    const repository = new PrismaStudySessionRepository({ $transaction: transaction } as never);
    await expect(repository.complete('user-1', 'session-1', { rating: 8 })).resolves.toEqual(expect.objectContaining({ id: 'session-1' }));
    expect(transaction).toHaveBeenCalledTimes(2);
  });
});
