import { startAgentDaemonServer } from "./agent-daemon.js";
import { loadLocalEnv } from "./load-env.js";

async function main(): Promise<void> {
  loadLocalEnv();
  const host = process.env.PAOS_AGENT_HOST ?? "127.0.0.1";
  const port = Number(process.env.PAOS_AGENT_PORT ?? "4180");
  const server = await startAgentDaemonServer({ host, port });

  console.log(`[agent-daemon] listening on http://${host}:${port}`);

  const shutdown = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

main().catch((error) => {
  console.error("[agent-daemon] fatal", error);
  process.exitCode = 1;
});
