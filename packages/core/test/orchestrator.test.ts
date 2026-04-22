import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  PersonalAgentOrchestrator,
  type Event,
  type OrchestratorToolGateway,
  evaluatePolicy,
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

function createApprovalAwareGateway(): OrchestratorToolGateway & { getExecutions(): readonly string[] } {
  const executions: string[] = [];

  return {
    registerTool() {
      return undefined;
    },
    async execute(request) {
      executions.push(`${request.tool_name}:${request.approval_granted === true ? "approved" : "initial"}`);

      if (request.tool_name === "workspace.list_files") {
        return {
          status: "succeeded" as const,
          output: { entries: [{ path: "README.md", type: "file" }] },
          policy: evaluatePolicy({
            id: request.action_id,
            step_id: request.step_id,
            tool_name: request.tool_name,
            requested_capabilities: ["workspace.read"],
            granted_capabilities: request.granted_capabilities,
            risk_level: "low",
            scope_allowed: request.scope_allowed,
            approval_granted: request.approval_granted,
            audit_available: request.audit_available,
            tool_registered: true,
            sandbox_matched: request.sandbox_matched,
          }),
        };
      }

      if (request.tool_name === "workspace.read_file" && request.approval_granted !== true) {
        return {
          status: "requires_approval" as const,
          policy: evaluatePolicy({
            id: request.action_id,
            step_id: request.step_id,
            tool_name: request.tool_name,
            requested_capabilities: ["workspace.write"],
            granted_capabilities: ["workspace.write"],
            risk_level: "medium",
            scope_allowed: request.scope_allowed,
            approval_granted: request.approval_granted,
            audit_available: request.audit_available,
            tool_registered: true,
            sandbox_matched: request.sandbox_matched,
          }),
        };
      }

      return {
        status: "succeeded" as const,
        output: { ok: true, input: request.input },
        policy: evaluatePolicy({
          id: request.action_id,
          step_id: request.step_id,
          tool_name: request.tool_name,
          requested_capabilities: ["workspace.write"],
          granted_capabilities: ["workspace.write"],
          risk_level: "medium",
          scope_allowed: request.scope_allowed,
          approval_granted: true,
          audit_available: request.audit_available,
          tool_registered: true,
          sandbox_matched: request.sandbox_matched,
        }),
      };
    },
    getExecutions() {
      return executions;
    },
  };
}

test("resumeApproval approves a pending step, emits step.approved, and re-executes the blocked tool successfully", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const gateway = createApprovalAwareGateway();
  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read", "workspace.write"],
    gateway,
  });

  const initial = await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "user_approval_resume",
    workspaceRoot,
  });

  const pendingApproval = initial.approvals[0];
  assert.ok(pendingApproval);
  assert.equal(pendingApproval?.status, "requested");

  const resumed = await orchestrator.resumeApproval({
    approval_id: pendingApproval.id,
    resolution: "approved",
    task: initial.task,
    plan: initial.plan,
    workspaceRoot,
  });

  assert.equal(resumed.status, "resolved");
  assert.equal(resumed.approval?.status, "approved");
  assert.equal(resumed.stepResult?.execution.status, "succeeded");
  assert.ok(resumed.events.some((event) => event.event_type === "step.approved"));
  assert.ok(resumed.events.some((event) => event.event_type === "action.succeeded"));
  assert.ok(gateway.getExecutions().includes("workspace.read_file:approved"));
});

test("resumeApproval denies a pending approval, emits step.denied, and does not execute the blocked tool", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const gateway = createApprovalAwareGateway();
  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read", "workspace.write"],
    gateway,
  });

  const initial = await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "user_approval_deny",
    workspaceRoot,
  });

  const pendingApproval = initial.approvals[0];
  assert.ok(pendingApproval);

  const executionsBeforeDeny = gateway.getExecutions().length;
  const denied = await orchestrator.resumeApproval({
    approval_id: pendingApproval!.id,
    resolution: "denied",
    task: initial.task,
    plan: initial.plan,
    workspaceRoot,
  });

  assert.equal(denied.status, "resolved");
  assert.equal(denied.approval?.status, "denied");
  assert.equal(denied.stepResult, undefined);
  assert.ok(denied.events.some((event) => event.event_type === "step.denied"));
  assert.equal(gateway.getExecutions().length, executionsBeforeDeny);
});

test("resumeApproval safely rejects unknown or already-terminal approvals without re-running any tool", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const gateway = createApprovalAwareGateway();
  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read", "workspace.write"],
    gateway,
  });

  const initial = await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "user_approval_terminal",
    workspaceRoot,
  });

  const pendingApproval = initial.approvals[0];
  assert.ok(pendingApproval);

  const missing = await orchestrator.resumeApproval({
    approval_id: "approval_missing",
    resolution: "approved",
    task: initial.task,
    plan: initial.plan,
    workspaceRoot,
  });
  assert.equal(missing.status, "not_found");

  const approved = await orchestrator.resumeApproval({
    approval_id: pendingApproval!.id,
    resolution: "approved",
    task: initial.task,
    plan: initial.plan,
    workspaceRoot,
  });
  assert.equal(approved.status, "resolved");

  const executionsAfterApprove = gateway.getExecutions().length;
  const terminal = await orchestrator.resumeApproval({
    approval_id: pendingApproval!.id,
    resolution: "approved",
    task: initial.task,
    plan: initial.plan,
    workspaceRoot,
  });

  assert.equal(terminal.status, "already_resolved");
  assert.equal(terminal.approval?.status, "approved");
  assert.equal(gateway.getExecutions().length, executionsAfterApprove);
});
