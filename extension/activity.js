export const BROWSER_BUNDLE_ID = "com.microsoft.edgemac";
export const BROWSER_DISPLAY_NAME = "Microsoft Edge";
export const UPLOAD_ALARM = "upload-browser-activity";
export const UPLOAD_PERIOD_MINUTES = 0.5;
export const MAX_ELAPSED_SECONDS = 60;
export const LOCAL_RETENTION_DAYS = 7;

export function normalizeHostname(value) {
  return normalizeTrackedUrl(value)?.hostname ?? null;
}

export function normalizeTrackedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hostname = url.hostname.replace(/\.$/, "").toLowerCase();
    if (!hostname) return null;
    url.hostname = hostname;
    url.hash = "";
    url.username = "";
    url.password = "";
    const normalizedUrl = url.toString();
    if (normalizedUrl.length > 2048) return null;
    return { hostname, url: normalizedUrl };
  } catch {
    return null;
  }
}

export function normalizeApiBaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}

export function stateForTab(tab) {
  if (!tab) return { hostname: null };
  return normalizeTrackedUrl(tab.url) ?? { hostname: null };
}

export function addElapsed(totals, state, startedAt, endedAt) {
  const elapsed = Math.min(MAX_ELAPSED_SECONDS, Math.floor((endedAt - startedAt) / 1000));
  if (!state?.hostname || !state?.url || elapsed <= 0) return totals;
  const date = new Date(endedAt);
  const localDate = [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const key = `${localDate}\u0000${BROWSER_BUNDLE_ID}\u0000${state.url}`;
  const current = totals[key];
  totals[key] = {
    localDate,
    browserBundleId: BROWSER_BUNDLE_ID,
    browserDisplayName: BROWSER_DISPLAY_NAME,
    hostname: state.hostname,
    url: state.url,
    timezone,
    activeSeconds: Math.min(86_400, (current?.activeSeconds ?? 0) + elapsed)
  };
  return totals;
}

export function pruneTotals(totals, at = Date.now()) {
  const cutoff = new Date(at);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - LOCAL_RETENTION_DAYS + 1);
  const cutoffDate = [cutoff.getFullYear(), String(cutoff.getMonth() + 1).padStart(2, "0"), String(cutoff.getDate()).padStart(2, "0")].join("-");
  for (const [key, summary] of Object.entries(totals)) {
    if (summary.localDate < cutoffDate) delete totals[key];
  }
  return totals;
}
