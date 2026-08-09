const form = document.querySelector("#settings");
const statusElement = document.querySelector("#status");
const errorElement = document.querySelector("#error");
const websiteElement = document.querySelector("#website");
const apiUrlElement = document.querySelector("#api-url");
const dsnKeyElement = document.querySelector("#dsn-key");
const pieChartElement = document.querySelector("#pie-chart");
const usageTotalElement = document.querySelector("#usage-total");
const usageSubtitleElement = document.querySelector("#usage-subtitle");
const usageLegendElement = document.querySelector("#usage-legend");
const usageCardElement = document.querySelector(".usage-card");
const domainListWrapElement = document.querySelector("#domain-list-wrap");
const domainListElement = document.querySelector("#domain-list");
const usageCountElement = document.querySelector("#usage-count");
const usageEmptyElement = document.querySelector("#usage-empty");
const domainDetailElement = document.querySelector("#domain-detail");
const detailDomainElement = document.querySelector("#detail-domain");
const detailSummaryElement = document.querySelector("#detail-summary");
const detailListElement = document.querySelector("#detail-list");
const detailCloseElement = document.querySelector("#detail-close");
const settingsPanelElement = document.querySelector("#settings-panel");

const CHART_COLORS = ["#167f71", "#3fb6a4", "#e19a2e", "#e2725b", "#8b6fc9", "#4f8fcf"];
let selectedHostname = null;
let latestSummaries = [];

