# iTu for macOS

Native SwiftUI client for iTu. The application targets macOS 14 or later and includes a full window plus a menu-bar companion.

## Current capabilities

- Email or username authentication against the existing iTu API.
- Per-account offline task storage in Application Support.
- Local-first task creation, editing, completion, reopening, and deletion.
- A persistent mutation outbox using the existing iTu ULID and sync contracts.
- Push-then-pull reconciliation through `/sync/mutations` and `/sync/changes`.
- WebSocket invalidation through `/ws/sync`, with a 15-second reconciliation fallback.
- Persistent manual sync conflicts.
- Today, Inbox, Completed, Focus, and Conflicts views.
- A Focus-only menu-bar panel with a remaining-time or circular-progress label and full Focus Session controls.
- An optional local Focus Policy that hides selected applications and redirects matching Safari or Chromium-family tabs while a work phase is running.
- A native adaptation of the web client’s botanical-sanctuary design system, including its forest navigation rail, planning hierarchy, mint accents, paper surfaces, and compact task vocabulary.
- Configurable API base URL in Settings.

Raw task data and queued mutations are written atomically before a network request begins. A cached user can continue to work with their local data when session refresh or network access is unavailable.

## Open and run

1. Open `iTu.xcodeproj` in Xcode 26 or later.
2. Select the `iTu` scheme and the local Mac destination.
3. Run the application.
4. The development API defaults to `http://localhost:3000`. Change it under iTu → Settings when needed.

The application is sandboxed. It requests outbound network access, user-selected read access for choosing applications, and Apple Events access to enabled browsers for the optional Focus Policy. Signing credentials and generated build products are not stored in the repository.

## Verify

```sh
xcodebuild \
  -project iTu.xcodeproj \
  -scheme iTu \
  -configuration Debug \
  -destination 'platform=macOS' \
  -derivedDataPath build/DerivedData \
  CODE_SIGNING_ALLOWED=NO \
  test
```

See [ROADMAP.md](./ROADMAP.md) for the remaining feature-parity and system-integration work.
