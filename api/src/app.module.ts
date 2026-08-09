import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import path from 'path';
import { DomainExceptionFilter } from './infrastructure/common/filters/domain-exception.filter';
import { LoggingModule } from './infrastructure/logging/logging.module';
import { AuthModule } from './features/auth/auth.module';
import { DecksModule } from './features/decks/decks.module';
import { CardsModule } from './features/cards/cards.module';
import { StudyModule } from './features/study/study.module';
import { AiModule } from './features/ai/ai.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { SyncModule } from './features/sync/sync.module';
import { DevicesModule } from './features/devices/devices.module';
import { TrashModule } from './features/trash/trash.module';
import { MediaModule } from './infrastructure/media/media.module';
import { ProductivityModule } from './features/productivity/productivity.module';
import { GrowthModule } from './features/growth/growth.module';
import { JournalModule } from './features/journal/journal.module';
import { BudgetModule } from './features/budget/budget.module';
import { GymModule } from './features/gym/gym.module';
import { PublicModule } from './infrastructure/public/public.module';
import { UsageModule } from './features/usage/usage.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [path.resolve(process.cwd(), '.env')],
    }),
    PublicModule,
    LoggingModule,
    AuthModule,
    DecksModule,
    CardsModule,
    StudyModule,
    AiModule,
    DashboardModule,
    SyncModule,
    DevicesModule,
    TrashModule,
    MediaModule,
    ProductivityModule,
    GrowthModule,
    JournalModule,
    BudgetModule,
    GymModule,
    UsageModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    },
  ],
})
export class AppModule {}
