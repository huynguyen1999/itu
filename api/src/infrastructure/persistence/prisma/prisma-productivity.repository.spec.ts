import { PrismaProductivityRepository } from './prisma-productivity.repository';

describe('PrismaProductivityRepository', () => {
  it('lists tasks by created time and creation order descending by default', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PrismaProductivityRepository(
      {
        task: { findMany },
      } as never,
      {} as never,
    );

    await repository.listTasks('user-1');

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ createdAt: 'desc' }, { sortOrder: 'desc' }, { id: 'desc' }],
      }),
    );
  });
});
