import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createWorkspaceToolGatewayTools,
  InMemoryToolGateway,
  listWorkspaceFiles,
  readWorkspaceFile,
  resolveWorkspacePath,
} from "../src/index.js";

async function createTempWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "paos-workspace-tools-"));
  await mkdir(path.join(root, "nested", "deeper"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "pkg"), { recursive: true });
  await mkdir(path.join(root, ".git", "objects"), { recursive: true });

  await writeFile(path.join(root, "root.txt"), "root file", "utf8");
  await writeFile(path.join(root, "nested", "deeper", "child.txt"), "child file", "utf8");
  await writeFile(path.join(root, "node_modules", "pkg", "skip.txt"), "skip me", "utf8");
  await writeFile(path.join(root, ".git", "objects", "skip.txt"), "skip me too", "utf8");

  return root;
}

test("resolveWorkspacePath rejects escaping with ../", async (t) => {
  const root = await createTempWorkspace();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  assert.throws(() => resolveWorkspacePath({ root }, "../outside.txt"));
});

test("listWorkspaceFiles lists nested files and skips node_modules/.git", async (t) => {
  const root = await createTempWorkspace();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const { entries } = await listWorkspaceFiles({ root });
  const files = entries.map((entry) => entry.path);

  assert.deepEqual([...files].sort(), ["nested/deeper/child.txt", "root.txt"]);
});

test("readWorkspaceFile reads utf8 content and truncates when maxBytes is small", async (t) => {
  const root = await createTempWorkspace();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const full = await readWorkspaceFile({ root }, "nested/deeper/child.txt");
  const truncated = await readWorkspaceFile({ root }, "nested/deeper/child.txt", { maxBytes: 4 });

  assert.equal(full, "child file");
  assert.equal(truncated, "chil");
});

test("createWorkspaceToolGatewayTools registers with InMemoryToolGateway and succeeds for workspace.read capability", async (t) => {
  const root = await createTempWorkspace();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const gateway = new InMemoryToolGateway();
  const tools = createWorkspaceToolGatewayTools({ root });

  for (const tool of tools) {
    gateway.registerTool(tool);
  }

  const readTool = tools.find((tool) => tool.definition.name === "workspace.read_file");
  assert.ok(readTool);

  const result = await gateway.execute({
    action_id: "action_01",
    step_id: "step_01",
    tool_name: readTool.definition.name,
    input: { path: "root.txt" },
    granted_capabilities: ["workspace.read"],
    scope_allowed: true,
    sandbox_matched: true,
  });

  assert.equal(result.status, "succeeded");
});

test("gateway denies read tool if workspace.read capability missing", async (t) => {
  const root = await createTempWorkspace();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const gateway = new InMemoryToolGateway();
  const tools = createWorkspaceToolGatewayTools({ root });

  for (const tool of tools) {
    gateway.registerTool(tool);
  }

  const readTool = tools.find((tool) => tool.definition.name === "workspace.read_file");
  assert.ok(readTool);

  const result = await gateway.execute({
    action_id: "action_02",
    step_id: "step_02",
    tool_name: readTool.definition.name,
    input: { path: "root.txt" },
    granted_capabilities: [],
    scope_allowed: true,
    sandbox_matched: true,
  });

  assert.equal(result.status, "denied");
});
