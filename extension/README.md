# iTu Browser Activity for Chromium

This dependency-free Manifest V3 extension records opted-in browser activity as raw sessions in IndexedDB, projects daily URL/domain totals locally, and uploads sessions through a durable outbox.

## Configure

1. Run the API and web app, then sign in to iTu.
2. Open **Settings → Sync & Data**. Enable foreground and website activity tracking.
3. Generate a new browser-extension DSN key and copy both the backend URL and key.
4. Open `edge://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this `extension/` directory.
5. Open the extension's **Details** page and enable **Allow in InPrivate**.
6. Open the extension popup, paste the backend URL and DSN key, enable tracking, and choose **Save connection**.

The key uses `Authorization: DSN …` only for `POST /usage/websites/ingest`; it is not a login bearer token. Regenerating it invalidates the prior key.

## Verify

```sh
cd extension
node --test
```

The extension measures the active tab in the focused normal or InPrivate window. It stores a normalized HTTP(S) URL and hostname (path retained; credentials, query strings, and fragments removed), page title, privacy state, and a stable session ID. Sessions shorter than three seconds are ignored; adjacent matching sessions merge only within 30 seconds. Non-HTTP(S) tabs are ignored, and backend access is requested only for the origin you configure.

The popup shows today’s active time as a domain share chart with a ranked domain list. Select a domain to open its URL detail panel.

Raw sessions and the outbox are saved locally before upload and retained without a seven-day pruning window. Upload batches contain at most 100 sessions; transient failures retry after 2/4/8 seconds with jitter, then remain failed until connectivity or a manual retry signal. Open **Open full activity history** from the popup for Today, 7D, 30D, 90D, 1Y, or custom ranges, trend/domain/session details, search, private-window, and sync-state filters.
