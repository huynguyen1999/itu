import { HttpClient } from './httpClient';

export const globalHttpClient = new HttpClient();

export async function authenticatedFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  return globalHttpClient.request<T>(url, options);
}

export default authenticatedFetch;
