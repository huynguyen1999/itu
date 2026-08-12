const rangeElement = document.querySelector("#range");
const searchElement = document.querySelector("#search");
const privateElement = document.querySelector("#private");
const syncElement = document.querySelector("#sync");
const fromElement = document.querySelector("#from");
const toElement = document.querySelector("#to");
const fromWrap = document.querySelector("#from-wrap");
const toWrap = document.querySelector("#to-wrap");
const rangeTotalElement = document.querySelector("#range-total");
const summaryElement = document.querySelector("#summary");
const trendElement = document.querySelector("#trend");
const donutElement = document.querySelector("#domain-donut");
const donutTotalElement = document.querySelector("#donut-total");
const domainsElement = document.querySelector("#domains");
const sessionsElement = document.querySelector("#sessions");
const domainCountElement = document.querySelector("#domain-count");
const sessionCountElement = document.querySelector("#session-count");
const syncDiagnosticElement = document.querySelector("#sync-diagnostic");
const syncStatusElement = document.querySelector("#sync-status");
let sessions = [];
let outbox = [];
let projections = [];
let selectedDomain = "";
let selectedUrl = "";

const CHART_COLORS = ["#167f71", "#3fb6a4", "#e19a2e", "#e2725b", "#8b6fc9"];
const dateText = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const days = (count) => { const end = new Date(); end.setHours(23, 59, 59, 999); const start = new Date(end); start.setDate(start.getDate() - count + 1); start.setHours(0, 0, 0, 0); return [dateText(start), dateText(end)]; };
const duration = (seconds) => seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
const timeText = (value) => value ? new Date(value).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "Unknown time";

