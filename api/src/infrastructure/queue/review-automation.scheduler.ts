import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { JOURNAL_AUTOMATION_USER_QUERY, type IJournalAutomationUserQuery } from '@core/application/ports/out/journal-repository.port';
import { ReviewAutomationService } from '@core/application/use-cases/journal/review-automation.service';
import { TOKENS } from '@core/application/constants/tokens';
import type { ILogger } from '@core/application/ports/out/services.port';

// ponytail: one-minute O(users) scan; use per-user scheduled jobs if scale requires it.
const REVIEW_AUTOMATION_INTERVAL_MS = 60_000;

@Injectable()
export class ReviewAutomationScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @Inject(JOURNAL_AUTOMATION_USER_QUERY) private readonly users: IJournalAutomationUserQuery,
    private readonly automation: ReviewAutomationService,
    @Inject(TOKENS.LOGGER) private readonly logger: ILogger,
  ) {}

  onModuleInit(): void {
    void this.run();
    this.timer = setInterval(() => void this.run(), REVIEW_AUTOMATION_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const users = await this.users.listUsers();
      const results = await Promise.allSettled(
        users.map((user) => this.automation.ensureReviews(user.userId, now, user.timezone)),
      );
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
          this.logger.warn('Review automation failed', { userId: users[index]?.userId, error });
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn('Review automation scan skipped', { error: message });
    } finally {
      this.running = false;
    }
  }
}
