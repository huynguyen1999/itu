import type { ApiClientContext } from './apiContext';
import type { UsageSummary } from './types';

export interface UsageSummariesRange {
  from?: string;
  to?: string;
}

export interface WebsiteUrlDetail {
  url: string;
  hostname: string;
  activeSeconds: number;
  latestTitle: string | null;
  isPrivate: boolean;
}

export interface WebsiteActivitySession {
  id: string;
  installationId: string;
  browserBundleId: string;
  browserDisplayName: string;
  startedAt: string;
  endedAt: string;
  activeSeconds: number;
  hostname: string;
  url: string | null;
  pageTitle: string | null;
  isPrivate: boolean;
  timezone: string;
  createdAt: string;
}

export interface WebsiteUsageSummary {
  from: string;
  to: string;
  totalActiveSeconds: number;
  hostnames?: Array<{ hostname: string; activeSeconds: number }>;
  topHostnames: Array<{ hostname: string; activeSeconds: number }>;
  urlDetails: WebsiteUrlDetail[];
  daily: Array<{ localDate: string; activeSeconds: number }>;
  sessions: WebsiteActivitySession[];
}

export interface UsageApi {
  usageSummaries(from: string, to: string): Promise<UsageSummary>;
  websiteUsageStatistics(from: string, to: string): Promise<WebsiteUsageSummary>;
  websiteUsageSummaries(from: string, to: string, includeUrlDetails?: boolean): Promise<WebsiteUsageSummary>;
  deleteUsageSummaries(range?: UsageSummariesRange): Promise<void>;
  generateBrowserExtensionDsn(): Promise<{ dsnKey: string }>;
}

export function createUsageApi(context: ApiClientContext): UsageApi {
  return {
    usageSummaries(from, to) {
      const query = new URLSearchParams({ from, to });
      return context.request<UsageSummary>(`/usage/summaries?${query}`);
    },
    websiteUsageStatistics(from, to) {
      const query = new URLSearchParams({ from, to });
      return context.request<WebsiteUsageSummary>(`/usage/websites/statistics?${query}`);
    },
    websiteUsageSummaries(from, to) {
      const query = new URLSearchParams({ from, to });
      return context.request<WebsiteUsageSummary>(`/usage/websites/statistics?${query}`);
    },
    deleteUsageSummaries(range = {}) {
      const query = new URLSearchParams();
      if (range.from) query.set('from', range.from);
      if (range.to) query.set('to', range.to);
      return context.request<void>(`/usage/summaries${query.size ? `?${query}` : ''}`, { method: 'DELETE' });
    },
    generateBrowserExtensionDsn() {
      return context.request<{ dsnKey: string }>('/usage/websites/dsn', { method: 'POST' });
    },
  };
}
