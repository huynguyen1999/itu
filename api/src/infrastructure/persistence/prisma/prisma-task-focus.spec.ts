import { completeFocusedTaskSession } from './prisma-task-focus';

describe('completeFocusedTaskSession', () => {
  const completedAt = new Date('2026-08-14T10:00:00.000Z');

  function makeTx() {
    let session: any = {
      id: 'focus-1',
      userId: 'user-1',
      taskId: 'task-1',
      phase: 'WORK',
      status: 'ACTIVE',
      presetId: null,
      startedAt: new Date('2026-08-14T09:00:00.000Z'),
      completedAt: null,
      adjustedStartedAt: null,
      adjustedCompletedAt: null,
      accumulatedPauseSecs: 0,
      version: 3,
    };
    const update = jest.fn().mockImplementation(async ({ data }: { data: any }) => {
      session = { ...session, ...data, version: session.version + 1 };
      return session;
    });
    return {
      focusSession: {
        findFirst: jest.fn().mockImplementation(async ({ where }: { where: { taskId: string } }) =>
          session.status === 'ACTIVE' && where.taskId === session.taskId ? session : null),
        update,
      },
      syncChange: { create: jest.fn().mockResolvedValue(undefined) },
    } as any;
  }

  it('completes only the matching active WORK session and records its sync change', async () => {
    const tx = makeTx();

    const result = await completeFocusedTaskSession(tx, 'user-1', 'task-1', completedAt);

    expect(result?.session.status).toBe('COMPLETED');
    expect(tx.focusSession.update).toHaveBeenCalledWith({
      where: { id: 'focus-1' },
      data: { status: 'COMPLETED', completedAt, version: { increment: 1 } },
    });
    expect(tx.syncChange.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entityType: 'focussession', entityId: 'focus-1', operation: 'UPSERT' }),
      }),
    );
  });

  it('does not complete an unrelated or already completed session', async () => {
    const tx = makeTx();

    await expect(completeFocusedTaskSession(tx, 'user-1', 'other-task', completedAt)).resolves.toBeNull();
    await completeFocusedTaskSession(tx, 'user-1', 'task-1', completedAt);
    await expect(completeFocusedTaskSession(tx, 'user-1', 'task-1', completedAt)).resolves.toBeNull();

    expect(tx.focusSession.update).toHaveBeenCalledTimes(1);
  });
});
