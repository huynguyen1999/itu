import { Injectable } from '@nestjs/common';
import { PrismaService } from '@infrastructure/persistence/prisma/prisma.service';

export interface MoneyPreferences {
  defaultCurrency: 'VND' | 'USD';
  defaultTransactionType: 'EXPENSE' | 'INCOME';
  rememberPaymentMethod: boolean;
  merchantSuggestionsEnabled: boolean;
  budgetWarningThreshold: number;
  budgetAlertsEnabled: boolean;
}

export interface GymPreferences {
  weightUnit: 'KG' | 'LBS';
  distanceUnit: 'KM' | 'MI';
  defaultRestSeconds: number;
  autoStartRestTimer: boolean;
  previousPerformanceMode: 'EXERCISE' | 'ROUTINE';
  showRpe: boolean;
  weeklyWorkoutGoal?: number;
}

export const DEFAULT_MONEY_PREFERENCES: MoneyPreferences = {
  defaultCurrency: 'VND',
  defaultTransactionType: 'EXPENSE',
  rememberPaymentMethod: true,
  merchantSuggestionsEnabled: true,
  budgetWarningThreshold: 80,
  budgetAlertsEnabled: true,
};

export const DEFAULT_GYM_PREFERENCES: GymPreferences = {
  weightUnit: 'KG',
  distanceUnit: 'KM',
  defaultRestSeconds: 120,
  autoStartRestTimer: true,
  previousPerformanceMode: 'EXERCISE',
  showRpe: true,
  weeklyWorkoutGoal: 3,
};

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(userId: string): Promise<{ money: MoneyPreferences; gym: GymPreferences }> {
    const record = await this.prisma.userPreferences.findUnique({
      where: { userId },
    });

    const money = { ...DEFAULT_MONEY_PREFERENCES, ...((record?.moneyPreferences as Partial<MoneyPreferences>) || {}) };
    const gym = { ...DEFAULT_GYM_PREFERENCES, ...((record?.gymPreferences as Partial<GymPreferences>) || {}) };

    return { money, gym };
  }

  async updateMoneyPreferences(userId: string, patch: Partial<MoneyPreferences>): Promise<MoneyPreferences> {
    const current = await this.getPreferences(userId);
    const updatedMoney = { ...current.money, ...patch };

    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        moneyPreferences: updatedMoney as any,
        gymPreferences: current.gym as any,
      },
      update: {
        moneyPreferences: updatedMoney as any,
      },
    });

    return updatedMoney;
  }

  async updateGymPreferences(userId: string, patch: Partial<GymPreferences>): Promise<GymPreferences> {
    const current = await this.getPreferences(userId);
    const updatedGym = { ...current.gym, ...patch };

    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        moneyPreferences: current.money as any,
        gymPreferences: updatedGym as any,
      },
      update: {
        gymPreferences: updatedGym as any,
      },
    });

    return updatedGym;
  }
}
