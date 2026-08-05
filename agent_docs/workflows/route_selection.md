# Route Selection

This document defines the two workflow routes used by coding agents in this repository: **Direct** and **Sub-agent**. It is referenced from the root `AGENTS.md`; the per-route procedures live alongside it in [`agent_docs/workflows/direct_route.md`](direct_route.md) and [`agent_docs/workflows/subagent_route.md`](subagent_route.md).

## Routes

| Route | What you do | Subagents |
| --- | --- | --- |
| **Direct** | Perform the work yourself | Never |
| **Sub-agent** | Orchestrate native subagents | Yes |

A **route** is the workflow committed to for the entire session. It determines the working state, context loading, whether subagents may be spawned, and documentation duties.

## Automatic Selection

The main agent selects a route **automatically** at session start, based on task scope and complexity; the user does not need to name a route.

1. Default to the **Direct** route. It covers general queries, document editing, and implementation tasks that a single agent can complete reliably and efficiently.
2. Choose the **Sub-agent** route when the task is large and complex enough that parallel, independently owned work packages reduce total time or risk, and the active tool provides suitable native subagents.
3. If the user explicitly names a route, apply it for the entire session.
4. Enter the working state that matches the chosen route.

## Working States

At any moment the session is in exactly one working state:

| State | Meaning | Applies when |
| --- | --- | --- |
| `deployment state` | Beginning to plan a broad task, or deploying a plan that may span multiple sessions | Sub-agent route, or Direct route deploying a large plan |
| `leaf state` | A task outside a deployed plan: general queries, document editing, or small file/module/tool changes | Direct route |

## Route → Working State

| Route | Working state |
| --- | --- |
| Direct | `leaf state`, or `deployment state` when deploying a large plan |
| Sub-agent | `deployment state` |

## Codex Model Policy

For Codex sessions, the top-level model is fixed at session start and cannot be changed mid-session by `AGENTS.md`. Map each route to its model and reasoning:

| Route | Top-level model | Reasoning | Notes |
| --- | --- | --- | --- |
| Direct | `gpt-5.6-luna` | `high` | No subagents |
| Sub-agent | `gpt-5.6-sol` | `medium` | Every spawned subagent uses `gpt-5.6-luna` with `high` |

- A plain `codex` launch uses the project default and therefore starts in the Direct-route model configuration.
- **If the selected route does not match the active top-level model and reasoning effort, stop before repository work and ask the user to relaunch with the route launcher.** Do not emulate a top-level model switch by spawning a replacement agent.

### DeepSeek profile (`deepseek-v4-flash`)

When the active profile is `deepseek-v4-flash` (Codex running against the DeepSeek API), the top-level model is `deepseek-v4-flash` and only the **Direct** route is valid:

- Always implement directly; never spawn subagents.
- The Sub-agent route is unavailable under this profile because the DeepSeek API does not provide native subagent orchestration. If the Sub-agent route is ever selected, apply the Sub-agent-to-Direct fallback below and do not emulate a model switch by spawning a replacement agent.

## Route Behaviors

**Direct route.** Perform the task yourself, whatever its size. Do not spawn subagents. Read and follow [`agent_docs/workflows/direct_route.md`](direct_route.md).

**Sub-agent route.** Act as an orchestrator and coordinate native subagents to deploy large tasks or plans in `deployment state`. Read and follow [`agent_docs/workflows/subagent_route.md`](subagent_route.md). Follow the subagent rules in `AGENTS.md` (Agent Efficiency).

## Sub-agent-to-Direct Fallback

If the Sub-agent route is selected but the active tool cannot provide suitable native subagents, automatically execute the work through the Direct route:

- Preserve the Sub-agent route's task decomposition, acceptance criteria, verification gates, documentation duties, and recorded state.
- Do not invoke Codex or another external agent to replace missing native capability.

## Context Loading

**Direct route (`leaf state`).** Read only files relevant to the current task.

**On first entering `deployment state`.** Load the foundational project context in one bounded read-only batch, in this order:

1. [`agent_docs/project_overview.md`](../project_overview.md)
2. [`agent_docs/project_structure.md`](../project_structure.md)
3. [`agent_docs/project_progress.md`](../project_progress.md)
4. [`agent_docs/latest_session_work.md`](../latest_session_work.md)

After the batch returns, interpret `project_overview.md` and `project_structure.md` first, then reconcile `project_progress.md` and `latest_session_work.md` against that interpretation. This interpretation order does not require separate tool calls.

Then:

- Read only relevant module documentation. Expand source inspection only when repository evidence requires it.
- Reconstruct active tasks, dependencies, verification state, and blockers. Resolve contradictions with targeted evidence.
- Under the Sub-agent route, after delegation, review only critical hunks and integration boundaries — unless risk, missing evidence, or conflicting results require broader inspection.

## Documentation Responsibility by Route

Documentation responsibility follows the selected route, not the agent product.

| Route | Who owns what |
| --- | --- |
| Direct | Update relevant durable or module documentation only when verified facts from the task warrant it. Do not edit `project_progress.md` or `latest_session_work.md` unless the user explicitly requests it or a durable plan is being deployed. |
| Sub-agent | The top-level orchestrator exclusively owns `project_progress.md` and `latest_session_work.md`, consolidates verified native-worker evidence, and follows [`agent_docs/workflows/subagent_route.md`](subagent_route.md). |
| Sub-agent-to-Direct fallback | Remains in `deployment state`; the main agent assumes the Direct-route documentation duties. |

## Handoff Documents (restricted)

`agent_docs/project_progress.md` and `agent_docs/latest_session_work.md` are designed for smooth handoff between sessions in deployment mode.

- They may only be edited in `deployment state` or when the user explicitly requests it.
- The main agent is responsible for updating them; subagents are not allowed to edit them.
