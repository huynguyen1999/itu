import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { USAGE_CONSTANTS } from '@core/application/constants/app.constants';
import { USAGE_SOURCES, type IUsageRepository, type ScreenTimeEventWrite } from '@core/application/ports/out/repositories.port';
import { dateKey, isSystemExcludedBundleId, parseDate, validTimezone } from './usage-validation';
import type { ScreenTimeUsageBatchInput, UsageSummaryBatchInput, UsageSummaryInput } from './usage.types';

const MAX_BATCH_SIZE = USAGE_CONSTANTS.maxBatchSize;
const MAX_ACTIVE_SECONDS = USAGE_CONSTANTS.maxActiveSeconds;

/** Application-usage ingestion use cases for foreground and DeviceActivity sources. */
export class UsageIngestionService {
  constructor(private readonly usage: IUsageRepository) {}

  async replaceBatch(userId: string, input: UsageSummaryBatchInput) {
    if (!input.deviceId || !Array.isArray(input.summaries) || input.summaries.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(`summaries must contain at most ${MAX_BATCH_SIZE} entries`);
    }
    const device = await this.usage.findDevice(userId, input.deviceId);
    if (!device) throw new ForbiddenException('Sync device does not belong to this user');
    if (input.summaries.length === 0 && device.platform !== 'MACOS') {
      throw new BadRequestException('Usage summaries require a macOS Sync Device');
    }
    const unique = new Map<string, UsageSummaryInput>();
    for (const rawSummary of input.summaries) {
      const summary = rawSummary;
      const source = summary.source ?? 'MACOS_FOREGROUND';
      if (!USAGE_SOURCES.includes(source)) throw new BadRequestException('source is invalid');
      if (source === 'DEVICE_ACTIVITY' && device.platform !== 'IOS') {
        throw new BadRequestException('DeviceActivity usage requires an iOS Sync Device');
      }
      if (source === 'MACOS_FOREGROUND' && device.platform !== 'MACOS') {
        throw new BadRequestException('Foreground usage requires a macOS Sync Device');
      }
      if (source === 'BROWSER' || source === 'HEALTH_KIT') {
        throw new BadRequestException('This source is not valid for app summaries');
      }
      if (isSystemExcludedBundleId(summary.bundleId)) continue;
      const localDate = parseDate(summary.localDate, 'localDate');
      if (typeof summary.bundleId !== 'string' || !summary.bundleId || summary.bundleId.length > 255)
        throw new BadRequestException('bundleId is required and must be at most 255 characters');
      if (typeof summary.displayName !== 'string' || !summary.displayName || summary.displayName.length > 255)
        throw new BadRequestException('displayName is required and must be at most 255 characters');
      if (
        typeof summary.timezone !== 'string' ||
        !summary.timezone ||
        summary.timezone.length > 100 ||
        !validTimezone(summary.timezone)
      )
        throw new BadRequestException('timezone must be a valid IANA timezone');
      if (
        !Number.isInteger(summary.activeSeconds) ||
        summary.activeSeconds < 0 ||
        summary.activeSeconds > MAX_ACTIVE_SECONDS
      )
        throw new BadRequestException('activeSeconds must be an integer between 0 and 86400');
      if (
        summary.engagedSeconds !== undefined &&
        summary.engagedSeconds !== null &&
        (!Number.isInteger(summary.engagedSeconds) ||
          summary.engagedSeconds < 0 ||
          summary.engagedSeconds > summary.activeSeconds)
      )
        throw new BadRequestException('engagedSeconds must be an integer between 0 and activeSeconds');
      if (summary.hour !== undefined && (!Number.isInteger(summary.hour) || summary.hour < 0 || summary.hour > 23))
        throw new BadRequestException('hour must be an integer between 0 and 23');
      for (const [name, value] of [
        ['pickups', summary.pickups],
        ['notifications', summary.notifications],
      ] as const) {
        if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
          throw new BadRequestException(`${name} must be a nonnegative integer`);
        }
      }
      unique.set(`${source}\u0000${dateKey(localDate)}\u0000${summary.hour ?? -1}\u0000${summary.bundleId}`, {
        ...summary,
        source,
        localDate: dateKey(localDate),
      });
    }
    const preferences = await this.usage.getTrackingPreferences(userId);
    if (!preferences.trackingEnabled) return { accepted: false, replaced: 0 };
    const replaced = await this.usage.replaceBatch(
      userId,
      input.deviceId,
      [...unique.values()].map((summary) => ({
        ...summary,
        hour: summary.hour ?? -1,
        localDate: parseDate(summary.localDate, 'localDate'),
      })),
    );
    return { accepted: true, replaced };
  }

  async ingestScreenTimeEvents(userId: string, input: ScreenTimeUsageBatchInput) {
    if (!input.collectorDeviceId || !Array.isArray(input.events) || input.events.length > MAX_BATCH_SIZE) {
      throw new BadRequestException(`events must contain at most ${MAX_BATCH_SIZE} entries`);
    }
    const collector = await this.usage.findDevice(userId, input.collectorDeviceId);
    if (!collector) throw new ForbiddenException('Collector device does not belong to this user');
    if (collector.platform !== 'MACOS') {
      throw new BadRequestException('Screen Time events require a macOS collector Sync Device');
    }

    const preferences = await this.usage.getTrackingPreferences(userId);
    if (!preferences.trackingEnabled) return { accepted: false, inserted: 0 };

    const parsedEvents: ScreenTimeEventWrite[] = [];
    const seenEventIds = new Set<string>();

    for (const raw of input.events) {
      if (isSystemExcludedBundleId(raw.bundleId)) continue;
      const source = raw.source ?? 'SCREEN_TIME_BIOME';
      if (source !== 'SCREEN_TIME_BIOME') {
        throw new BadRequestException('Screen Time events must use SCREEN_TIME_BIOME source');
      }
      if (typeof raw.eventId !== 'string' || !raw.eventId || raw.eventId.length > 128) {
        throw new BadRequestException('eventId is required and must be at most 128 characters');
      }
      if (typeof raw.sourceDeviceId !== 'string' || !raw.sourceDeviceId || raw.sourceDeviceId.length > 128) {
        throw new BadRequestException('sourceDeviceId is required and must be at most 128 characters');
      }
      if (typeof raw.bundleId !== 'string' || !raw.bundleId || raw.bundleId.length > 255) {
        throw new BadRequestException('bundleId is required and must be at most 255 characters');
      }
      if (typeof raw.displayName !== 'string' || !raw.displayName || raw.displayName.length > 255) {
        throw new BadRequestException('displayName is required and must be at most 255 characters');
      }
      if (
        !Number.isInteger(raw.durationSeconds) ||
        raw.durationSeconds < 0 ||
        raw.durationSeconds > MAX_ACTIVE_SECONDS
      ) {
        throw new BadRequestException('durationSeconds must be an integer between 0 and 86400');
      }

      const startedAt = new Date(raw.startedAt);
      const endedAt = new Date(raw.endedAt);
      if (Number.isNaN(startedAt.getTime()) || Number.isNaN(endedAt.getTime())) {
        throw new BadRequestException('startedAt and endedAt must be valid ISO date strings');
      }
      if (startedAt > endedAt) {
        throw new BadRequestException('startedAt must be before or equal to endedAt');
      }

      const spanSeconds = Math.ceil((endedAt.getTime() - startedAt.getTime()) / 1000);
      if (raw.durationSeconds > spanSeconds + USAGE_CONSTANTS.screenTimeToleranceSeconds) {
        throw new BadRequestException('durationSeconds exceeds interval length plus tolerance');
      }

      if (seenEventIds.has(raw.eventId)) continue;
      seenEventIds.add(raw.eventId);

      parsedEvents.push({
        eventId: raw.eventId,
        source: 'SCREEN_TIME_BIOME',
        sourceDeviceId: raw.sourceDeviceId,
        sourceDeviceName: raw.sourceDeviceName?.slice(0, 255) ?? null,
        bundleId: raw.bundleId,
        displayName: raw.displayName,
        startedAt,
        endedAt,
        durationSeconds: raw.durationSeconds,
      });
    }

    return this.usage.ingestScreenTimeEvents(userId, input.collectorDeviceId, parsedEvents);
  }
}

