# Personal Agent OS

Personal Agent OS is a local-first AI agent assistant designed around gradual autonomy, high intelligence, and inspectable trust.

The first project artifact is an issue-ready MVP plan, now split into implementation-facing documentation:

- [Personal Agent OS MVP Issue Plan](docs/plans/2026-04-21-personal-agent-os-mvp-issue-plan.md)
- [Documentation Index](docs/README.md)

## Current Status

Draft planning has started. The documentation set defines:

- product boundaries and non-goals
- representative scenarios
- core runtime components
- domain models
- event contracts
- risk and permission policy
- GitHub issue backlog
- parallel work lanes
- milestone sequencing

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
