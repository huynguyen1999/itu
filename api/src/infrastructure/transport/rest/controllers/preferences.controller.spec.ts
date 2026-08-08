import { Test, TestingModule } from '@nestjs/testing';
import { PreferencesController } from './preferences.controller';
import { PreferencesService, DEFAULT_MONEY_PREFERENCES, DEFAULT_GYM_PREFERENCES } from '@core/application/use-cases/preferences.service';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';
import { AuthGuard } from '../guards/auth.guard';

describe('PreferencesController', () => {
  let controller: PreferencesController;
  let service: PreferencesService;

  const mockPrisma = {
    userPreferences: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PreferencesController],
      providers: [
        PreferencesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PreferencesController>(PreferencesController);
    service = module.get<PreferencesService>(PreferencesService);
    jest.clearAllMocks();
  });

  it('should return default preferences when no record exists', async () => {
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);

    const result = await controller.getPreferences({ user: { sub: 'user-1' } } as any);
    expect(result).toEqual({
      money: DEFAULT_MONEY_PREFERENCES,
      gym: DEFAULT_GYM_PREFERENCES,
    });
    expect(mockPrisma.userPreferences.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('should update money preferences', async () => {
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.userPreferences.upsert.mockResolvedValue({} as any);

    const result = await controller.updateMoneyPreferences(
      { user: { sub: 'user-1' } } as any,
      { defaultCurrency: 'USD' },
    );

    expect(result.defaultCurrency).toBe('USD');
    expect(mockPrisma.userPreferences.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: expect.objectContaining({
        userId: 'user-1',
        moneyPreferences: expect.objectContaining({ defaultCurrency: 'USD' }),
      }),
      update: expect.objectContaining({
        moneyPreferences: expect.objectContaining({ defaultCurrency: 'USD' }),
      }),
    });
  });

  it('should update gym preferences', async () => {
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.userPreferences.upsert.mockResolvedValue({} as any);

    const result = await controller.updateGymPreferences(
      { user: { sub: 'user-1' } } as any,
      { weightUnit: 'LBS', defaultRestSeconds: 180 },
    );

    expect(result.weightUnit).toBe('LBS');
    expect(result.defaultRestSeconds).toBe(180);
    expect(mockPrisma.userPreferences.upsert).toHaveBeenCalled();
  });
});
