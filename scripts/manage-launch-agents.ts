import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

type ServiceName = "agent-daemon" | "slack-bridge";
type ServiceCommand = "install" | "uninstall" | "status";

export interface ServiceDefinition {
  readonly name: ServiceName;
  readonly label: string;
  readonly npmScript: string;
  readonly logName: string;
}

const SERVICES: readonly ServiceDefinition[] = [
  {
    name: "agent-daemon",
    label: "com.personal-agent-os.agent-daemon",
    npmScript: "start:agent-daemon",
    logName: "agent-daemon",
  },
  {
    name: "slack-bridge",
    label: "com.personal-agent-os.slack-bridge",
    npmScript: "start:slack-bridge",
    logName: "slack-bridge",
  },
];

function xmlEscape(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&apos;");
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

function getUid(): string {
  return String(process.getuid?.() ?? "");
}

function runLaunchctl(args: readonly string[], options?: { allowFailure?: boolean }): string {
  const result = spawnSync("launchctl", [...args], {
    encoding: "utf8",
  });

  if (result.status !== 0 && !options?.allowFailure) {
    const output = `${result.stdout}${result.stderr}`.trim();
    throw new Error(`launchctl ${args.join(" ")} failed${output ? `: ${output}` : ""}`);
  }

  return `${result.stdout}${result.stderr}`;
}

export function getLaunchAgentPath(label: string, home = homedir()): string {
  return path.join(home, "Library", "LaunchAgents", `${label}.plist`);
}

export function renderLaunchAgentPlist(input: {
  service: ServiceDefinition;
  workspaceRoot: string;
  logDir: string;
}): string {
  const command = [
    "cd",
    shellQuote(input.workspaceRoot),
    "&&",
    "npm",
    "run",
    input.service.npmScript,
  ].join(" ");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(input.service.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>${xmlEscape(command)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(input.workspaceRoot)}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(path.join(input.logDir, `${input.service.logName}.out.log`))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(path.join(input.logDir, `${input.service.logName}.err.log`))}</string>
</dict>
</plist>
`;
}

async function installService(service: ServiceDefinition, workspaceRoot: string): Promise<void> {
  const home = homedir();
  const launchAgentsDir = path.join(home, "Library", "LaunchAgents");
  const logDir = path.join(workspaceRoot, ".paos", "logs");
  const plistPath = getLaunchAgentPath(service.label, home);
  const uid = getUid();

  await mkdir(launchAgentsDir, { recursive: true });
  await mkdir(logDir, { recursive: true });
  await writeFile(plistPath, renderLaunchAgentPlist({ service, workspaceRoot, logDir }), "utf8");

  runLaunchctl(["bootout", `gui/${uid}`, plistPath], { allowFailure: true });
  runLaunchctl(["bootstrap", `gui/${uid}`, plistPath]);
  runLaunchctl(["enable", `gui/${uid}/${service.label}`], { allowFailure: true });
  runLaunchctl(["kickstart", "-k", `gui/${uid}/${service.label}`], { allowFailure: true });

  console.log(`[launchd] installed ${service.name}: ${plistPath}`);
}

async function uninstallService(service: ServiceDefinition): Promise<void> {
  const plistPath = getLaunchAgentPath(service.label);
  const uid = getUid();

  runLaunchctl(["bootout", `gui/${uid}`, plistPath], { allowFailure: true });
  await rm(plistPath, { force: true });

  console.log(`[launchd] uninstalled ${service.name}: ${plistPath}`);
}

function printServiceStatus(service: ServiceDefinition): void {
  const uid = getUid();
  const output = runLaunchctl(["print", `gui/${uid}/${service.label}`], { allowFailure: true });
  const running = output.includes("state = running") || output.includes("pid = ");
  const plistPath = getLaunchAgentPath(service.label);

  console.log(`[launchd] ${service.name}: ${running ? "running" : "not running or not loaded"}`);
  console.log(`[launchd] ${service.name} plist: ${plistPath}`);
}

function readCommand(): ServiceCommand {
  const command = process.argv[2] as ServiceCommand | undefined;
  if (command === "install" || command === "uninstall" || command === "status") {
    return command;
  }

  throw new Error("Usage: npm run service:<install|uninstall|status>");
}

async function main(): Promise<void> {
  const command = readCommand();
  const workspaceRoot = process.cwd();

  if (command === "install") {
    for (const service of SERVICES) {
      await installService(service, workspaceRoot);
    }
    return;
  }

  if (command === "uninstall") {
    for (const service of SERVICES) {
      await uninstallService(service);
    }
    return;
  }

  for (const service of SERVICES) {
    printServiceStatus(service);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("[launchd] fatal", error);
    process.exitCode = 1;
  });
}
