import { Test, TestingModule } from '@nestjs/testing';
import { PreferencesController } from './preferences.controller';
import {
  PreferencesService,
  DEFAULT_MONEY_PREFERENCES,
  DEFAULT_BUDGET_PREFERENCES,
  DEFAULT_GYM_PREFERENCES,
  DEFAULT_TASK_PREFERENCES,
  DEFAULT_FOCUS_PREFERENCES,
  DEFAULT_HABIT_PREFERENCES,
  DEFAULT_MATRIX_PREFERENCES,
  DEFAULT_GROWTH_PREFERENCES,
  DEFAULT_LEARN_PREFERENCES,
  DEFAULT_JOURNAL_PREFERENCES,
  DEFAULT_USAGE_PREFERENCES,
} from '@core/application/use-cases/preferences.service';
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
      tasks: DEFAULT_TASK_PREFERENCES,
      focus: DEFAULT_FOCUS_PREFERENCES,
      habits: DEFAULT_HABIT_PREFERENCES,
      matrix: DEFAULT_MATRIX_PREFERENCES,
      growth: DEFAULT_GROWTH_PREFERENCES,
      learn: DEFAULT_LEARN_PREFERENCES,
      journal: DEFAULT_JOURNAL_PREFERENCES,
      money: DEFAULT_MONEY_PREFERENCES,
      budget: DEFAULT_BUDGET_PREFERENCES,
      gym: DEFAULT_GYM_PREFERENCES,
      usage: DEFAULT_USAGE_PREFERENCES,
    });
    expect(mockPrisma.userPreferences.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
    });
  });

  it('should update task preferences', async () => {
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.userPreferences.upsert.mockResolvedValue({} as any);

    const result = await controller.updateTaskPreferences(
      { user: { sub: 'user-1' } } as any,
      { defaultDate: 'TODAY', defaultPriority: 'HIGH' },
    );

    expect(result.defaultDate).toBe('TODAY');
    expect(result.defaultPriority).toBe('HIGH');
    expect(mockPrisma.userPreferences.upsert).toHaveBeenCalled();
  });

  it('should update focus preferences', async () => {
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.userPreferences.upsert.mockResolvedValue({} as any);

    const result = await controller.updateFocusPreferences(
      { user: { sub: 'user-1' } } as any,
      { workDurationMinutes: 45 },
    );

    expect(result.workDurationMinutes).toBe(45);
    expect(mockPrisma.userPreferences.upsert).toHaveBeenCalled();
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

  it('should validate usage retention bounds', async () => {
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.userPreferences.upsert.mockResolvedValue({} as any);
    await expect(controller.updateUsagePreferences({ user: { sub: 'user-1' } } as any, { retentionDays: 7 })).resolves.toMatchObject({ retentionDays: 7 });
    await expect(controller.updateUsagePreferences({ user: { sub: 'user-1' } } as any, { retentionDays: 365 })).resolves.toMatchObject({ retentionDays: 365 });
    await expect(controller.updateUsagePreferences({ user: { sub: 'user-1' } } as any, { retentionDays: 6 })).rejects.toThrow('between 7 and 365');
    await expect(controller.updateUsagePreferences({ user: { sub: 'user-1' } } as any, { retentionDays: 366 })).rejects.toThrow('between 7 and 365');
  });

  it('should persist the website tracking opt-in', async () => {
    mockPrisma.userPreferences.findUnique.mockResolvedValue(null);
    mockPrisma.userPreferences.upsert.mockResolvedValue({} as any);

    await expect(controller.updateUsagePreferences(
      { user: { sub: 'user-1' } } as any,
      { websiteTrackingEnabled: true },
    )).resolves.toMatchObject({ websiteTrackingEnabled: true });
  });
});
