# Web Architecture

The web client is a React/Vite application organized by product feature. TanStack Query owns server state; shared authentication and synchronization providers establish the application-wide transport and offline behavior.

[Back to system overview](README.md) · [Web client guidelines](../web_client_guidelines.md)

## Structure

```text
web/src/
  main.tsx                    Global provider composition
  App.tsx                     Routes and application shell composition
  features/                   Product-owned screens and behavior
  shared/
    api/                      Typed API facade and endpoint groups
    auth/                     Authentication provider and session behavior
    sync/                     IndexedDB store, outbox, reconciliation, sockets
    ui/                       Shared presentation primitives and layout
    browser/                  Safe browser capability wrappers
    hooks/, utils/, constants/
    editor/, markdown/        Shared editing and rendering behavior
  styles/                     Tokens and application styling
```

Feature-specific behavior stays in `features`; behavior shared across product areas belongs in `shared`. [`App.tsx`](../../web/src/App.tsx) composes feature-owned surfaces such as the Planning sidebar and global Focus timer into the shared layout.

## Current feature surfaces

[`App.tsx`](../../web/src/App.tsx) currently exposes:

- **Home and planning:** Today, Plan, Inbox, Upcoming, Projects, task details, and the Eisenhower Matrix.
- **Focus and Habits:** the Focus workspace, global Focus timer, Habit tracking, occurrence actions, progress, and history.
- **Learning:** Flashcard Decks, deck details, review, and Learning History under the Learn workspace.
- **Growth:** Attributes, Skills, Shop, Inventory-facing actions, ledger, settings, and Growth Receipt overlays.
- **Journal:** Note and Weekly Review browsing/editing, tags/templates,
  attachments, revisions, Trash, and read-only Budget/Gym summaries.
- **Budget:** overview, transactions, budgets/categories, and calendar views.
- **Gym:** overview, active workouts, exercise library, and workout history.
- **Account and operations:** authentication, profile, settings, Statistics, sync/conflict status, and recoverable Trash.

`features/ai` supplies AI-assisted learning behavior rather than a standalone route. Legacy Journal money/gym URLs redirect to the dedicated Budget and Gym workspaces.

Budget Transactions and Gym Workouts are owned by their dedicated feature
surfaces and sync entities; they are not Journal Entry kinds. Journal writes
use the `journal.*`, `journal_attachment.delete`, `journal_revision.restore`,
`journal_template.*`, and `journal_tag.create` mutation kinds through the
shared outbox.

## Application composition

```mermaid
flowchart TB
    Root["main.tsx"]
    Query["QueryClientProvider"]
    Auth["AuthProvider"]
    Sync["SyncProvider"]
    Theme["ThemeProvider"]
    Undo["UndoStackProvider"]
    Router["BrowserRouter"]
    App["App routes"]
    Layout["Layout + feature slots"]
    Features["Feature pages"]

    Root --> Query --> Auth --> Sync --> Theme --> Undo --> Router --> App
    App --> Layout --> Features
```

Provider order matters: synchronization consumes authenticated API state and TanStack Query caches; feature routes then consume all three.

## API and authentication

[`client.ts`](../../web/src/shared/api/client.ts) is the stable API facade. Endpoint groups receive the shared request context rather than implementing transport independently. [`httpClient.ts`](../../web/src/shared/api/httpClient.ts) owns the base URL, access token, refresh behavior, timeouts, and authenticated requests.

[`AuthProvider.tsx`](../../web/src/shared/auth/AuthProvider.tsx) stores the user profile in safe local storage, but the access token remains in the API client’s runtime state. Refresh uses the server-managed cookie; logout clears both local identity and the in-memory token.

```mermaid
sequenceDiagram
    participant Feature
    participant Facade as API facade
    participant HTTP as Shared HTTP client
    participant API
    participant Auth as AuthProvider

    Feature->>Facade: Typed read or direct mutation
    Facade->>HTTP: Request path and body
    HTTP->>API: Bearer-authenticated REST
    alt Access token expired
        HTTP->>API: Refresh using HTTP-only cookie
        API-->>HTTP: New access token
        HTTP->>API: Retry original request
    end
    API-->>Feature: Typed result
    Auth->>Facade: Login, logout, profile, OAuth operations
```

## State ownership

| State | Owner |
| --- | --- |
| Server query results | TanStack Query |
| Supported optimistic entities | TanStack Query plus durable IndexedDB cache |
| Pending mutations and conflicts | IndexedDB `OfflineSyncStore` |
| Sync cursor and cross-tab lease | IndexedDB `OfflineSyncStore` |
| Authenticated user identity | `AuthProvider` plus safe local storage |
| Access token | Shared HTTP client memory |
| Forms and temporary interaction | Feature-local React state |

