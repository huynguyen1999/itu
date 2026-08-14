import { BadRequestException, Inject, Injectable, Optional } from '@nestjs/common';
import { TOKENS } from '@core/application/constants/tokens';
import type { IUsageRepository } from '@core/application/ports/out/repositories.port';
import type { IMediaStorage } from '@core/application/ports/out/services.port';
import { UsageIdentityService } from './usage-identity.service';
import { UsageIngestionService } from './usage-ingestion.service';
import { UsageQueryService } from './usage-query.service';
import { UsageWebsiteService } from './usage-website.service';
import { nextDay, parseDate } from './usage-validation';
import type {
  BrowserExtensionUsageBatchInput,
  UsageAppIconInput,
  UsageSummaryBatchInput,
  WebsiteActivitySessionBatchInput,
  WebsiteUsageSummaryBatchInput,
} from './usage.types';

export type {
  BrowserExtensionUsageBatchInput,
  UsageAppIconInput,
  UsageSummaryBatchInput,
  UsageSummaryInput,
  WebsiteActivitySessionBatchInput,
  WebsiteUsageSummaryBatchInput,
  WebsiteUsageSummaryInput,
} from './usage.types';

@Injectable()
export class UsageService extends UsageQueryService {
  private readonly ingestion: UsageIngestionService;
  private readonly website: UsageWebsiteService;
  private readonly identity: UsageIdentityService;

  constructor(
    @Inject(TOKENS.USAGE_REPOSITORY) usage: IUsageRepository,
    @Optional() @Inject(TOKENS.MEDIA_STORAGE) media?: IMediaStorage,
  ) {
    super(usage);
    this.ingestion = new UsageIngestionService(usage);
    this.website = new UsageWebsiteService(usage);
    this.identity = new UsageIdentityService(usage, media);
  }

  replaceBatch(userId: string, input: UsageSummaryBatchInput) {
    return this.ingestion.replaceBatch(userId, input);
  }

  replaceAppIcon(userId: string, input: UsageAppIconInput) {
    return this.identity.replaceAppIcon(userId, input);
  }

  getWebsiteSummaries(userId: string, from?: string, to?: string, includeUrlDetails = true) {
    return this.website.getSummaries(userId, from, to, includeUrlDetails);
  }

  ingestWebsiteActivitySessions(userId: string, input: WebsiteActivitySessionBatchInput) {
    return this.website.ingestActivitySessions(userId, input);
  }

  getWebsiteStatistics(userId: string, from?: string, to?: string) {
    return this.website.getStatistics(userId, from, to);
  }

  getWebsiteUrls(userId: string, hostname: string, from?: string, to?: string, limit = 100, offset = 0) {
    return this.website.getUrls(userId, hostname, from, to, limit, offset);
  }

  replaceWebsiteBatch(userId: string, input: WebsiteUsageSummaryBatchInput) {
    return this.website.replaceBatch(userId, input);
  }

  generateBrowserExtensionDsn(userId: string) {
    return this.website.generateDsn(userId);
  }

  authenticateBrowserExtensionDsn(dsnKey: string) {
    return this.website.authenticateDsn(dsnKey);
  }

  ingestBrowserExtension(userId: string, input: BrowserExtensionUsageBatchInput) {
    return this.website.ingestBrowserExtension(userId, input);
  }

  deleteWebsite(userId: string, from?: string, to?: string, all = false) {
    return this.website.delete(userId, from, to, all);
  }

  async delete(userId: string, from?: string, to?: string, all = false) {
    if (all || (!from && !to)) return { deletedCount: await this.usage.delete(userId) };
    const start = parseDate(from ?? to!, 'from');
    const end = parseDate(to ?? from!, 'to');
    if (start > end) throw new BadRequestException('from must not be after to');
    if ((end.getTime() - start.getTime()) / 86_400_000 + 1 > 365) {
      throw new BadRequestException('Usage date range cannot exceed 365 days');
    }
    return { deletedCount: await this.usage.delete(userId, start, nextDay(end)) };
  }

  cleanupExpired(now = new Date()): Promise<number> {
    return this.usage.deleteExpired(now);
  }
}
