import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  IPreferencesRepository,
  PreferenceRecord,
  PreferenceUpdate,
} from '@core/application/ports/out/preferences-repository.port';
import { PrismaService } from './prisma.service';

const PREFERENCE_COLUMNS = [
  'taskPreferences',
  'focusPreferences',
  'habitPreferences',
  'matrixPreferences',
  'growthPreferences',
  'learnPreferences',
  'journalPreferences',
  'moneyPreferences',
  'budgetPreferences',
  'gymPreferences',
  'usagePreferences',
  'calendarPreferences',
] as const;

@Injectable()
export class PrismaPreferencesRepository implements IPreferencesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUserId(userId: string): Promise<PreferenceRecord | null> {
    return this.prisma.userPreferences.findUnique({ where: { userId } });
  }

  async upsert(userId: string, update: PreferenceUpdate): Promise<void> {
    const data = Object.fromEntries(
      PREFERENCE_COLUMNS.filter((column) => update[column] !== undefined).map((column) => [
        column,
        update[column] as Prisma.InputJsonValue,
      ]),
    );
    await this.prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }
}
