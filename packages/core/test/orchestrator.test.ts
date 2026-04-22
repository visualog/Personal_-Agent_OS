import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PersonalAgentOrchestrator,
  type Event,
} from "../src/index.js";

async function createTempWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "paos-orchestrator-"));
  await mkdir(path.join(root, "nested"), { recursive: true });

  await writeFile(path.join(root, "README.md"), "# Personal Agent OS\n", "utf8");
  await writeFile(path.join(root, "nested", "note.txt"), "nested note\n", "utf8");

  return root;
}

function getEventTypes(events: readonly Event[]): string[] {
  return events.map((event) => event.event_type);
}

test("run creates task and plan and executes workspace list/read successfully", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read"],
  });

  const result = await orchestrator.run({
    raw_request: "Please inspect the workspace and read the README.",
    created_by: "user_01",
    workspaceRoot,
  });

  assert.equal(result.task.title, "Please inspect the workspace and read the README.");
  assert.equal(result.plan.status, "drafted");
  assert.ok(result.steps.some((step) => step.step.tool_name === "workspace.list_files"));
  assert.ok(result.steps.some((step) => step.step.tool_name === "workspace.read_file"));
  assert.ok(result.steps.every((step) => step.execution.status === "succeeded"));
});

test("event stream includes task.created, plan.drafted, action.started, action.succeeded", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read"],
  });

  const result = await orchestrator.run({
    raw_request: "List files and read the README.",
    created_by: "user_02",
    workspaceRoot,
  });

  const eventTypes = getEventTypes(result.events);

  assert.ok(eventTypes.includes("task.created"));
  assert.ok(eventTypes.includes("plan.drafted"));
  assert.ok(eventTypes.includes("action.started"));
  assert.ok(eventTypes.includes("action.succeeded"));
});

test("audit records are created for emitted events and redact payload object exists", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read"],
  });

  const result = await orchestrator.run({
    raw_request: "Read the README and report back.",
    created_by: "user_03",
    workspaceRoot,
  });

  assert.equal(result.auditRecords.length, result.events.length);
  assert.ok(result.auditRecords.every((record) => record.payload_redacted !== undefined));
  assert.ok(
    result.auditRecords.some((record) => {
      return (
        typeof record.payload_redacted === "object" &&
        record.payload_redacted !== null &&
        "summary" in record.payload_redacted
      );
    }),
  );
});

test("with granted_capabilities [] the run produces at least one denied/failed execution rather than succeeding", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: [],
  });

  const result = await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "user_04",
    workspaceRoot,
  });

  assert.ok(
    result.steps.some(
      ({ execution }) => execution.status === "denied" || execution.status === "failed",
    ),
  );
  assert.ok(
    !result.steps.every(({ execution }) => execution.status === "succeeded"),
  );
});
