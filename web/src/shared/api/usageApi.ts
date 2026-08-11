import type { ApiClientContext } from './apiContext';
import type { UsageSummary } from './types';

export interface UsageSummariesRange {
  from?: string;
  to?: string;
}

export interface WebsiteUsageSummary {
  totalActiveSeconds: number;
  hostnames?: Array<{ hostname: string; activeSeconds: number }>;
  topHostnames: Array<{ hostname: string; activeSeconds: number }>;
  urlDetails: Array<{ url: string; hostname: string; activeSeconds: number }>;
  daily: Array<{ localDate: string; activeSeconds: number }>;
  browsers: Array<{ browserBundleId: string; browserDisplayName: string; activeSeconds: number }>;
}

export interface UsageApi {
  usageSummaries(from: string, to: string): Promise<UsageSummary>;
  websiteUsageSummaries(from: string, to: string): Promise<WebsiteUsageSummary>;
  getWebsiteUrls(hostname: string, from?: string, to?: string, limit?: number, offset?: number): Promise<{ total: number; items: Array<{ url: string; activeSeconds: number }> }>;
  deleteUsageSummaries(range?: UsageSummariesRange): Promise<void>;
  generateBrowserExtensionDsn(): Promise<{ dsnKey: string }>;
}

export function createUsageApi(context: ApiClientContext): UsageApi {
  return {
    usageSummaries(from, to) {
      const query = new URLSearchParams({ from, to });
      return context.request<UsageSummary>(`/usage/summaries?${query}`);
    },
    websiteUsageSummaries(from, to) {
      const query = new URLSearchParams({ from, to });
      return context.request<WebsiteUsageSummary>(`/usage/websites/summaries?${query}`);
    },
    getWebsiteUrls(hostname, from, to, limit = 50, offset = 0) {
      const query = new URLSearchParams({ hostname, limit: String(limit), offset: String(offset) });
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      return context.request<{ total: number; items: Array<{ url: string; activeSeconds: number }> }>(`/usage/websites/urls?${query}`);
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
