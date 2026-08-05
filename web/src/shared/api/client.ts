import { HttpClient } from './httpClient';
export { API_BASE_URL } from './httpClient';
import { createAuthApi, type AuthApi } from './authApi';
import { createDeckStudyApi, type DeckStudyApi } from './deckStudyApi';
import { createFocusProductivityApi, type FocusProductivityApi } from './focusProductivityApi';
import { createGrowthApi, type GrowthApi } from './growthApi';
import { createProductivityApi, type ProductivityApi } from './productivityApi';
import { createSyncApi, type SyncApi } from './syncApi';
import type { ApiClientContext, OfflineMutationHandler, OfflineMutationInput } from './apiContext';

export type { OfflineMutationHandler, OfflineMutationInput } from './apiContext';
export type * from './types';

export interface ApiClient extends SyncApi, ProductivityApi, FocusProductivityApi, AuthApi, GrowthApi, DeckStudyApi {}

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
    );
  }

  setOfflineMutationHandler(handler: OfflineMutationHandler | null) {
    this.offlineMutationHandler = handler;
  }

  private offlineMutation<T>(input: OfflineMutationInput<T>, fallback: () => Promise<T>): Promise<T> {
    return this.offlineMutationHandler ? this.offlineMutationHandler(input) : fallback();
  }
}

export const api = new ApiClient();
