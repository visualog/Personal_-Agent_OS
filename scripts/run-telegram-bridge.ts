import {
  createTelegramBotClient,
  processTelegramUpdates,
} from "../packages/core/src/index.js";
import { getCommandCenterDemoRuntime } from "./command-center-demo-runtime.js";

function createDaemonBackedService(daemonUrl: string) {
  return {
    async submitCommand(input: {
      text: string;
      actor_id: string;
      channel: "telegram";
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

function readRequiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }

  return value;
}

function readAllowedUserIds(): string[] {
  const raw = readRequiredEnv("TELEGRAM_ALLOWED_USER_IDS");
  return raw
    .split(",")
    .map((userId) => userId.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const token = readRequiredEnv("TELEGRAM_BOT_TOKEN");
  const allowedUserIds = readAllowedUserIds();
  const pollIntervalMs = Number(process.env.PAOS_BRIDGE_POLL_INTERVAL_MS ?? "3000");
  const daemonUrl = process.env.PAOS_AGENT_DAEMON_URL?.trim();

  const client = createTelegramBotClient({ token });
  const runtime = daemonUrl ? null : await getCommandCenterDemoRuntime();
  const service = daemonUrl
    ? createDaemonBackedService(daemonUrl)
    : {
        submitCommand: async (input: { text: string; actor_id: string; channel: "telegram" }) =>
          runtime!.submitRemoteCommand(input),
      };
  let offset = 0;

  console.log("[telegram-bridge] started");
  console.log(`[telegram-bridge] allowed users: ${allowedUserIds.join(", ")}`);
  if (daemonUrl) {
    console.log(`[telegram-bridge] daemon target: ${daemonUrl}`);
  } else {
    console.log("[telegram-bridge] using embedded demo runtime");
  }

  while (true) {
    try {
      const updates = await client.getUpdates({
        offset,
        timeout_seconds: 20,
      });

      if (updates.length > 0) {
        const processed = await processTelegramUpdates({
          updates,
          config: {
            allowed_user_ids: allowedUserIds,
            bot_name: "Personal Agent OS",
          },
          service,
          client,
        });

        if (processed.last_update_id !== null) {
          offset = processed.last_update_id + 1;
        }
      }
    } catch (error) {
      console.error("[telegram-bridge] poll failed", error);
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

main().catch((error) => {
  console.error("[telegram-bridge] fatal", error);
  process.exitCode = 1;
});
