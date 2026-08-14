import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { USAGE_CONSTANTS } from '@core/application/constants/app.constants';
import type { IUsageRepository } from '@core/application/ports/out/repositories.port';
import { dateKey, parseDate, validTimezone } from './usage-validation';
import type { UsageSummaryBatchInput, UsageSummaryInput } from './usage.types';

const MAX_BATCH_SIZE = USAGE_CONSTANTS.maxBatchSize;
const MAX_ACTIVE_SECONDS = USAGE_CONSTANTS.maxActiveSeconds;

/** macOS application-usage ingestion use cases. */
export class UsageIngestionService {
  constructor(private readonly usage: IUsageRepository) {}

  async replaceBatch(userId: string, input: UsageSummaryBatchInput) {
    if (!input.deviceId || !Array.isArray(input.summaries) || input.summaries.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(`summaries must contain at most ${MAX_BATCH_SIZE} entries`);
    }
    const device = await this.usage.findDevice(userId, input.deviceId);
    if (!device) throw new ForbiddenException('Sync device does not belong to this user');
    if (device.platform !== 'MACOS') throw new BadRequestException('Usage summaries require a macOS Sync Device');
    const preferences = await this.usage.getTrackingPreferences(userId);
    if (!preferences.trackingEnabled) return { accepted: false, replaced: 0 };
    const unique = new Map<string, UsageSummaryInput>();
    for (const summary of input.summaries) {
      const localDate = parseDate(summary.localDate, 'localDate');
      if (typeof summary.bundleId !== 'string' || !summary.bundleId || summary.bundleId.length > 255) throw new BadRequestException('bundleId is required and must be at most 255 characters');
      if (typeof summary.displayName !== 'string' || !summary.displayName || summary.displayName.length > 255) throw new BadRequestException('displayName is required and must be at most 255 characters');
      if (typeof summary.timezone !== 'string' || !summary.timezone || summary.timezone.length > 100 || !validTimezone(summary.timezone)) throw new BadRequestException('timezone must be a valid IANA timezone');
      if (!Number.isInteger(summary.activeSeconds) || summary.activeSeconds < 0 || summary.activeSeconds > MAX_ACTIVE_SECONDS) throw new BadRequestException('activeSeconds must be an integer between 0 and 86400');
      if (summary.engagedSeconds !== undefined && summary.engagedSeconds !== null && (!Number.isInteger(summary.engagedSeconds) || summary.engagedSeconds < 0 || summary.engagedSeconds > summary.activeSeconds)) throw new BadRequestException('engagedSeconds must be an integer between 0 and activeSeconds');
      if (summary.hour !== undefined && (!Number.isInteger(summary.hour) || summary.hour < 0 || summary.hour > 23)) throw new BadRequestException('hour must be an integer between 0 and 23');
      unique.set(`${dateKey(localDate)}\u0000${summary.hour ?? -1}\u0000${summary.bundleId}`, { ...summary, localDate: dateKey(localDate) });
    }
    const replaced = await this.usage.replaceBatch(userId, input.deviceId, [...unique.values()].map((summary) => ({ ...summary, hour: summary.hour ?? -1, localDate: parseDate(summary.localDate, 'localDate') })));
    return { accepted: true, replaced };
  }
}
