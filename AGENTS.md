# AGENTS.md

Canonical operating instructions for AI coding agents in this repository.

**Scope.** This file governs how any AI agent plans, executes, verifies, and documents work. It is runtime-neutral: it applies whether the active tool is Codex, Roo Code, Antigravity, or another compatible coding agent.

**Deference.** Tool-specific instruction files such as `GEMINI.md` and `.roo/rules/*` are adapters to this workflow. They must defer to this file and must not maintain a separate copy of project policy.

## 1. Instruction Priority

When instructions conflict, resolve them in this order (highest first):

1. This file (`AGENTS.md`).
2. [`agent_docs/project_guidelines.md`](agent_docs/project_guidelines.md) — project context, safety, architecture, technology, database, testing, and offline-first rules.
3. [`agent_docs/ubiquitous_language.md`](agent_docs/ubiquitous_language.md) — the canonical domain terms and their aliases-to-avoid for code, UI copy, API contracts, documentation, and communication.
4. Workflow documents under `agent_docs/workflows/` — [`agent_docs/workflows/workflow.md`](agent_docs/workflows/workflow.md) for standard workflow procedures.
5. Tool-specific adapters (`GEMINI.md`, `.roo/rules/*`).

## 2. Core Concepts

### 2.1 Agent Role

The active top-level agent owns planning, decomposition, architecture, synthesis, product judgment, integration, and final proof. Perform the work directly.

### 2.2 Domain Language

Before writing code, UI copy, API contracts, or documentation, consult [`agent_docs/ubiquitous_language.md`](agent_docs/ubiquitous_language.md) and use its canonical terms. Avoid the aliases it flags, do not introduce parallel vocabulary for existing concepts, and extend the glossary when a new domain concept needs a name.

## 3. Non-Negotiable Boundaries

These rules never change. Violating them is a hard error.

- **R1. No external agent runtimes.** Never invoke another coding-agent runtime through a CLI, SDK, API, MCP server, subprocess, or similar integration to perform repository work.
- **R2. Roo Code / Antigravity → Codex ban.** Roo Code and Antigravity must not invoke Codex CLI, the Codex SDK, `codex exec`, `codex mcp-server`, or Codex agents.

## 4. Tool Execution and Batching

For each bounded work stage, identify independent, already-known, non-conflicting tool calls before invoking tools. When practical, execute them through one batching-capable outer call provided by the active runtime (for example, Codex `functions.exec` or Code Mode `exec`).

### 4.1 Promise Semantics

- Use `Promise.allSettled()` when successful results remain useful even if another call fails. Inspect and attribute every returned result.
- Use `Promise.all()` only when any individual failure invalidates the entire batch.

### 4.2 Prefer to Batch in Parallel

- Read-only file inspection.
- Independent symbol, text, and call-site searches.
- Repository metadata and status collection.
- Independent log or artifact inspection.
- Validation commands that do not share mutable state.

### 4.3 Keep Sequential

- A result that determines the next operation.
- Adaptive investigation where the next target is not yet known.
- Approvals or permission boundaries.
- Overlapping or order-sensitive writes.
- Git staging, commits, resets, or other Git-state mutations.
- Builds or tests sharing a build directory, generated output, database, port, fixture, or other mutable resource.

### 4.4 Anti-Patterns

- Do not split an otherwise batchable inspection across repeated outer tool calls.
- Do not create extra work, broaden scope, or obscure failure attribution merely to fill a batch.
- Tool-call concurrency is local to one agent thread. It does not change scope boundaries or report limits.

## 5. Platform-Specific Paths

Paths in this workflow are written using `/` as a platform-neutral separator.

- On macOS and Linux, use `/`.
- On Windows, use the equivalent Windows path format and `\\` where required.
- Resolve every path using the conventions of the current environment.

## 6. macOS Build and Code Signing

When building or verifying the macOS client:

- **Consistent Code Signing Across Builds.** macOS application and test builds must maintain consistent code signing (automatic signing with Apple Development certificate and stable Team ID).
- **Avoid Disabling Signing for App or Test Builds.** Do not pass `CODE_SIGNING_ALLOWED=NO` or `CODE_SIGN_IDENTITY="-"` for `xcodebuild build` or `xcodebuild test`. Using ad-hoc or disabled signing breaks macOS Keychain ACL recognition across rebuilds and causes macOS to prompt for system passwords on every test run.

## 7. Reusable Codex Agent Routing

The main Codex session is the Sol lead and owns planning, architecture,
delegation, integration, and final decisions. Subagents are bounded workers:

| Role | Model | Scope |
| --- | --- | --- |
| `coder` | `gpt-5.6-luna` | Implement assigned code and run focused checks |
| `researcher` | `gpt-5.6-luna` | Read-only repository and official-doc research |
| `browser_debugger` | `gpt-5.6-luna` | Read-only Chrome DevTools reproduction and evidence |
| `reviewer` | `gpt-5.6-terra` | Read-only diff review for correctness and risk |

Never spawn or configure a Sol subagent. Prefer the named roles above, select
the role and model explicitly, and use fresh context (`fork_turns = "none"`
when supported; otherwise `fork_context = false`). Use one subagent by
default, at most two for independent non-overlapping work, and close workers
after their bounded task completes. Every delegated prompt must include its
scope, paths, constraints, acceptance criteria, and required verification.
