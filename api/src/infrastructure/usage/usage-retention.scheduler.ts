import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import type { ILogger } from '@core/application/ports/out/services.port';
import { UsageService } from '@core/application/use-cases/usage.service';

const RETENTION_INTERVAL_MS = 86_400_000;

@Injectable()
export class UsageRetentionScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly usage: UsageService,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
  ) {}

  onModuleInit(): void {
    void this.runCleanup();
    this.timer = setInterval(() => void this.runCleanup(), RETENTION_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
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
}
