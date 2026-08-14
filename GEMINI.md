# RTK - Rust Token Killer

**Usage**: Token-optimized CLI proxy (cuts up to 90% of bash output)

## Meta Commands (always use rtk directly)

```bash
rtk gain              # Show token savings analytics
rtk gain --history    # Show command usage history with savings
rtk discover          # Analyze Claude Code history for missed opportunities
rtk proxy <cmd>       # Execute raw command without filtering (for debugging)
```

## Installation Verification

```bash
rtk --version         # Should show: rtk X.Y.Z
rtk gain              # Should work (not "command not found")
which rtk             # Verify correct binary
```

⚠️ **Name collision**: If `rtk gain` fails, you may have reachingforthejack/rtk (Rust Type Kit) installed instead.

## Hook-Based Usage

All other commands are automatically rewritten by the Claude Code hook.
Example: `git status` → `rtk git status` (transparent, 0 tokens overhead)

# Antigravity Workflow Adapter

The canonical instructions for this repository are [`AGENTS.md`](AGENTS.md) and the documents it references under `agent_docs/`.

Before planning, implementing, testing, reviewing, or updating documentation:

1. Read and follow `AGENTS.md`.
2. Read `agent_docs/project_guidelines.md` and only the project context relevant to the selected route and task.
3. Read `agent_docs/ubiquitous_language.md` and use its canonical terms (avoiding its flagged aliases) in code, UI copy, API contracts, and documentation.
4. Select and apply the **Direct** or **Sub-agent** route automatically as defined in [`agent_docs/workflows/route_selection.md`](agent_docs/workflows/route_selection.md), including its working state, context loading, implementation, verification, and documentation responsibilities.
5. Treat the active Antigravity agent as the main agent. It owns route selection and all main-agent documentation duties.
6. Use only Antigravity-native workers when the Sub-agent route permits delegation.
7. Never invoke Codex CLI, Codex SDK, `codex exec`, `codex mcp-server`, or any other external coding-agent runtime as a worker or subagent.
8. If suitable Antigravity-native workers are unavailable, follow the Sub-agent-to-Direct fallback in [`agent_docs/workflows/route_selection.md`](agent_docs/workflows/route_selection.md) and continue implementation directly.
9. Ensure macOS application and test builds maintain consistent code signing (Apple Development certificate + stable Team ID) across builds to preserve Keychain access. Never pass `CODE_SIGNING_ALLOWED=NO` or `CODE_SIGN_IDENTITY="-"` during standard development or verification runs.



Do not duplicate project policy in Antigravity-specific files. If an Antigravity-specific instruction conflicts with `AGENTS.md` or `agent_docs/project_guidelines.md`, the canonical repository files take precedence.

