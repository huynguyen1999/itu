import { PreferencesService } from './preferences.service';

describe('PreferencesService', () => {
  it('defaults gym showRpe to false', async () => {
    const prisma = {
      userPreferences: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as any;

    await expect(new PreferencesService(prisma).getPreferences('user-1')).resolves.toMatchObject({
      gym: { showRpe: false },
    });
  });

  it('merges and validates calendar preferences', async () => {
    const prisma = {
      userPreferences: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    } as any;

    await expect(new PreferencesService(prisma).updateCalendarPreferences('user-1', {
      zoom: 'DAY',
      showCompleted: false,
      collapsedGroupIds: ['tasks', 'tasks'],
    })).resolves.toMatchObject({ zoom: 'DAY', showCompleted: false, collapsedGroupIds: ['tasks'] });
    await expect(new PreferencesService(prisma).updateCalendarPreferences('user-1', {
      visibleKinds: ['INVALID' as never],
    })).rejects.toThrow('visibleKinds');
  });

  it('validates the default task due time', async () => {
    const prisma = {
      userPreferences: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
      },
    } as any;

    await expect(new PreferencesService(prisma).updateTaskPreferences('user-1', { defaultDueTime: '25:00' }))
      .rejects.toThrow('defaultDueTime');
  });
});
