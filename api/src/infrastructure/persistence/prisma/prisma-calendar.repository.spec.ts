import { PrismaCalendarRepository } from './prisma-calendar.repository';

describe('PrismaCalendarRepository', () => {
  it('loads only overlapping visible external events for the user', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PrismaCalendarRepository({ externalCalendarEvent: { findMany } } as any);
    const from = new Date('2026-08-12T00:00:00.000Z');
    const to = new Date('2026-08-13T00:00:00.000Z');
    await repository.listVisibleEvents('user-1', from, to);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-1', calendar: { visible: true }, startAt: { lt: to }, OR: [{ endAt: null }, { endAt: { gt: from } }] } }));
  });
});
