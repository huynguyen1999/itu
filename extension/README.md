# iTu Browser Activity

This dependency-free Manifest V3 engine records opted-in browser activity as raw sessions in IndexedDB, projects daily URL/domain totals locally, and uploads sessions through a durable outbox. Chromium and iOS Safari use the same `activity.js` and `controller.js`; browser APIs stay behind adapters.

## Chromium setup

1. Run the API and web app, then sign in to iTu.
2. Open **Settings → Sync & Data**. Enable foreground and website activity tracking.
3. Generate a new browser-extension DSN key and copy both the backend URL and key.
4. Open `edge://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this `extension/` directory.
5. Open the extension's **Details** page and enable **Allow in InPrivate**.
6. Open the extension popup, paste the backend URL and DSN key, enable tracking, and choose **Save connection**.

The key uses `Authorization: DSN …` only for browser ingestion; it is not a login bearer token.

## iPhone Safari setup without the App Store

The existing `ios/iTu` application contains the `iTuSafariExtension` target. Select the `iTu` scheme and a registered physical iPhone in Xcode, then use **Product → Run**. The signed development build embeds and installs the extension; no App Store publication, TestFlight build, or “load unpacked” flow is involved.

After installation, open **Settings → Apps → Safari → Extensions**, enable **iTu Browser Activity**, and grant website access. The iOS app supplies only account-scoped configuration through `group.com.itu.ios`; Safari JavaScript stores and uploads website sessions directly to the API. Private Browsing collection is off by default.

## Verify

```sh
cd extension
node --test
```

The extension measures the active tab in the focused normal or InPrivate window. It stores a normalized HTTP(S) URL and hostname (path retained; credentials, query strings, and fragments removed), page title, privacy state, and a stable session ID. Sessions shorter than three seconds are ignored; adjacent matching sessions merge only within 30 seconds. Non-HTTP(S) tabs are ignored, and backend access is requested only for the origin you configure.

The popup shows today’s active time as a domain share chart with a ranked domain list. Select a domain to open its URL detail panel.

Raw sessions and the outbox are saved locally before upload. Acknowledged raw sessions expire after 90 days; unacknowledged sessions remain until uploaded. Upload batches contain at most 100 sessions; transient failures retry after 2/4/8 seconds with jitter, then remain failed until connectivity or a manual retry signal. Logout pauses upload without deleting the active account's local queue, and queues never change account ownership.
