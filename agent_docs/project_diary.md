# Project Diary

## 2026-08-03 — Two routes with automatic selection

The route model was reduced from three routes (Light/Medium/Heavy) to two: **Direct** (perform the work yourself, never spawn subagents) and **Sub-agent** (orchestrate native subagents). The main agent now selects the route **automatically** at session start based on task scope and complexity, defaulting to Direct and escalating to Sub-agent only for large, parallelizable work with suitable native subagents; the user may still override by naming a route.

Routing content moved out of `AGENTS.md` into [`agent_docs/workflows/route_selection.md`](workflows/route_selection.md), with per-route procedures in [`agent_docs/workflows/direct_route.md`](workflows/direct_route.md) (former Medium, extended to cover all direct work) and [`agent_docs/workflows/subagent_route.md`](workflows/subagent_route.md) (former Heavy). The old `medium_route.md` and `heavy_route.md` were deleted. Project context, design principles, and the documentation inventory moved into [`agent_docs/project_guidelines.md`](project_guidelines.md). `AGENTS.md` now holds only the runtime-neutral workflow plus a concise routing summary.

`GEMINI.md` and `.roo/rules/00-project-workflow.md` were updated to select the Direct or Sub-agent route automatically and reference the new files. This is a documentation-only boundary; it does not alter API contracts, web synchronization behavior, database schema, or native macOS behavior.

## 2026-08-02 — Separate workflow policy from project policy

The root `AGENTS.md` now contains the reusable Codex workflow: route selection, context loading, batching, working states, and temporal-efficiency guidance. iTu-specific safety, architecture, package, database, testing, logging, Git, and offline-first rules are maintained in `agent_docs/project_guidelines.md` so the generic workflow can remain close to its source template without discarding project constraints.

This is a documentation-only boundary; it does not alter API contracts, web synchronization behavior, database schema, or native macOS behavior.
