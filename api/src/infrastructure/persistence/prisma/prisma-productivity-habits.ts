import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaProductivityHabitInsights } from './prisma-productivity-habit-insights';

@Injectable()
export class PrismaProductivityHabits extends PrismaProductivityHabitInsights {
  constructor(db: PrismaService) {
    super(db);
  }
}
