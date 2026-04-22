import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import * as core from "../src/index.js";
import type { Event, OrchestratorToolGateway, ToolDefinition } from "../src/index.js";

const {
  InMemoryApprovalStore,
  InMemoryToolGateway,
  PersonalAgentOrchestrator,
} = core;

function createApprovalStoreToolDefinition(
  overrides: Partial<ToolDefinition> = {},
): ToolDefinition {
  return {
    name: "workspace.write_file",
    description: "Write a file in the workspace",
    input_schema: { type: "object" },
    output_schema: { type: "object" },
    capabilities: ["workspace.write"],
    default_risk: "medium",
    requires_approval: true,
    sandbox: "workspace",
    ...overrides,
  };
}

test("approval store create/listPending/resolve approved", () => {
  const store = new InMemoryApprovalStore();

  const approval = store.create({
    task_id: "task_01",
    step_id: "step_01",
    summary: "Approve workspace write",
    risk_reasons: ["medium risk capability requires approval"],
    requested_at: "2026-04-22T00:00:00.000Z",
  });

  assert.equal(approval.status, "requested");
  assert.equal(store.listPending().length, 1);
  assert.equal(store.listPending()[0]?.id, approval.id);

  const resolved = store.resolve(
    approval.id,
    "approved",
    "2026-04-22T00:05:00.000Z",
  );

  assert.ok(resolved);
  if (!resolved) {
    throw new Error("approval should resolve");
  }

  assert.equal(resolved.status, "approved");
  assert.equal(resolved.resolved_at, "2026-04-22T00:05:00.000Z");
  assert.equal(store.listPending().length, 0);
  assert.equal(store.get(approval.id)?.status, "approved");
});

test("approval store cannot transition terminal states again", () => {
  const store = new InMemoryApprovalStore();

  const approved = store.create({
    task_id: "task_02",
    step_id: "step_02",
    summary: "Approve another workspace write",
    risk_reasons: ["approval required"],
  });

  const firstResolution = store.resolve(approved.id, "approved");
  assert.ok(firstResolution);

  assert.equal(store.resolve(approved.id, "denied"), null);
  assert.equal(store.resolve(approved.id, "expired"), null);
  assert.equal(store.get(approved.id)?.status, "approved");
});

function isApprovalRequestedEvent(event: Event): event is Extract<Event, { event_type: "step.approval_requested" }> {
  return event.event_type === "step.approval_requested";
}

test("orchestrator with medium write tool and no approval produces requires_approval step result", async () => {
  const gateway: OrchestratorToolGateway = {
    registerTool() {
      return undefined;
    },
    async execute(request) {
      return {
        status: "requires_approval" as const,
        policy: core.evaluatePolicy({
          id: request.action_id,
          step_id: request.step_id,
          tool_name: request.tool_name,
          requested_capabilities: ["workspace.write"],
          granted_capabilities: request.granted_capabilities,
          risk_level: "medium",
          scope_allowed: request.scope_allowed,
          approval_granted: request.approval_granted,
          audit_available: request.audit_available,
          tool_registered: true,
          sandbox_matched: request.sandbox_matched,
        }),
      };
    },
  };

  const orchestrator = new PersonalAgentOrchestrator({
    gateway,
    granted_capabilities: ["workspace.write"],
  });

  const result = await orchestrator.run({
    raw_request: "Inspect the workspace.",
    created_by: "user_approval_flow",
    workspaceRoot: "/tmp",
  });

  assert.ok(result.steps.some((step) => step.execution.status === "requires_approval"));
  assert.ok(
    result.events.some(
      (event) => isApprovalRequestedEvent(event) && Array.isArray(event.payload.risk_reasons),
    ),
  );
});

test("orchestrator with pre-approved custom gateway path can succeed when policy allows", async () => {
  const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "paos-approval-flow-"));
  await writeFile(path.join(workspaceRoot, "README.md"), "Personal Agent OS\n");

  const gateway = new InMemoryToolGateway();
  const readTool = createApprovalStoreToolDefinition({
    name: "workspace.read_file",
    capabilities: ["workspace.read"],
    default_risk: "low",
    requires_approval: false,
  });
  const listTool = createApprovalStoreToolDefinition({
    name: "workspace.list_files",
    capabilities: ["workspace.read"],
    default_risk: "low",
    requires_approval: false,
  });

  gateway.registerTool(listTool, async () => ({
    entries: [{ path: "README.md", type: "file" }],
  }));
  gateway.registerTool(readTool, async (input) => ({ echoed: input }));

  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read"],
    gateway,
  });

  const result = await orchestrator.run({
    raw_request: "Read a workspace file.",
    created_by: "user_approval_flow",
    workspaceRoot,
  });

  assert.ok(result.steps.length > 0);
  assert.ok(result.steps.every((step) => step.execution.status === "succeeded"));
  assert.ok(result.events.some((event) => event.event_type === "action.succeeded"));
});
