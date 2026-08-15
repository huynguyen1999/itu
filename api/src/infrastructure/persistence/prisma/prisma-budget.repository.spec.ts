import { PrismaBudgetRepository } from './prisma-budget.repository';

describe('PrismaBudgetRepository', () => {
  it('seeds the default expense categories when a reset account has none', async () => {
    const db = {
      expenseCategory: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn().mockResolvedValue({ count: 10 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new PrismaBudgetRepository(db as never);

    await repository.getCategories('user-1');

    expect(db.expenseCategory.createMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([
        expect.objectContaining({ name: 'Food', userId: 'user-1', sortOrder: 0 }),
        expect.objectContaining({ name: 'Other', userId: 'user-1', sortOrder: 9 }),
      ]),
      skipDuplicates: true,
    }));
  });

  it('does not reseed an account that already has expense categories', async () => {
    const db = {
      expenseCategory: {
        count: jest.fn().mockResolvedValue(1),
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const repository = new PrismaBudgetRepository(db as never);

    await repository.getCategories('user-1');

    expect(db.expenseCategory.createMany).not.toHaveBeenCalled();
  });

  it('returns current, previous, and daily aggregate values for a date range', async () => {
    const current = {
      id: 'expense-current', userId: 'user-1', amount: '12.50', categoryId: 'food',
      category: { name: 'Food' }, expenseDate: new Date('2026-08-02T00:00:00.000Z'),
    };
    const previous = {
      id: 'expense-previous', userId: 'user-1', amount: '4.00', categoryId: 'food',
      category: { name: 'Food' }, expenseDate: new Date('2026-07-31T00:00:00.000Z'),
    };
    const aggregate = jest.fn(({ where }: { where: { expenseDate: { gte: Date } } }) =>
      Promise.resolve(where.expenseDate.gte >= new Date('2026-08-01T00:00:00.000Z')
        ? { _sum: { amount: '12.50' }, _count: { _all: 1 } }
        : { _sum: { amount: '4.00' }, _count: { _all: 1 } })
    );
    const groupBy = jest.fn(({ where }: { where: { expenseDate: { gte: Date } } }) =>
      Promise.resolve(where.expenseDate.gte >= new Date('2026-08-01T00:00:00.000Z')
        ? [{ expenseDate: current.expenseDate, _sum: { amount: '12.50' } }]
        : [])
    );
    const repository = new PrismaBudgetRepository({ expense: { aggregate, groupBy } } as never);

    await expect(repository.getStatistics(
      'user-1',
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-08-04T00:00:00.000Z'),
    )).resolves.toEqual({
      from: '2026-08-01',
      to: '2026-08-03',
      spent: '12.50',
      expenseCount: 1,
      previousSpent: '4.00',
      changeAmount: '8.50',
      trend: [{ date: '2026-08-02', amount: '12.50' }],
    });
    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(groupBy).toHaveBeenCalledTimes(2);
  });
});
