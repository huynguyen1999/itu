import { Inject, Module, OnModuleDestroy, OnModuleInit, Injectable } from '@nestjs/common';
import { AuthModule } from '@features/auth/auth.module';
import { PersistenceModule } from '@infrastructure/persistence/persistence.module';
import { MediaModule } from '@infrastructure/media/media.module';
import { UsageService } from '@core/application/use-cases/usage.service';
import { TOKENS } from '@core/application/constants/tokens';
import type { ILogger } from '@core/application/ports/out/services.port';
import {
  BrowserExtensionUsageController,
  ScreenTimeUsageController,
  UsageController,
  UsageAppController,
  WebsiteUsageController,
} from '@infrastructure/transport/rest/controllers/usage.controller';
import { BrowserExtensionDsnGuard } from '@infrastructure/transport/rest/guards/browser-extension-dsn.guard';

@Injectable()
class UsageRetentionScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly usage: UsageService,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
  ) {}

  onModuleInit(): void {
    void this.runCleanup();
    this.timer = setInterval(() => void this.runCleanup(), 86_400_000);
    this.timer.unref();
  }

  private async runCleanup(): Promise<void> {
    try {
      const deleted = await this.usage.cleanupExpired();
      this.logger.debug('Usage retention cleanup completed', { deletedCount: deleted });
    } catch (error) {
      this.logger.error('Usage retention cleanup failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}

@Module({
  imports: [AuthModule, PersistenceModule, MediaModule],
  controllers: [
    ScreenTimeUsageController,
    UsageController,
    UsageAppController,
    WebsiteUsageController,
    BrowserExtensionUsageController,
  ],
  providers: [UsageService, UsageRetentionScheduler, BrowserExtensionDsnGuard],
})
export class UsageModule {}
