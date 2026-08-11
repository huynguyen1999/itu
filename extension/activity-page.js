const rangeElement = document.querySelector("#range");
const searchElement = document.querySelector("#search");
const privateElement = document.querySelector("#private");
const syncElement = document.querySelector("#sync");
const fromElement = document.querySelector("#from");
const toElement = document.querySelector("#to");
const fromWrap = document.querySelector("#from-wrap");
const toWrap = document.querySelector("#to-wrap");
const summaryElement = document.querySelector("#summary");
const trendElement = document.querySelector("#trend");
const donutElement = document.querySelector("#domain-donut");
const domainsElement = document.querySelector("#domains");
const sessionsElement = document.querySelector("#sessions");
const syncStatusElement = document.querySelector("#sync-status");
let sessions = [];
let outbox = [];
let projections = [];
let selectedDomain = "";
let selectedUrl = "";

const dateText = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const days = (count) => { const end = new Date(); end.setHours(23, 59, 59, 999); const start = new Date(end); start.setDate(start.getDate() - count + 1); start.setHours(0, 0, 0, 0); return [dateText(start), dateText(end)]; };
const duration = (seconds) => seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;

function selectedDates() {
  if (rangeElement.value === "custom") return [fromElement.value, toElement.value];
  return days({ today: 1, "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[rangeElement.value] ?? 1);
}

function render() {
  const [from, to] = selectedDates();
  if (rangeElement.value === "custom" && (!from || !to || from > to)) { summaryElement.textContent = "Choose a valid custom range (From must be on or before To)."; trendElement.replaceChildren(); domainsElement.replaceChildren(); sessionsElement.replaceChildren(); return; }
  const query = searchElement.value.trim().toLowerCase();
  const matches = (session) => session.localDate >= from && session.localDate <= to && (privateElement.value === "all" || (privateElement.value === "private") === Boolean(session.incognito)) && (!query || `${session.hostname} ${session.url} ${session.title ?? ""}`.toLowerCase().includes(query));
  const rows = projections.filter(matches).filter((row) => (!selectedDomain || row.hostname === selectedDomain) && (!selectedUrl || `${row.incognito ? "private" : "normal"}\u0000${row.url}` === selectedUrl));
  const detailRows = sessions.filter(matches).filter((row) => (!selectedDomain || row.hostname === selectedDomain) && (!selectedUrl || `${row.incognito ? "private" : "normal"}\u0000${row.url}` === selectedUrl));
  const total = rows.reduce((sum, row) => sum + row.activeSeconds, 0);
  summaryElement.textContent = `${duration(total)} active · ${rows.length} session${rows.length === 1 ? "" : "s"} · ${from || "—"} to ${to || "—"}`;
  const trendSource = rangeElement.value === "today" ? detailRows : rows;
  const byDay = new Map(); const byDomain = new Map();
  for (const row of trendSource) { let bucket = row.localDate; if (rangeElement.value === "today" && row.startedAt) bucket = `${row.localDate} ${new Date(row.startedAt).getHours()}`; else if (["90d", "1y"].includes(rangeElement.value)) { const date = new Date(`${row.localDate}T00:00:00`); date.setDate(date.getDate() - date.getDay()); bucket = dateText(date); } byDay.set(bucket, (byDay.get(bucket) ?? 0) + row.activeSeconds); }
  for (const row of rows) byDomain.set(row.hostname, (byDomain.get(row.hostname) ?? 0) + row.activeSeconds);
  if (rangeElement.value === "today" && !trendSource.length) byDay.set("today", total);
  const max = Math.max(1, ...byDay.values());
  let angle = 0; donutElement.style.setProperty("--chart", [...byDomain.values()].map((seconds, index) => { const end = angle + seconds / Math.max(1, total) * 100; const value = `${["#167f71", "#3fb6a4", "#e19a2e", "#e2725b", "#8b6fc9"][index % 5]} ${angle}% ${end}%`; angle = end; return value; }).join(", ") || "#e4e9e6 0 100%");
  trendElement.replaceChildren(...[...byDay.entries()].sort().map(([day, seconds]) => { const bar = document.createElement("span"); bar.title = `${day}: ${duration(seconds)}`; bar.style.height = `${Math.max(5, seconds / max * 100)}%`; return bar; }));
  domainsElement.replaceChildren(...[...byDomain.entries()].sort((a, b) => b[1] - a[1]).map(([domain, seconds]) => { const item = document.createElement("li"); const button = document.createElement("button"); button.type = "button"; button.textContent = `${domain} — ${duration(seconds)}`; button.addEventListener("click", () => { selectedDomain = selectedDomain === domain ? "" : domain; selectedUrl = ""; render(); }); item.append(button); const urls = new Map(); for (const row of projections.filter((row) => row.hostname === domain && matches(row))) urls.set(`${row.incognito ? "private" : "normal"}\u0000${row.url}`, (urls.get(`${row.incognito ? "private" : "normal"}\u0000${row.url}`) ?? 0) + row.activeSeconds); const list = document.createElement("ul"); for (const [key, secondsForUrl] of urls) { const urlButton = document.createElement("button"); urlButton.type = "button"; urlButton.textContent = `${key.split("\u0000")[1]} — ${duration(secondsForUrl)}`; urlButton.addEventListener("click", () => { selectedDomain = domain; selectedUrl = key; render(); }); const urlItem = document.createElement("li"); urlItem.append(urlButton); list.append(urlItem); } item.append(list); return item; }));
  sessionsElement.replaceChildren(...detailRows.sort((a, b) => b.startedAt - a.startedAt).map((row) => { const item = document.createElement("li"); item.textContent = `${new Date(row.startedAt).toLocaleTimeString()}–${new Date(row.endedAt).toLocaleTimeString()} · ${row.title || row.hostname} · ${duration(row.activeSeconds)}${row.incognito ? " · Private" : ""} · ${row.url}`; item.title = row.url; return item; }), ...(detailRows.length ? [] : [Object.assign(document.createElement("li"), { textContent: "Exact session detail unavailable for legacy-only totals." })]));
  const matchingOutbox = outbox.filter((item) => syncElement.value === "all" || item.state.toLowerCase() === syncElement.value);
  document.querySelector("#sync-diagnostic").textContent = `Sync: ${matchingOutbox.length} ${syncElement.value} · ${outbox.filter((item) => item.state === "FAILED").length} failed · ${outbox.filter((item) => item.state === "BLOCKED").length} blocked`;
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
