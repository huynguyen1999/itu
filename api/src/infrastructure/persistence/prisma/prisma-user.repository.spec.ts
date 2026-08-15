import { ensureStarterSkills } from '@core/application/use-cases/ensure-starter-skills';
import { PrismaUserRepository } from './prisma-user.repository';

jest.mock('@core/application/use-cases/ensure-starter-skills', () => ({
  ensureStarterSkills: jest.fn().mockResolvedValue(undefined),
}));

const createdAt = new Date('2026-07-29T00:00:00.000Z');

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    email: 'demo@example.com',
    username: null,
    displayName: 'Demo User',
    passwordHash: null,
    createdAt,
    updatedAt: createdAt,
    deletionRequestedAt: null,
    deletionScheduledFor: null,
    deletedAt: null,
    bannedAt: null,
    ...overrides,
  };
}

describe('PrismaUserRepository', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates starter content when a password user is created', async () => {
    const createdUser = user();
    const tx = {
      user: { create: jest.fn().mockResolvedValue(createdUser) },
      deck: { create: jest.fn().mockResolvedValue({}) },
      taskList: { create: jest.fn().mockResolvedValue({ id: 'task-list-1' }) },
      task: { createMany: jest.fn().mockResolvedValue({ count: 4 }) },
      growthCycle: { create: jest.fn().mockResolvedValue({ id: 'cycle-1' }) },
      growthProfile: { create: jest.fn().mockResolvedValue({}) },
      expenseCategory: { createMany: jest.fn().mockResolvedValue({ count: 8 }) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repository = new PrismaUserRepository(prisma as never);

    await repository.create({ email: 'demo@example.com', displayName: 'Demo User', passwordHash: 'hash' });

    expect(tx.deck.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', title: 'Inbox', isDefault: true }),
    });
    expect(tx.taskList.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', title: 'Inbox', isDefault: true }),
    });
    expect(tx.task.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ taskListId: 'task-list-1', title: 'Create a new task' }),
        expect.objectContaining({ taskListId: 'task-list-1', title: 'Try more task actions' }),
        expect.objectContaining({ taskListId: 'task-list-1', title: 'Explore the task details page' }),
        expect.objectContaining({ taskListId: 'task-list-1', title: 'Complete your first task' }),
      ],
    });
    expect(tx.growthProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', activeCycleId: 'cycle-1', onboardingState: 'COMPLETED' }),
    });
    expect(ensureStarterSkills).toHaveBeenCalledWith(tx, 'user-1', 'cycle-1');
  });

  it('does not duplicate starter content when Google is linked to an existing user', async () => {
    const existingUser = user();
    const tx = {
      oAuthIdentity: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      oAuthIdentity: { findUnique: jest.fn().mockResolvedValue(null) },
      user: { findUnique: jest.fn().mockResolvedValue(existingUser) },
      $transaction: jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const repository = new PrismaUserRepository(prisma as never);

    await repository.upsertGoogleUser({
      email: 'demo@example.com',
      displayName: 'Demo User',
      providerUserId: 'google-1',
    });

    expect(ensureStarterSkills).not.toHaveBeenCalled();
    expect(tx.oAuthIdentity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'user-1', provider: 'GOOGLE', providerUserId: 'google-1' }),
    });
  });
});
