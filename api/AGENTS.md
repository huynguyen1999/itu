# API Repository Guidance

- This repository contains the standalone iTu NestJS API using Fastify, Prisma, and PostgreSQL.
- Keep domain and application logic separate from NestJS, Prisma, and transport adapters.
- Use Yarn Classic and keep `yarn.lock`; do not add `package-lock.json`.
- Validate external input with DTOs and do not expose Prisma records directly.
- Enforce ownership in use cases or repositories and use transactions for multi-step writes.
- Add unit tests for business logic and integration or end-to-end coverage for critical flows.
- Keep secrets in `.env`; never commit them or log tokens, passwords, or raw OAuth payloads.
- Run `yarn typecheck`, `yarn test`, and `yarn build` for relevant changes.
