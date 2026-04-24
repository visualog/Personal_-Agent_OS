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
  writeWorkspaceFile,
  applyWorkspacePatch,
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

test("writeWorkspaceFile supports append mode for approved edits", async (t) => {
  const root = await createTempWorkspace();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  await writeWorkspaceFile({
    root,
    path: "root.txt",
    content: "second line",
    mode: "append",
  });

  const updated = await readWorkspaceFile({ root }, "root.txt");
  assert.match(updated, /root file/);
  assert.match(updated, /second line/);
});

test("applyWorkspacePatch appends approved patch content and reports patch metadata", async (t) => {
  const root = await createTempWorkspace();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const result = await applyWorkspacePatch({
    root,
    path: "root.txt",
    patch: "--- a/root.txt\n+++ b/root.txt\n@@\n+approved patch line\n",
    append_content: "approved patch line",
  });

  assert.equal(result.path, "root.txt");
  assert.ok(result.patch_bytes > 0);
  assert.ok(result.bytes_appended > 0);

  const updated = await readWorkspaceFile({ root }, "root.txt");
  assert.match(updated, /approved patch line/);
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

test("draft, patch proposal, and apply patch tools register and enforce their input constraints", async (t) => {
  const root = await createTempWorkspace();
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const gateway = new InMemoryToolGateway();
  const tools = createWorkspaceToolGatewayTools({ root });

  for (const tool of tools) {
    gateway.registerTool(tool);
  }

  const draftResult = await gateway.execute({
    action_id: "action_03",
    step_id: "step_03",
    tool_name: "workspace.write_draft",
    input: {
      path: "docs/agent-drafts/proposal.md",
      content: "# Draft",
    },
    granted_capabilities: ["workspace.write"],
    scope_allowed: true,
    sandbox_matched: true,
  });

  assert.equal(draftResult.status, "succeeded");

  const patchResult = await gateway.execute({
    action_id: "action_04",
    step_id: "step_04",
    tool_name: "workspace.write_patch",
    input: {
      path: "docs/agent-drafts/proposal.patch",
      content: "--- a/root.txt\n+++ b/root.txt\n@@\n+approved line\n",
    },
    granted_capabilities: ["workspace.write"],
    scope_allowed: true,
    sandbox_matched: true,
  });

  assert.equal(patchResult.status, "succeeded");

  const applyResult = await gateway.execute({
    action_id: "action_05",
    step_id: "step_05",
    tool_name: "workspace.apply_patch",
    input: {
      path: "root.txt",
      patch: "--- a/root.txt\n+++ b/root.txt\n@@\n+approved line\n",
      append_content: "approved line",
    },
    granted_capabilities: ["workspace.write"],
    scope_allowed: true,
    sandbox_matched: true,
    approval_granted: true,
  });

  assert.equal(applyResult.status, "succeeded");
  const updated = await readWorkspaceFile({ root }, "root.txt");
  assert.match(updated, /approved line/);
});
