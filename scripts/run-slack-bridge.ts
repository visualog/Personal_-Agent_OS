import {
  createSlackBotClient,
  handleSlackMessage,
  verifySlackBridgeStartup,
} from "../packages/core/src/index.js";
import { getCommandCenterDemoRuntime } from "./command-center-demo-runtime.js";
import { loadLocalEnv } from "./load-env.js";

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

function readCsvEnv(name: string): string[] {
  return readRequiredEnv(name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function createDaemonBackedService(daemonUrl: string) {
  return {
    async submitCommand(input: {
      text: string;
      actor_id: string;
      channel: "slack";
    }) {
      const response = await fetch(`${daemonUrl}/api/remote/commands`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error(`Agent daemon submit failed: ${response.status}`);
      }

      return await response.json() as {
        readonly status: "accepted" | "rejected";
        readonly reasons: readonly string[];
        readonly summary: string;
        readonly task_id?: string;
        readonly approval_id?: string;
      };
    },
  };
}

async function main(): Promise<void> {
  loadLocalEnv();
  const token = readRequiredEnv("SLACK_BOT_TOKEN");
  const allowedUserIds = readCsvEnv("SLACK_ALLOWED_USER_IDS");
  const allowedChannelIds = readCsvEnv("SLACK_ALLOWED_CHANNEL_IDS");
  const pollIntervalMs = Number(process.env.PAOS_BRIDGE_POLL_INTERVAL_MS ?? "3000");
  const daemonUrl = process.env.PAOS_AGENT_DAEMON_URL?.trim();

  const client = createSlackBotClient({ token });
  const runtime = daemonUrl ? null : await getCommandCenterDemoRuntime();
  const service = daemonUrl
    ? createDaemonBackedService(daemonUrl)
    : {
        submitCommand: async (input: { text: string; actor_id: string; channel: "slack" }) =>
          runtime!.submitRemoteCommand(input),
      };
  const startupStatus = await verifySlackBridgeStartup({
    client,
    daemon_url: daemonUrl,
  });
  const lastSeenTsByChannel = new Map<string, string>();

  console.log("[slack-bridge] started");
  console.log(`[slack-bridge] team: ${startupStatus.auth.team ?? "unknown"}`);
  console.log(`[slack-bridge] bot user: ${startupStatus.auth.user_id ?? "unknown"}`);
  console.log(`[slack-bridge] allowed users: ${allowedUserIds.join(", ")}`);
  console.log(`[slack-bridge] allowed channels: ${allowedChannelIds.join(", ")}`);
  if (daemonUrl) {
    console.log(`[slack-bridge] daemon target: ${daemonUrl}`);
    console.log(`[slack-bridge] daemon health: ${startupStatus.daemon_health?.service ?? "unknown"}`);
  } else {
    console.log("[slack-bridge] using embedded demo runtime");
  }

  while (true) {
    try {
      for (const channelId of allowedChannelIds) {
        const channelCursor = lastSeenTsByChannel.get(channelId);
        const messages = await client.conversationsHistory({
          channel: channelId,
          oldest: channelCursor,
          limit: 20,
        });

        const sortedMessages = [...messages].sort((left, right) => left.ts.localeCompare(right.ts));
        if (!channelCursor && sortedMessages.length > 0) {
          lastSeenTsByChannel.set(channelId, sortedMessages.at(-1)?.ts ?? "");
          continue;
        }

        for (const message of sortedMessages) {
          const result = await handleSlackMessage({
            message,
            channel_id: channelId,
            config: {
              allowed_user_ids: allowedUserIds,
              allowed_channel_ids: allowedChannelIds,
              bot_name: "Personal Agent OS",
            },
            service,
          });

          lastSeenTsByChannel.set(channelId, message.ts);

          if (!result.handled || !result.response_text) {
            continue;
          }

          await client.postMessage({
            channel: channelId,
            text: result.response_text,
          });
        }
      }
    } catch (error) {
      console.error("[slack-bridge] poll failed", error);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

main().catch((error) => {
  console.error("[slack-bridge] fatal", error);
  process.exitCode = 1;
});
