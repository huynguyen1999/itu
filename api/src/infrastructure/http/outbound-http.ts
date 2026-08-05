import { Agent, setGlobalDispatcher } from 'undici';
import { CONFIG_KEYS, HTTP_CLIENT_CONSTANTS } from '@core/application/constants/app.constants';

export function configureOutboundHttp() {
  setGlobalDispatcher(
    new Agent({
      connect: { timeout: numberEnv(CONFIG_KEYS.httpConnectTimeoutMs, HTTP_CLIENT_CONSTANTS.defaultConnectTimeoutMs) },
      keepAliveMaxTimeout: numberEnv(
        CONFIG_KEYS.httpKeepAliveMaxTimeoutMs,
        HTTP_CLIENT_CONSTANTS.defaultKeepAliveMaxTimeoutMs,
      ),
      keepAliveTimeout: numberEnv(CONFIG_KEYS.httpKeepAliveTimeoutMs, HTTP_CLIENT_CONSTANTS.defaultKeepAliveTimeoutMs),
    }),
  );
}

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = numberEnv(CONFIG_KEYS.httpRequestTimeoutMs, HTTP_CLIENT_CONSTANTS.defaultRequestTimeoutMs),
) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
  return fetch(input, { ...init, signal });
}

export function streamFetchTimeoutMs() {
  return numberEnv(CONFIG_KEYS.httpStreamTimeoutMs, HTTP_CLIENT_CONSTANTS.defaultStreamTimeoutMs);
}

function numberEnv(key: string, fallback: number): number {
  const parsed = Number(process.env[key]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
