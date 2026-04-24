# Personal Agent OS Handoff

Date: 2026-04-24  
Branch: `paos-implementation-batch-1`  
Remote: `https://github.com/visualog/Personal_-Agent_OS.git`

## 1. Product Direction

Personal Agent OS is being built as an OpenClaw-like local agent assistant.

The current product goal is not a web dashboard. The priority is:

- a local agent running on the user's computer
- remote commands from mobile/messenger
- coding-work delegation from Slack
- strict scope, approval, and audit controls

The key product promise is:

> The local agent may help with coding work, but it must not act outside the user's command scope or perform risky actions without explicit approval.

## 2. Current Working State

The project now has a working Slack-to-local-agent loop.

Confirmed live flow:

1. User sends a Slack message in the allowlisted channel.
2. Slack bridge polls the channel.
3. Bridge validates allowlisted Slack user and channel.
4. Bridge forwards the command to local agent daemon.
5. Daemon creates a task through the remote command contract.
6. Orchestrator plans and executes safe steps.
7. If a risky file apply step is needed, an `approval_id` is returned.
8. User sends `/approve <approval_id>`.
9. The approved patch flow completes and Slack receives the result.

Current services are installed as macOS user launch agents:

- `com.personal-agent-os.agent-daemon`
- `com.personal-agent-os.slack-bridge`

Service status command:

```bash
npm run service:status
```

Expected status:

```text
agent-daemon: running
slack-bridge: running
```

Daemon health check:

```bash
curl -s http://127.0.0.1:4180/health
```

Expected response:

```json
{"ok":true,"service":"personal-agent-os-daemon"}
```

## 3. User Environment

The user's Slack workspace is `loco`.

The local `.env` file is intentionally not committed. It contains:

```text
SLACK_BOT_TOKEN=...
SLACK_ALLOWED_USER_IDS=...
SLACK_ALLOWED_CHANNEL_IDS=...
PAOS_AGENT_DAEMON_URL=http://127.0.0.1:4180
```

Do not print, commit, or paste the Slack token.

Slack user and channel IDs are less sensitive than the token, but should still be treated as local config.

## 4. Important Commands

Install or reload services:

```bash
npm run service:install
```

Check service status:

```bash
npm run service:status
```

Uninstall services:

```bash
npm run service:uninstall
```

Run daemon manually:

```bash
npm run start:agent-daemon
```

Run Slack bridge manually:

```bash
npm run start:slack-bridge
```

Run checks:

```bash
npm run check
npm test
npm run test:daemon
```

## 5. Slack Usage

Because the current Slack bridge is polling normal channel messages rather than registered Slack slash commands, commands should be sent with a leading space:

```text
 /task 이 저장소에서 로그인 오류 수정해줘
```

Status:

```text
 /status task_xxx
```

Approve:

```text
 /approve approval_xxx
```

Deny:

```text
 /deny approval_xxx
```

Cancel:

```text
 /cancel task_xxx
```

If the user sends `/approve approval_xxx`, that is only an example placeholder and should fail with `approval_not_found`. Use the real `approval_id` returned by Slack.

## 6. Coding Flow

### Pathless Coding Request

Example:

```text
 /task 이 저장소에서 로그인 오류 수정해줘
```

Behavior:

- creates a task
- creates a proposal draft under `docs/agent-drafts/<task-id>.md`
- does not modify source files
- usually completes without approval

### File-Targeted Coding Request

Example:

```text
 /task README.md 파일에서 로그인 오류 수정 방향을 정리해줘
```

Behavior:

- creates a task
- reads workspace context
- writes proposal under `docs/agent-drafts/<task-id>.md`
- writes patch proposal under `docs/agent-drafts/<task-id>.patch`
- returns `approval_id`
- waits for approval
- applies patch after `/approve <approval_id>`

Current patch application is intentionally conservative:

- append-only
- approval required
- workspace-scoped
- no shell execution
- no network execution

This is not yet a full semantic code patcher.

## 7. Key Files

Core runtime:

- `packages/core/src/orchestrator.ts`
- `packages/core/src/planner.ts`
- `packages/core/src/workspace-tools.ts`
- `packages/core/src/remote-control.ts`
- `packages/core/src/slack-bridge.ts`

Daemon and bridge:

- `scripts/agent-daemon.ts`
- `scripts/run-agent-daemon.ts`
- `scripts/run-slack-bridge.ts`
- `scripts/manage-launch-agents.ts`
- `scripts/load-env.ts`

Tests:

- `packages/core/test/orchestrator.test.ts`
- `packages/core/test/workspace-tools.test.ts`
- `packages/core/test/task-planner.test.ts`
- `packages/core/test/slack-bridge.test.ts`
- `tests/agent-daemon.test.ts`
- `tests/launch-agents.test.ts`

Docs:

- `docs/architecture/remote-command-channel.md`
- `docs/architecture/slack-bridge.md`
- `docs/architecture/agent-daemon.md`
- `docs/architecture/local-service.md`
- `docs/architecture/workspace-tools.md`

## 8. Safety Model

Current safety controls:

- Slack allowlisted user only
- Slack allowlisted channel only
- local daemon binds to `127.0.0.1`
- remote commands cannot enable shell execution
- remote commands cannot enable network execution
- risky write/apply steps require approval
- missing or fake approval IDs are rejected
- runtime logs and events are audit-backed
- generated runtime artifacts under `docs/agent-drafts/` are gitignored

Important distinction:

- The Slack bridge is a transport.
- The daemon is the local runtime entrypoint.
- The orchestrator/policy/tool gateway decide what can actually happen.

Do not put safety decisions only in Slack text parsing.

## 9. Known Limitations

The system is functional but still early.

Current limitations:

- Slack commands need a leading space because official Slack slash commands are not registered yet.
- State is in-memory. Restarting services loses task/approval runtime state.
- Patch application is append-only and not a real semantic diff engine.
- No real LLM coding implementation is wired in yet.
- No git branch/commit workflow is exposed through Slack yet.
- No long-running progress streaming beyond polling/status.
- No production authentication layer beyond Slack allowlists.

## 10. Recommended Next Work

Highest-value next tasks:

1. Persistent runtime state
   - Store tasks, plans, approvals, events, and audit records in SQLite.
   - Prevent service restart from losing approvals.

2. Real patch generation
   - Generate a concrete diff from file content and user request.
   - Store the diff under `docs/agent-drafts/<task-id>.patch`.
   - Apply only after approval.

3. Slack command UX
   - Add official Slack slash commands or support `paos task ...`.
   - Remove the need for leading spaces.

4. Git-safe coding workflow
   - Create a branch per coding task.
   - Apply patch on that branch.
   - Run checks.
   - Report result to Slack.

5. Runtime observability
   - Add `/logs task_xxx` or richer `/status`.
   - Show draft path, patch path, approval status, and last error.

Recommended immediate next task:

> Add persistent state for daemon runtime so approvals survive launchd restarts.

This is the right next step because the current Slack control loop works, but service restarts still erase in-memory approvals.

## 11. Verification Snapshot

Latest successful verification before this handoff:

- `npm run check`
- `npm test`
- `npm run test:daemon`
- `npm run service:status`
- `curl -s http://127.0.0.1:4180/health`

The user also confirmed through Slack:

- task creation works
- status lookup works
- approval with a real approval ID works
- fake `approval_xxx` is rejected with `approval_not_found`

