import { PreferencesService } from './preferences.service';

describe('PreferencesService', () => {
  const repository = () => ({
    findByUserId: jest.fn().mockResolvedValue(null),
    upsert: jest.fn().mockResolvedValue(undefined),
  });

  it('defaults gym showRpe to false', async () => {
    await expect(new PreferencesService(repository()).getPreferences('user-1')).resolves.toMatchObject({
      gym: { showRpe: false },
    });
  });

  it('merges and validates calendar preferences', async () => {
    const preferences = repository();

    await expect(new PreferencesService(preferences).updateCalendarPreferences('user-1', {
      zoom: 'DAY',
      showCompleted: false,
      collapsedGroupIds: ['tasks', 'tasks'],
    })).resolves.toMatchObject({ zoom: 'DAY', showCompleted: false, collapsedGroupIds: ['tasks'] });
    await expect(new PreferencesService(preferences).updateCalendarPreferences('user-1', {
      visibleKinds: ['INVALID' as never],
    })).rejects.toThrow('visibleKinds');
  });

  it('validates the default task due time', async () => {
    const preferences = repository();

    await expect(new PreferencesService(preferences).updateTaskPreferences('user-1', { defaultDueTime: '25:00' }))
      .rejects.toThrow('defaultDueTime');
  });
});