function selectedDates() {
  if (rangeElement.value === "custom") return [fromElement.value, toElement.value];
  return days({ today: 1, "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[rangeElement.value] ?? 1);
}

function sessionItem(row) {
  const item = document.createElement("li");
  item.className = "session-item";
  item.title = row.url;

  const header = document.createElement("div");
  header.className = "session-header";
  const time = document.createElement("span");
  time.className = "session-time";
  time.textContent = `${timeText(row.startedAt)} – ${timeText(row.endedAt)}`;
  const sessionDuration = document.createElement("span");
  sessionDuration.className = "session-duration";
  sessionDuration.textContent = duration(row.activeSeconds);
  header.append(time, sessionDuration);
  if (row.incognito) {
    const privacy = document.createElement("span");
    privacy.className = "session-privacy";
    privacy.textContent = "Private";
    header.append(privacy);
  }

  const title = document.createElement("strong");
  title.className = "session-title";
  title.textContent = row.title || row.hostname;
  const url = document.createElement("span");
  url.className = "session-url";
  url.textContent = row.url;
  item.append(header, title, url);
  return item;
}

function domainItem(domain, seconds, total, matches, index) {
  const item = document.createElement("li");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "domain-button";
  button.setAttribute("aria-pressed", String(domain === selectedDomain));
  button.addEventListener("click", () => {
    selectedDomain = selectedDomain === domain ? "" : domain;
    selectedUrl = "";
    render();
  });

  const row = document.createElement("span");
  row.className = "domain-row";
  const swatch = document.createElement("span");
  swatch.className = "legend-swatch";
  swatch.style.setProperty("--swatch", CHART_COLORS[index % CHART_COLORS.length]);
  const label = document.createElement("span");
  label.className = "domain-label";
  label.textContent = domain;
  const time = document.createElement("span");
  time.className = "domain-time";
  time.textContent = `${duration(seconds)} · ${Math.round(seconds / Math.max(1, total) * 100)}%`;
  row.append(swatch, label, time);
  const bar = document.createElement("span");
  bar.className = "domain-bar";
  const fill = document.createElement("span");
  fill.style.width = `${seconds / Math.max(1, total) * 100}%`;
  bar.append(fill);
  button.append(row, bar);
  item.append(button);

  if (selectedDomain === domain) {
    const urls = new Map();
    for (const entry of projections.filter((entry) => entry.hostname === domain && matches(entry))) {
      const key = `${entry.incognito ? "private" : "normal"}\u0000${entry.url}`;
      urls.set(key, (urls.get(key) ?? 0) + entry.activeSeconds);
    }
    const list = document.createElement("ul");
    list.className = "domain-urls";
    for (const [key, urlSeconds] of urls) {
      const urlItem = document.createElement("li");
      const urlButton = document.createElement("button");
      urlButton.type = "button";
      urlButton.className = "url-button";
      urlButton.setAttribute("aria-pressed", String(selectedUrl === key));
      urlButton.addEventListener("click", () => { selectedDomain = domain; selectedUrl = selectedUrl === key ? "" : key; render(); });
      const urlLabel = document.createElement("span");
      urlLabel.className = "url-label";
      urlLabel.textContent = key.split("\u0000")[1];
      const urlTime = document.createElement("span");
      urlTime.className = "url-time";
      urlTime.textContent = duration(urlSeconds);
      urlButton.append(urlLabel, urlTime);
      urlItem.append(urlButton);
      list.append(urlItem);
    }
    item.append(list);
  }
  return item;
}

function render() {
  const [from, to] = selectedDates();
  if (rangeElement.value === "custom" && (!from || !to || from > to)) {
    rangeTotalElement.textContent = "0m";
    summaryElement.textContent = "Choose a valid range to see activity.";
    domainCountElement.textContent = "";
    sessionCountElement.textContent = "";
    trendElement.replaceChildren();
    domainsElement.replaceChildren();
    sessionsElement.replaceChildren();
    return;
  }

  const query = searchElement.value.trim().toLowerCase();
  const matches = (session) => session.localDate >= from && session.localDate <= to && (privateElement.value === "all" || (privateElement.value === "private") === Boolean(session.incognito)) && (!query || `${session.hostname} ${session.url} ${session.title ?? ""}`.toLowerCase().includes(query));
  const rows = projections.filter(matches).filter((row) => (!selectedDomain || row.hostname === selectedDomain) && (!selectedUrl || `${row.incognito ? "private" : "normal"}\u0000${row.url}` === selectedUrl));
  const detailRows = sessions.filter(matches).filter((row) => (!selectedDomain || row.hostname === selectedDomain) && (!selectedUrl || `${row.incognito ? "private" : "normal"}\u0000${row.url}` === selectedUrl));
  const total = rows.reduce((sum, row) => sum + row.activeSeconds, 0);
  rangeTotalElement.textContent = duration(total);
  summaryElement.textContent = `${from || "—"} → ${to || "—"}`;

  const trendSource = rangeElement.value === "today" ? detailRows : rows;
  const byDay = new Map();
  const byDomain = new Map();
  for (const row of trendSource) {
    let bucket = row.localDate;
    if (rangeElement.value === "today" && row.startedAt) bucket = `${row.localDate} ${new Date(row.startedAt).getHours()}`;
    else if (["90d", "1y"].includes(rangeElement.value)) { const date = new Date(`${row.localDate}T00:00:00`); date.setDate(date.getDate() - date.getDay()); bucket = dateText(date); }
    byDay.set(bucket, (byDay.get(bucket) ?? 0) + row.activeSeconds);
  }
  for (const row of rows) byDomain.set(row.hostname, (byDomain.get(row.hostname) ?? 0) + row.activeSeconds);
  if (rangeElement.value === "today" && !trendSource.length) byDay.set("today", total);

  const max = Math.max(1, ...byDay.values());
  let angle = 0;
  donutElement.style.setProperty("--chart", [...byDomain.values()].map((seconds, index) => { const end = angle + seconds / Math.max(1, total) * 100; const value = `${CHART_COLORS[index % CHART_COLORS.length]} ${angle}% ${end}%`; angle = end; return value; }).join(", ") || "#e4e9e6 0 100%");
  donutTotalElement.textContent = duration(total);
  trendElement.replaceChildren(...[...byDay.entries()].sort().map(([day, seconds]) => { const bar = document.createElement("span"); bar.title = `${day}: ${duration(seconds)}`; bar.style.height = `${Math.max(5, seconds / max * 100)}%`; return bar; }));

  const domains = [...byDomain.entries()].sort((a, b) => b[1] - a[1]);
  domainCountElement.textContent = `${domains.length} tracked`;
  sessionCountElement.textContent = `${detailRows.length} ${detailRows.length === 1 ? "session" : "sessions"}`;
  domainsElement.replaceChildren(...domains.map(([domain, seconds], index) => domainItem(domain, seconds, total, matches, index)));
  sessionsElement.replaceChildren(...detailRows.sort((a, b) => b.startedAt - a.startedAt).map(sessionItem), ...(detailRows.length ? [] : [Object.assign(document.createElement("li"), { className: "empty-row", textContent: "Exact session detail unavailable for legacy-only totals." })]));

  const matchingOutbox = outbox.filter((item) => syncElement.value === "all" || item.state.toLowerCase() === syncElement.value);
  syncDiagnosticElement.textContent = `Sync: ${matchingOutbox.length} ${syncElement.value} · ${outbox.filter((item) => item.state === "FAILED").length} failed · ${outbox.filter((item) => item.state === "BLOCKED").length} blocked`;
  syncStatusElement.textContent = matchingOutbox.length ? `${matchingOutbox.length} ${syncElement.value}` : "Synced";
}

async function refresh() {
  [projections, sessions, outbox] = await Promise.all([chrome.runtime.sendMessage({ type: "getUsage" }), chrome.runtime.sendMessage({ type: "getSessions" }), chrome.runtime.sendMessage({ type: "getOutbox" })]);
  render();
}

rangeElement.addEventListener("change", () => { const custom = rangeElement.value === "custom"; fromWrap.hidden = !custom; toWrap.hidden = !custom; render(); });
for (const element of [searchElement, privateElement, syncElement, fromElement, toElement]) element.addEventListener("input", render);
document.querySelector("#clear-range").addEventListener("click", async () => { const [from, to] = selectedDates(); if (!from || !to || !confirm("Clear the selected local activity?")) return; await chrome.runtime.sendMessage({ type: "clearUsage", from, to }); await refresh(); });
document.querySelector("#clear-all").addEventListener("click", async () => { if (!confirm("Clear all local activity? Connection settings will be preserved; remote history is unchanged.")) return; await chrome.runtime.sendMessage({ type: "clearUsage", all: true }); await refresh(); });
document.querySelector("#reset-all").addEventListener("click", async () => { if (!confirm("Reset local activity, connection settings, DSN, and installation identity? Remote history is not deleted.")) return; if (!confirm("Final confirmation: permanently reset this browser's local activity and configuration?")) return; await chrome.runtime.sendMessage({ type: "resetUsage" }); await refresh(); });
if (navigator.storage?.estimate) navigator.storage.estimate().then(({ usage = 0 }) => { const node = document.querySelector("#data-management"); node.textContent = `Local data: ${(usage / 1024).toFixed(1)} KB · since this installation`; });
refresh().catch(() => { summaryElement.textContent = "Could not load local activity."; });
