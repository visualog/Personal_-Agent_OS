# Personal Agent OS

Personal Agent OS is a local-first AI agent assistant designed around gradual autonomy, high intelligence, and inspectable trust.

The first project artifact is an issue-ready MVP plan, now split into implementation-facing documentation:

- [Personal Agent OS MVP Issue Plan](docs/plans/2026-04-21-personal-agent-os-mvp-issue-plan.md)
- [Documentation Index](docs/README.md)

## Current Status

The core runtime, trust controls, regression coverage, and Command Center view model are implemented.

The repository now also includes a first runnable web prototype at `apps/web` that presents:

- task list
- approval queue
- task detail
- risk flags
- timeline and audit records

This UI is fed by a runtime-backed demo snapshot generated from the core orchestrator before `dev:web` and `build:web`, so the browser reflects real command-center state shapes rather than hand-written mock objects.

When the Vite dev server is running, the preview also exposes a thin local API for:

- `GET /api/command-center/state`
- `POST /api/command-center/reset`
- `POST /api/command-center/approvals/:id`

That means the approval queue in local preview now runs through the actual orchestrator approval flow for `approve`, `deny`, and `cancel_task`, while `request_changes` records a live review note and keeps the approval pending.

The repository also includes an MVP close-out checklist and exit criteria:

- [MVP Exit Criteria](docs/issues/mvp-exit-criteria.md)

And a browser-level regression command for the Command Center preview:

- `npm run test:ui` (with `dev:web` running)

The live preview also includes a `Reset Demo` control so the local runtime can be returned to a clean approval state between manual test passes.

## Repository Layout

- `apps/`: runnable applications
- `packages/`: shared runtime packages
- `tests/`: cross-package tests and evaluation fixtures
- `docs/architecture/`: domain and event contracts
- `docs/security/`: policy, permission, memory, and privacy rules
- `docs/issues/`: GitHub issue backlog and templates
- `docs/plans/`: planning source documents

## Working Principle

This system is designed to earn autonomy gradually.

The implementation should prioritize:

1. clear task state
2. policy-enforced tool execution
3. approval gates for risky actions
4. auditability
5. memory privacy
6. user-visible control
