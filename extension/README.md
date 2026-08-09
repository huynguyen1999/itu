# iTu Browser Activity for Chromium

This dependency-free Manifest V3 extension aggregates opted-in URL usage and sends cumulative daily summaries directly to the iTu API.

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

The extension measures the active tab in the focused normal or InPrivate window. It stores the normalized HTTP(S) URL and hostname, including paths and queries but excluding fragments and embedded credentials. Statistics groups totals by hostname and provides URL detail. Non-HTTP(S) tabs are ignored, and backend access is requested only for the origin you configure.

The popup shows today’s active time as a domain share chart with a ranked domain list. Select a domain to open its URL detail panel.

Website summaries are saved locally before upload and retried by the background alarm when the backend is unavailable. Failed summaries are retained in the browser for up to 7 days.
