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
});
