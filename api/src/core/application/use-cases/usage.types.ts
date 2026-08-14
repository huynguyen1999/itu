export interface UsageSummaryInput {
  localDate: string;
  hour?: number;
  bundleId: string;
  displayName: string;
  timezone: string;
  activeSeconds: number;
  engagedSeconds?: number;
}

export interface UsageSummaryBatchInput {
  deviceId: string;
  summaries: UsageSummaryInput[];
}

export interface WebsiteUsageSummaryInput {
  localDate: string;
  browserBundleId: string;
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
