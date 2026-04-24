# Local Service

## Goal

The local agent should keep running after the development terminal is closed.

On macOS this is handled with user-level `launchd` agents. The installer creates two launch agents:

- `com.personal-agent-os.agent-daemon`
- `com.personal-agent-os.slack-bridge`

Both are installed under `~/Library/LaunchAgents`.

## Commands

Install and start both services:

```bash
npm run service:install
```

Check status:

```bash
npm run service:status
```

Stop and remove both services:

```bash
npm run service:uninstall
```

## Runtime Behavior

The launch agents run the existing npm scripts from the repo root:

- `npm run start:agent-daemon`
- `npm run start:slack-bridge`

Each script loads `.env` from the repo root, so Slack credentials and allowlists stay local and are not written into the plist files.

Logs are written to:

```text
.paos/logs/agent-daemon.out.log
.paos/logs/agent-daemon.err.log
.paos/logs/slack-bridge.out.log
.paos/logs/slack-bridge.err.log
```

## Safety

The service layer does not add new agent permissions.

It only keeps the same daemon and Slack bridge alive. The existing controls still apply:

- allowlisted Slack users only
- allowlisted Slack channels only
- remote commands cannot enable shell execution
- remote commands cannot enable network execution
- risky workspace writes still require approval

## Why This Matters

Before this step, Slack control depended on manually running two terminal sessions.

With launch agents, the local agent behaves more like an installed OpenClaw-style assistant: the computer owns the running process, and Slack is just the remote command channel.

