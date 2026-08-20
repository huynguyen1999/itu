import { Module } from '@nestjs/common';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { MediaModule } from '@infrastructure/media/media.module';
import { UsageService } from '@core/application/use-cases/usage.service';
import { TOKENS } from '@core/application/constants/tokens';
import {
  BrowserExtensionUsageController,
  ScreenTimeUsageController,
  UsageController,
  UsageAppController,
  WebsiteUsageController,
} from '@infrastructure/transport/rest/controllers/usage.controller';
import { BrowserExtensionDsnGuard } from '@infrastructure/transport/rest/guards/browser-extension-dsn.guard';
import { UsageRetentionScheduler } from '@infrastructure/usage/usage-retention.scheduler';

@Module({
  imports: [AuthModule, PersistenceModule, MediaModule],
  controllers: [
    ScreenTimeUsageController,
    UsageController,
    UsageAppController,
    WebsiteUsageController,
    BrowserExtensionUsageController,
  ],
  providers: [
    {
      provide: UsageService,
      useFactory: (usage, media) => new UsageService(usage, media),
      inject: [TOKENS.USAGE_REPOSITORY, { token: TOKENS.MEDIA_STORAGE, optional: true }],
    },
    UsageRetentionScheduler,
    BrowserExtensionDsnGuard,
  ],
})
export class UsageModule {}