Do not add another application state store for data already owned by these layers.

## Offline-first mutation flow

[`SyncProvider.tsx`](../../web/src/shared/sync/SyncProvider.tsx) installs the offline mutation handler used by the API facade. [`syncQueue.ts`](../../web/src/shared/sync/syncQueue.ts) defines mutation/conflict behavior, while [`offlineStore.ts`](../../web/src/shared/sync/offlineStore.ts) provides IndexedDB durability and the cross-tab synchronization lease.

```mermaid
sequenceDiagram
    participant Feature
    participant APIClient as API offlineMutation
    participant Query as TanStack Query
    participant IDB as IndexedDB
    participant Sync as SyncProvider leader
    participant Server as POST /sync

    Feature->>APIClient: Supported mutation with optimistic result
    APIClient->>IDB: Persist mutation
    APIClient->>Query: Apply optimistic cache update
    APIClient-->>Feature: Return immediately
    Sync->>IDB: Acquire lease and read outbox/cursor
    Sync->>Server: Push mutations and pull changes
    Server-->>Sync: Acks, outcomes, conflicts, changes, cursor
    Sync->>IDB: Remove acks and store conflicts/cache/cursor
    Sync->>Query: Reconcile authoritative changes
```

Unsupported or explicitly online operations use a direct REST fallback. The offline mutation input therefore includes both the optimistic value and the online fallback; features should call the API facade rather than the sync endpoint directly.

Shared sync owns lifecycle, transport, queues, conflicts, persistence, and
generic cache reconciliation. Product interpretation belongs to the owning
feature. For example, Planning owns task behavior and Growth owns Growth
receipts; the sync layer does not decide feature business policy.

## Planning and Calendar composition

[`MatrixPage.tsx`](../../web/src/features/planning/MatrixPage.tsx) composes
matrix data, selection, ordering, toolbar/dialog controls, and the
[`MatrixTaskGrid.tsx`](../../web/src/features/planning/components/MatrixTaskGrid.tsx)
surface. [`CalendarTimeline.tsx`](../../web/src/features/calendar/components/CalendarTimeline.tsx)
coordinates timeline state while Day/Week/Month view pieces live in
`CalendarTimelineViews.tsx`. The existing task, calendar, drag, and resize
algorithms remain feature-local and unchanged.

## Cross-tab and cross-device refresh

```mermaid
flowchart LR
    TabA["Tab A mutation"] --> IDB[("Shared IndexedDB outbox")]
    TabA --> Channel["BroadcastChannel"]
    Channel --> TabB["Tab B cache refresh"]
    TabA --> Lease["Single sync lease holder"]
    Lease --> API["POST /sync"]
    API --> Socket["SYNC_AVAILABLE WebSocket message"]
    Socket --> Other["Other browser or device"]
    Other --> API
```

[`syncIdentity.ts`](../../web/src/shared/sync/syncIdentity.ts) gives a browser installation a stable device ID and each tab a separate client instance ID. [`syncWebSocketClient.ts`](../../web/src/shared/sync/syncWebSocketClient.ts) reconnects the invalidation channel. BroadcastChannel coordinates sibling tabs; WebSockets coordinate separate connections and devices.

## Reading a feature

1. Start at the route in [`App.tsx`](../../web/src/App.tsx).
2. Follow the page into its `features/<area>` queries and mutations.
3. Follow API calls through [`client.ts`](../../web/src/shared/api/client.ts) to the endpoint group.
4. If it calls `offlineMutation`, inspect the cache reconciliation in [`syncCache.ts`](../../web/src/shared/sync/syncCache.ts) and the matching API mutation handler.
5. Keep reusable UI in `shared/ui`, but keep product decisions in the feature or API use case that owns them.

## Current-state boundaries

- Offline support is entity-specific; the existence of `SyncProvider` does not make every REST mutation offline-capable.
- TanStack Query remains authoritative for rendered server state even when IndexedDB persists a dehydrated cache.
- WebSocket payloads are invalidations only and must not be treated as authoritative entity data.
- Browser-extension tracking is configured from web settings but runs independently of the web client.
- Money is transported as decimal strings; product date boundaries use the
  `Asia/Ho_Chi_Minh` Product Calendar while instants remain UTC.

Feature-to-feature imports are migration-sensitive: new consumers should use a
feature's public root export instead of reaching into another feature's
implementation files. Existing deep imports are reported by the architecture
check until their ownership is clarified.
