import { HttpClient } from './httpClient';
export { API_BASE_URL } from './httpClient';
import { createAuthApi, type AuthApi } from './authApi';
import { createDeckStudyApi, type DeckStudyApi } from './deckStudyApi';
import { createFocusProductivityApi, type FocusProductivityApi } from './focusProductivityApi';
import { createGrowthApi, type GrowthApi } from './growthApi';
import { createProductivityApi, type ProductivityApi } from './productivityApi';
import { createSyncApi, type SyncApi } from './syncApi';
import { createPreferencesApi, type PreferencesApi } from './preferencesApi';
import { createBudgetApi, type BudgetApi } from './budgetApi';
import { createGymApi, type GymApi } from './gymApi';
import { createUsageApi, type UsageApi } from './usageApi';
import type { ApiClientContext, OfflineMutationHandler, OfflineMutationInput } from './apiContext';

export type { OfflineMutationHandler, OfflineMutationInput } from './apiContext';
export type * from './types';
export type * from './preferencesApi';
export type * from './usageApi';

export interface ApiClient
  extends SyncApi,
    ProductivityApi,
    FocusProductivityApi,
    AuthApi,
    GrowthApi,
    DeckStudyApi,
    PreferencesApi,
    BudgetApi,
    GymApi,
    UsageApi {}

export class ApiClient extends HttpClient {
  private offlineMutationHandler: OfflineMutationHandler | null = null;

  constructor() {
    super();
    const context: ApiClientContext = {
      request: <T>(path: string, init?: RequestInit) => this.request<T>(path, init),
      stream: (path: string, init?: RequestInit) => this.stream(path, init),
      offlineMutation: <T>(input: OfflineMutationInput<T>, fallback: () => Promise<T>) =>
        this.offlineMutation(input, fallback),
    };
    Object.assign(
      this,
      createSyncApi(context),
      createProductivityApi(context),
      createFocusProductivityApi(context),
      createAuthApi(context),
      createGrowthApi(context),
      createDeckStudyApi(context),
      createPreferencesApi(context),
      createBudgetApi(context),
      createGymApi(context),
      createUsageApi(context),
    );
  }

  setOfflineMutationHandler(handler: OfflineMutationHandler | null) {
    this.offlineMutationHandler = handler;
  }

  enqueueOfflineMutation<T>(input: OfflineMutationInput<T>, fallback: () => Promise<T>): Promise<T> {
    return this.offlineMutation(input, fallback);
  }

  async get<T>(path: string, init?: RequestInit & { params?: Record<string, any> }): Promise<{ data: T }> {
    let url = path;
    if (init?.params) {
      const cleanParams: Record<string, string> = {};
      Object.entries(init.params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) cleanParams[k] = String(v);
      });
      const search = new URLSearchParams(cleanParams).toString();
      if (search) url += (url.includes('?') ? '&' : '?') + search;
    }
    const res = await this.request<T>(url, { method: 'GET', ...init });
    return { data: res };
  }

  async post<T>(path: string, body?: any, init?: RequestInit): Promise<{ data: T }> {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const headers: Record<string, string> = { ...(init?.headers as any) };
    if (!isFormData) headers['Content-Type'] = 'application/json';
    const res = await this.request<T>(path, {
      method: 'POST',
      body: isFormData ? body : JSON.stringify(body),
      headers,
      ...init,
    });
    return { data: res };
  }

  async patch<T>(path: string, body?: any, init?: RequestInit): Promise<{ data: T }> {
    const res = await this.request<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json', ...(init?.headers as any) },
      ...init,
    });
    return { data: res };
  }

  async delete<T>(path: string, init?: RequestInit): Promise<{ data: T }> {
    const res = await this.request<T>(path, { method: 'DELETE', ...init });
    return { data: res };
  }

  private offlineMutation<T>(input: OfflineMutationInput<T>, fallback: () => Promise<T>): Promise<T> {
    return this.offlineMutationHandler ? this.offlineMutationHandler(input) : fallback();
  }
}

export const api = new ApiClient();
