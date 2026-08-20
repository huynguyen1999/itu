const api = globalThis.browser ?? globalThis.chrome;
const text = (id, value) => { document.querySelector(`#${id}`).textContent = value; };
const duration = (seconds) => seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;

async function refresh() {
  const [status, usage, outbox] = await Promise.all([
    api.runtime.sendMessage({ type: "getStatus" }),
    api.runtime.sendMessage({ type: "getUsage" }),
    api.runtime.sendMessage({ type: "getOutbox" })
  ]);
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const rows = usage.filter((row) => row.localDate === date);
  const total = rows.reduce((sum, row) => sum + row.activeSeconds, 0);
  const current = rows.sort((left, right) => right.activeSeconds - left.activeSeconds)[0];
  text("status", status.status[0].toUpperCase() + status.status.slice(1));
  text("current", current?.hostname ?? "No HTTP(S) page");
  text("today", duration(total));
  text("sync", outbox.some((item) => ["FAILED", "BLOCKED"].includes(item.state)) ? "Needs attention" : "Synced");
  text("queued", String(outbox.length));
  document.querySelector("#pause").disabled = !status.websiteTrackingEnabled;
}

document.querySelector("#pause").addEventListener("click", async () => {
  await api.runtime.sendMessage({ type: "saveSettings", settings: { websiteTrackingEnabled: false } });
  await refresh();
});

refresh().catch(() => text("status", "Disconnected"));
