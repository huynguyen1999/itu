# iTu Project Guidelines

These are the project-specific rules moved out of the root workflow file. They supplement the general agent workflow in the root `AGENTS.md`.

## 1. Project Context

iTu is a personal productivity and learning application.

Durable project context is maintained under `agent_docs/`. Read only the documents relevant to the current task.

| Document | Contents |
| --- | --- |
| [`project_overview.md`](project_overview.md) | Goals, architecture, workflows, and major decisions |
| [`project_core_tech.md`](project_core_tech.md) | Special technologies and architectural constraints |
| [`project_structure.md`](project_structure.md) | Directory layout, modules, components, and ownership boundaries |
| [`project_progress.md`](project_progress.md) | Active implementation plan and cross-session execution status |
| [`project_diary.md`](project_diary.md) | Durable architecture decisions, discarded approaches, and lessons |
| [`latest_session_work.md`](latest_session_work.md) | Previous-session summary and unfinished work |
| Module-specific documents | Present when a module has its own documentation |

General rules:

- Read this file and only the project context relevant to the selected route and task.
- Update durable documentation only with verified facts.
- Never delete a main project document without warning the user and receiving a second explicit confirmation.

## 2. Safety Rules (Highest Priority)

- Never delete data unless explicitly instructed by the user.
- Never modify production configuration or target live databases without explicit approval.
- Never commit secrets, API tokens, private keys, or real credentials. Use `.env.example` templates.
- Never disable authentication, authorization, guards, or security filters.
- Never disable SSL or security validation features.
- Never modify CI/CD pipelines or GitHub workflows without approval.
- Never change environment variables unless requested.
- Do not log passwords, tokens, OAuth payloads, private notes, or task reminder content.

## 3. Scope and Anti-Hallucination

- Solve only the explicitly requested problem and keep diffs minimal and focused.
- Do not improve or reformat unrelated code.
- Preserve formatting in untouched files.
- Never invent code, methods, package APIs, test results, benchmark data, API responses, or database schemas.
- Inspect exact files and authoritative source code before using symbols or types.

## 4. Development and Package Rules

- For `web/`, run `yarn dev` inside `web/` for Vite development at `http://localhost:5173`.
- For `api/`, run `yarn dev` inside `api/` for NestJS development at `http://localhost:3000`.
- Do not run production builds inside interactive iteration loops unless doing final validation.
- Use Yarn Classic 1.22 inside `api/` and `web/`.
- Do not run `npm` or `pnpm`, and do not create `package-lock.json` or `pnpm-lock.yaml`.
- Do not add external dependencies without explaining why; prefer existing utilities and standard language features.

## 5. Architecture and Refactoring Rules

- Do not alter the existing architecture or directory structure without explicit permission.
- Preserve API hexagonal layering: `core/domain`, `core/application`, `infrastructure/transport`, `infrastructure/persistence`, and `features`.
- Do not bypass application ports, move domain logic into controllers, or change hexagonal boundary responsibilities.
- In the web app, TanStack Query owns server state. Local React state is reserved for ephemeral UI and forms.
- Keep feature code in `web/src/features/<feature-name>` and shared code in `web/src/shared`.
- Do not introduce Redux, Zustand, MobX, or another state-management library.
- Do not rename top-level directories, move existing files, or alter folder hierarchies without approval.
- Do not introduce new architectural patterns or wrapper abstractions unless requested.
- Reuse existing services, avoid circular dependencies, and preserve public APIs, routes, exported types, and existing behavior.

## 6. Database and Prisma Rules

- Never edit an existing committed migration in `api/prisma/migrations`.
- Create additive migrations with `yarn prisma:migration:create`.
- Never drop tables or columns without explicit approval.
- Never rename columns without a backwards-compatible migration plan.
- Never perform destructive migrations automatically.
- Verify `DATABASE_URL` targets an approved or disposable database before `yarn prisma:deploy`.
- Use transactions for multi-record operations, idempotency keys for retryable events, UTC timestamps, and opaque ULIDs for sync-capable entities.

## 7. Testing, Logging, and Code Style

Before reporting a completed task, execute and verify:

```text
API:   cd api && yarn typecheck && yarn test --runInBand && yarn build
Web:   cd web && yarn typecheck && yarn test && yarn build
macOS: cd macos && xcodebuild -project iTu.xcodeproj -scheme iTu -configuration Debug -destination 'platform=macOS' -derivedDataPath ../build/DerivedData CODE_SIGNING_ALLOWED=NO test
```

Explicitly report any command that could not run. Use the shared NestJS/Winston logger in backend code; never use `console.log`. Preserve request IDs and correlation context. Do not remove existing log statements unless instructed.

- Use strict TypeScript with no implicit `any`.
- Prefer early returns and focused functions.
- Validate transport inputs with `class-validator` DTOs and do not expose raw Prisma entities as public contracts.
- Define status values, filter names, business strings, and repeated regexes as constants or enums in dedicated constant files.
- Prefer Prisma-generated enums or local `as const` objects over inline business strings.
- Replace long nested condition chains with lookup tables, dispatch maps, or pattern arrays.

## 8. Design Principles

### 8.1 Modular Design (required)

The project must strictly follow modular design. Each module must have:

- A clear responsibility.
- A clear interface.
- Minimal unnecessary coupling.
- A structure that makes it easy to test, debug, replace, extend, and reuse.

Nested modules are allowed when they make responsibilities clearer. Avoid placing unrelated responsibilities into the same file, class, service, or large function.

### 8.2 Acceptance and Verification (required)

