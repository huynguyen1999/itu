export const USAGE_SOURCES = [
  'MACOS_FOREGROUND',
  'DEVICE_ACTIVITY',
  'BROWSER',
  'HEALTH_KIT',
  'SCREEN_TIME_BIOME',
] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];

export interface UsageSummaryRecord {
  localDate: Date;
  hour: number;
  bundleId: string;
  displayName: string;
  activeSeconds: number;
  engagedSeconds?: number | null;
  iconHash?: string | null;
  iconStorageKey?: string | null;
}

export interface UsageAppIdentityRecord {
  bundleId: string;
  displayName: string;
  iconHash?: string | null;
  iconStorageKey?: string | null;
}

export interface UsageAppIdentityWrite {
  bundleId: string;
  displayName: string;
  iconHash: string;
  iconStorageKey: string;
}

export interface UsageSummaryWrite {
  localDate: Date;
  hour: number;
  bundleId: string;
  displayName: string;
  timezone: string;
  activeSeconds: number;
  source?: UsageSource;
  engagedSeconds?: number | null;
  pickups?: number | null;
  notifications?: number | null;
}

export interface WebsiteUsageSummaryRecord {
  localDate: Date;
  browserBundleId: string | null;
  browserDisplayName: string;
  hostname: string;
  url: string | null;
  activeSeconds: number;
}

export interface WebsiteUsageSummaryWrite {
  localDate: Date;
  browserBundleId?: string | null;
  browserDisplayName: string;
  hostname: string;
  url: string | null;
  urlKey: string;
  timezone: string;
  activeSeconds: number;
  source?: UsageSource;
  hour?: number;
}

export interface WebsiteActivitySessionRecord {
  id: string;
  userId: string;
  installationId: string;
  browserBundleId: string;
  browserDisplayName: string;
  startedAt: Date;
  endedAt: Date;
  activeSeconds: number;
  hostname: string;
  url: string;
  iconUrl: string | null;
  pageTitle: string | null;
  isPrivate: boolean;
  timezone: string;
  createdAt: Date;
}

export interface WebsiteActivitySessionWrite {
  id: string;
  installationId: string;
  browserBundleId: string;
  browserDisplayName: string;
  startedAt: Date;
  endedAt: Date;
  activeSeconds: number;
  hostname: string;
  url: string;
  iconUrl?: string | null;
  pageTitle: string | null;
  isPrivate: boolean;
  timezone: string;
}

export interface ScreenTimeEventWrite {
  eventId: string;
  source: UsageSource;
  sourceDeviceId: string;
  sourceDeviceName?: string | null;
  bundleId: string;
  displayName: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
}

export interface ScreenTimeEventRecord {
  id: string;
  userId: string;
  collectorDeviceId: string;
  sourceDeviceId: string;
  sourceDeviceName?: string | null;
  source: UsageSource;
  eventId: string;
  bundleId: string;
  displayName: string;
  startedAt: Date;
  endedAt: Date;
  durationSeconds: number;
  iconHash?: string | null;
  iconStorageKey?: string | null;
}

export interface ScreenTimeDeviceRecord {
  deviceId: string;
  name: string | null;
  platform: string | null;
  lastSeenAt: Date | null;
}

export const BROWSER_EXTENSION_CREDENTIAL_KINDS = ['DEFAULT_BROWSER', 'SAFARI_IOS'] as const;
export type BrowserExtensionCredentialKind = (typeof BROWSER_EXTENSION_CREDENTIAL_KINDS)[number];

export interface IUsageRepository {
  findDevice(userId: string, deviceId: string): Promise<{ platform: string } | null>;
  findSummaries(userId: string, from: Date, toExclusive: Date, deviceId?: string): Promise<UsageSummaryRecord[]>;
  listAppIdentities(userId: string): Promise<UsageAppIdentityRecord[]>;
  findAppIdentity(userId: string, bundleId: string): Promise<UsageAppIdentityRecord | null>;
  upsertAppIdentity(userId: string, data: UsageAppIdentityWrite): Promise<UsageAppIdentityRecord>;
  getTrackingPreferences(userId: string): Promise<{
    trackingEnabled: boolean;
    websiteTrackingEnabled: boolean;
    retentionDays: number;
    idleThresholdSeconds: number;
    excludedBundleIds: string[];
  }>;
  replaceBatch(userId: string, deviceId: string, summaries: UsageSummaryWrite[]): Promise<number>;
  ingestScreenTimeEvents(
    userId: string,
    collectorDeviceId: string,
    events: ScreenTimeEventWrite[],
  ): Promise<{ accepted: boolean; inserted: number }>;
  findScreenTimeEvents(userId: string, from: Date, toExclusive: Date, deviceId?: string): Promise<ScreenTimeEventRecord[]>;
  listScreenTimeDevices(userId: string): Promise<ScreenTimeDeviceRecord[]>;
  deleteScreenTimeEvents(userId: string, sourceDeviceId?: string): Promise<number>;
  delete(userId: string, from?: Date, toExclusive?: Date): Promise<number>;
  deleteExpired(now?: Date): Promise<number>;
  findWebsiteSummaries(userId: string, from: Date, toExclusive: Date): Promise<WebsiteUsageSummaryRecord[]>;
  findWebsiteUrls(
    userId: string,
    from: Date,
    toExclusive: Date,
    hostname: string,
    limit: number,
    offset: number,
  ): Promise<{ items: Array<{ url: string; activeSeconds: number }>; total: number }>;
  replaceWebsiteBatch(userId: string, deviceId: string, summaries: WebsiteUsageSummaryWrite[]): Promise<number>;
  ingestWebsiteActivitySessions(userId: string, sessions: WebsiteActivitySessionWrite[]): Promise<string[]>;
  findWebsiteActivitySessions(userId: string, from: Date, toExclusive: Date): Promise<WebsiteActivitySessionRecord[]>;
  replaceBrowserExtensionCredential(
    userId: string,
    id: string,
    keyHash: string,
    kind: BrowserExtensionCredentialKind,
  ): Promise<void>;
  findBrowserExtensionCredential(keyHash: string): Promise<{ userId: string } | null>;
  ensureBrowserExtensionDevice(userId: string, installationId: string): Promise<string>;
  deleteWebsite(userId: string, from?: Date, toExclusive?: Date): Promise<number>;
}
