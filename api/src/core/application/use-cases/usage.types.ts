import type { UsageSource } from '@core/application/ports/out/repositories.port';

export interface UsageSummaryInput {
  source?: UsageSource;
  localDate: string;
  hour?: number;
  bundleId: string;
  displayName: string;
  timezone: string;
  activeSeconds: number;
  engagedSeconds?: number;
  pickups?: number;
  notifications?: number;
}

export interface UsageSummaryBatchInput {
  deviceId: string;
  summaries: UsageSummaryInput[];
}

export interface WebsiteUsageSummaryInput {
  source?: UsageSource;
  localDate: string;
  hour?: number;
  browserBundleId?: string | null;
  browserDisplayName: string;
  hostname: string;
  url?: string;
  timezone: string;
  activeSeconds: number;
}

export interface WebsiteUsageSummaryBatchInput {
  deviceId: string;
  summaries: WebsiteUsageSummaryInput[];
}

export interface BrowserExtensionUsageBatchInput {
  installationId: string;
  summaries: WebsiteUsageSummaryInput[];
}

interface WebsiteActivitySessionInput {
  id: string;
  startedAt: string;
  endedAt: string;
  browserBundleId: string;
  browserDisplayName: string;
  hostname: string;
  url: string;
  iconUrl?: string | null;
  pageTitle?: string | null;
  isPrivate: boolean;
  timezone: string;
}

export interface WebsiteActivitySessionBatchInput {
  installationId: string;
  sessions: WebsiteActivitySessionInput[];
}

export interface UsageAppIconInput {
  bundleId: string;
  displayName: string;
  originalName: string;
  mimeType: string;
  buffer: Buffer;
}

export interface ScreenTimeEventInput {
  eventId: string;
  source?: UsageSource;
  sourceDeviceId: string;
  sourceDeviceName?: string;
  bundleId: string;
  displayName: string;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}

export interface ScreenTimeUsageBatchInput {
  collectorDeviceId: string;
  events: ScreenTimeEventInput[];
}