- Define proportionate acceptance and verification requirements **before** implementation.
- Keep related tests cohesive enough to avoid fragmented micro-tests, but never reduce meaningful coverage, weaken assertions, or hide failures merely to save tokens or execution time.

## 9. Git, File, and Communication Rules

- Never run `git commit`, `git push`, `git push --force`, `git branch -d`, or rewrite history unless explicitly instructed.
- Do not rename files unless necessary and do not move directories without approval.
- Update `README.md` if system architecture or setup requirements change.
- If requirements are ambiguous, ask for clarification and state assumptions.

## 10. Definition of Done

- Run the API, web, and macOS verification commands in section 7 when applicable (macOS whenever the change touches `macos/` or affects cross-client parity).
- Report concrete test/build evidence.
- Confirm the relevant `ROADMAP.md` was updated when task status or a milestone changes.
- Never claim unrun checks passed.

## 11. Offline-First Architecture and Client-Backend Communication

The web client writes supported mutations locally first, persists them to IndexedDB, and synchronizes asynchronously through the existing queue. Do not bypass this design.

### 11.1 Core Principles

- Every supported mutation is optimistically applied to TanStack Query and persisted to IndexedDB before a network request.
- Mutations are flushed when online, after a 1.5-second enqueue debounce, and every 15 seconds while the tab is visible.
- Sync-capable entities use client-generated Crockford base-32 ULIDs.
- `deviceId` identifies a browser installation and `clientInstanceId` identifies a tab session.

### 11.2 Synchronization Protocol

Sync is push-then-pull. The client pushes queued mutations, then pulls server changes after its cursor.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/sync` | Combined push and pull round trip |
| `POST` | `/sync/mutations` | Push queued mutations |
| `GET` | `/sync/changes` | Pull changes after a cursor |

Mutation records contain a ULID `id`, `kind`, `entityId`, `baseVersion`, `baseValues`, `payload`, and `occurredAt`. The server returns acknowledged mutation IDs, conflicts, and mutation outcomes. Pull responses contain a cursor and complete or partial upsert/delete change records.

### 11.3 Cache and Reconciliation

- Route writes through `SyncProvider` and the existing API mutation helpers.
- `applySyncChanges()` updates matching TanStack Query caches optimistically.
- `invalidateSyncChanges()` selectively reconciles server data and secondary queries.
- The query cache is persisted to IndexedDB and hydrated before the UI renders.
- Keep `QUERY_PREFIXES` and `OPTIMISTIC_INSERT_PREFIXES` current when adding syncable entities.

### 11.4 Real-Time Invalidation

- The API notifies other registered devices through `/ws/sync` after applying mutations.
- The client registers its sync device before connecting the WebSocket.
- WebSocket invalidations trigger a pull through `SyncQueue`.
- Preserve the existing reconnect and permanent-session-close behavior.

### 11.5 Multi-Tab Coordination

- Use the existing `itu-sync-v1` BroadcastChannel for outbox and sync-response coordination.
- IndexedDB lease arbitration ensures only one tab flushes at a time.
- Preserve mutation coalescing for consecutive updates to the same entity.

### 11.6 Retry and Conflict Resolution

- Preserve exponential backoff with jitter and server `Retry-After` precedence.
- Authentication and client errors are non-retryable.
- Automatically rebase conflicts where only status changed.
- Persist semantic conflicts for explicit `keepServer()`, `keepMine()`, or `retryPending()` resolution.

### 11.7 Architectural Rules for Offline Features

- Never call sync endpoints directly from feature code.
- Do not rename IndexedDB stores or key paths without a migration plan; the current database version is `1`.
- Do not bypass the queue for mutations that need cross-device propagation.
- Register a new entity in cache invalidation maps and add an API sync handler when it becomes offline-syncable.
- Do not change sync endpoint contracts, cursor format, or mutation payloads without updating client and server together.
- Reuse the existing `SyncPhase` values: `offline`, `pending`, `syncing`, `up-to-date`, and `conflict`.

## 12. Frontend and Product Design

- Follow `agent_docs/frontend_design_guidelines.md` for the shared product language, interaction principles, accessibility requirements, cross-client consistency, and frontend work style.
- Follow `agent_docs/web_client_guidelines.md` for work under `web/` and `agent_docs/swiftui_client_guidelines.md` for work under `macos/`.
- Inspect and reuse existing design tokens, theme values, and shared controls before adding a new visual treatment or component.
- Preserve behavioral, terminology, status, and API-contract parity between web and macOS without forcing pixel-identical layouts or non-native interactions.
- Define acceptance criteria for behavior, affected states, responsive or resizable layout, accessibility, and visual QA before implementation.
- Keep verification proportional to risk: focused behavioral coverage plus real rendering and interaction QA. Do not weaken meaningful tests, but do not create fragmented tests for static styling details.
- Treat screenshots and visual inspection as evidence for layout and appearance only; they do not replace tests for state, data, synchronization, or accessibility behavior.

### 12.1 Mandatory Cross-Client Parity Application

When a change modifies a feature, behavior, API contract, terminology, or status meaning that also exists in the macOS client, apply the corresponding change under `macos/` in the same task. Do not leave the native client out of scope unless you explicitly justify why the change does not affect it.

- Before declaring a change web-only or API-only, check `macos/ROADMAP.md` and `macos/PARITY_AUDIT.md` for the current native parity contract.
- If a change is intentionally web-only or API-only, state the reason (for example, "native parity tracked in `macos/ROADMAP.md` as a follow-up") in the completion report and Definition of Done.
- Follow `agent_docs/swiftui_client_guidelines.md` when implementing the macOS side.
