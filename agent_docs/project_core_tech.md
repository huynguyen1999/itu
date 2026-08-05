# Project Core Technologies

## Backend

- Node.js 20 or newer with Yarn Classic 1.22.
- NestJS 11 on the Fastify adapter.
- Prisma 6 with PostgreSQL persistence and additive migrations.
- RabbitMQ 4 for scheduled, sync, and AI jobs.
- Redis 7 is provisioned locally for future infrastructure but is not currently required by the application code.
- `class-validator` and DTOs for transport validation, Zod where the existing API contracts use schema validation, and Winston for logging.
- Jest, Supertest, TypeScript, SWC, and ts-jest for verification.

## Web

- React 19 with Vite 6 and strict TypeScript.
- TanStack Query 5 owns server state.
- Tailwind CSS 3, Radix UI primitives, shadcn/ui conventions, and Lucide icons provide the UI foundation.
- Vitest and Testing Library provide focused browser tests.
- IndexedDB stores the offline cache, mutation outbox, cursor, conflicts, and lease state.
- BroadcastChannel coordinates same-origin tabs; WebSocket invalidation coordinates other devices.
- ULIDs provide deterministic client-generated entity identity.

## Native macOS

- SwiftUI and Xcode project structure under `macos/`.
- AVFoundation provides native audio playback for Focus.
- Native persistence and synchronization mirror the server-compatible offline snapshot and mutation outbox model documented in `macos/ROADMAP.md`.

## Local infrastructure

`infras.docker-compose.yml` provisions PostgreSQL, Redis, and RabbitMQ. The application README requires PostgreSQL, RabbitMQ, Docker Compose for recommended local infrastructure, and an explicitly approved or disposable database before migration deployment.