function localDate() {
  const date = new Date();
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function displayUrl(value) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}${url.search}`;
  } catch {
    return value;
  }
}

function summarizeDomains(rows) {
  const domains = new Map();
  for (const row of rows) {
    const hostname = row.hostname ?? (() => {
      try { return new URL(row.url).hostname; } catch { return null; }
    })();
    if (!hostname) continue;
    const domain = domains.get(hostname) ?? { hostname, activeSeconds: 0, urls: new Map() };
    domain.activeSeconds += row.activeSeconds;
    const url = row.url ?? hostname;
    domain.urls.set(url, (domain.urls.get(url) ?? 0) + row.activeSeconds);
    domains.set(hostname, domain);
  }
  return [...domains.values()]
    .map((domain) => ({ ...domain, urls: [...domain.urls.entries()].map(([url, activeSeconds]) => ({ url, activeSeconds })).sort((left, right) => right.activeSeconds - left.activeSeconds) }))
    .sort((left, right) => right.activeSeconds - left.activeSeconds);
}

function renderDomainDetail(domain) {
  const open = Boolean(domain);
  domainDetailElement.hidden = !open;
  usageCardElement.classList.toggle("detail-open", open);
  if (!open) {
    detailListElement.replaceChildren();
    return;
  }
  detailDomainElement.textContent = domain.hostname;
  detailSummaryElement.textContent = `${formatDuration(domain.activeSeconds)} active · ${domain.urls.length} URL${domain.urls.length === 1 ? "" : "s"}`;
  detailListElement.replaceChildren(...domain.urls.map((row) => {
    const item = document.createElement("li");
    const rowElement = document.createElement("div");
    rowElement.className = "detail-row";
    const urlElement = document.createElement("span");
    urlElement.className = "detail-url";
    urlElement.title = row.url;
    urlElement.textContent = displayUrl(row.url);
    const timeElement = document.createElement("span");
    timeElement.className = "detail-time";
    timeElement.textContent = formatDuration(row.activeSeconds);
    rowElement.append(urlElement, timeElement);
    const bar = document.createElement("div");
    bar.className = "detail-bar";
    const fill = document.createElement("span");
    fill.style.width = `${row.activeSeconds / domain.activeSeconds * 100}%`;
    bar.append(fill);
    item.append(rowElement, bar);
    return item;
  }));
}

function renderUsage(summaries = []) {
  latestSummaries = summaries;
  const rows = summaries
    .filter((summary) => summary.localDate === localDate() && summary.activeSeconds > 0)
    .sort((left, right) => right.activeSeconds - left.activeSeconds);
  const domains = summarizeDomains(rows);
  const total = rows.reduce((sum, row) => sum + row.activeSeconds, 0);
  usageTotalElement.textContent = formatDuration(total);
  usageSubtitleElement.textContent = total ? `${domains.length} domain${domains.length === 1 ? "" : "s"} · active today` : "No HTTP(S) activity yet";
  usageEmptyElement.hidden = Boolean(total);
  domainListWrapElement.hidden = !total;
  usageCountElement.textContent = total ? `${domains.length} tracked` : "";
  pieChartElement.setAttribute("aria-label", total ? `${formatDuration(total)} active across ${domains.length} domains today` : "No website activity recorded");

  if (!total) {
    selectedHostname = null;
    pieChartElement.style.setProperty("--chart", "#e4e9e6 0 100%");
    usageLegendElement.replaceChildren();
    domainListElement.replaceChildren();
    renderDomainDetail(null);
    return;
  }

  const chartRows = domains.slice(0, CHART_COLORS.length);
  const otherSeconds = domains.slice(CHART_COLORS.length).reduce((sum, row) => sum + row.activeSeconds, 0);
  const chartParts = chartRows.map((row, index) => ({ ...row, color: CHART_COLORS[index] }));
  if (otherSeconds) chartParts.push({ hostname: "Other domains", activeSeconds: otherSeconds, color: "#93a39d" });
  let angle = 0;
  pieChartElement.style.setProperty("--chart", chartParts.map((row) => {
    const end = angle + row.activeSeconds / total * 100;
    const part = `${row.color} ${angle}% ${end}%`;
    angle = end;
    return part;
  }).join(", "));

  usageLegendElement.replaceChildren(...chartParts.slice(0, 5).map((row) => {
    const item = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.setProperty("--swatch", row.color);
    const label = document.createElement("span");
    label.className = "legend-label";
    label.textContent = row.hostname;
    const percentage = document.createElement("strong");
    percentage.textContent = `${Math.round(row.activeSeconds / total * 100)}%`;
    item.append(swatch, label, percentage);
    return item;
  }));

  domainListElement.replaceChildren(...domains.map((domain, index) => {
    const item = document.createElement("li");
    const share = domain.activeSeconds / total * 100;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "domain-button";
    button.setAttribute("aria-pressed", String(domain.hostname === selectedHostname));
    button.addEventListener("click", () => {
      selectedHostname = domain.hostname;
      renderUsage(latestSummaries);
    });
    const rowElement = document.createElement("div");
    rowElement.className = "domain-row";
    const swatch = document.createElement("span");
    swatch.className = "legend-swatch";
    swatch.style.setProperty("--swatch", CHART_COLORS[index % CHART_COLORS.length]);
    const domainElement = document.createElement("span");
    domainElement.className = "domain-label";
    domainElement.textContent = domain.hostname;
    const timeElement = document.createElement("span");
    timeElement.className = "domain-time";
    timeElement.textContent = `${Math.round(share)}%`;
    rowElement.append(swatch, domainElement, timeElement);
    const bar = document.createElement("div");
    bar.className = "domain-bar";
    const fill = document.createElement("span");
    fill.style.width = `${share}%`;
    bar.append(fill);
    button.append(rowElement, bar);
    item.append(button);
    return item;
  }));

  const selectedDomain = domains.find((domain) => domain.hostname === selectedHostname);
  renderDomainDetail(selectedDomain);
}

function render(status) {
  statusElement.textContent = status.status[0].toUpperCase() + status.status.slice(1);
  statusElement.dataset.status = status.status;
  websiteElement.checked = Boolean(status.websiteTrackingEnabled);
  apiUrlElement.value = status.apiBaseUrl ?? "";
  dsnKeyElement.value = status.dsnKey ?? "";
  if (status.status === "configuration needed") settingsPanelElement.open = true;
}

async function refresh() {
  try {
    const [status, usage] = await Promise.all([
      chrome.runtime.sendMessage({ type: "getStatus" }),
      chrome.runtime.sendMessage({ type: "getUsage" })
    ]);
    render(status);
    renderUsage(usage);
  } catch {
    statusElement.textContent = "Disconnected";
    statusElement.dataset.status = "disconnected";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorElement.textContent = "";
  try {
    const url = new URL(apiUrlElement.value);
    const originPattern = `${url.origin}/*`;
    if (!(await chrome.permissions.request({ origins: [originPattern] }))) {
      throw new Error("Backend access was not allowed.");
    }
    render(await chrome.runtime.sendMessage({
      type: "saveSettings",
      settings: {
        websiteTrackingEnabled: websiteElement.checked,
        apiBaseUrl: apiUrlElement.value,
        dsnKey: dsnKeyElement.value
      }
    }));
  } catch (error) {
    errorElement.textContent = error instanceof Error ? error.message : "Could not save the connection.";
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "status") {
    render(message.status);
    refresh();
  }
});

detailCloseElement.addEventListener("click", () => {
  selectedHostname = null;
  renderUsage(latestSummaries);
});

refresh();
