import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  InMemoryApprovalStore,
  InMemoryAuditLog,
  InMemoryCommandCenter,
  InMemoryEventBus,
  InMemoryPlanStore,
  InMemoryStepStore,
  InMemoryTaskStore,
  PersonalAgentOrchestrator,
  type OrchestratorToolGateway,
  evaluatePolicy,
} from "../src/index.js";

async function createTempWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "paos-command-center-"));
  await mkdir(path.join(root, "nested"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "# Personal Agent OS\n", "utf8");
  await writeFile(path.join(root, "nested", "notes.txt"), "team notes\n", "utf8");
  return root;
}

function createApprovalAwareGateway(): OrchestratorToolGateway {
  return {
    registerTool() {
      return undefined;
    },
    async execute(request) {
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
    },
  };
}

test("command center task list surfaces pending approvals and risk counts", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const taskStore = new InMemoryTaskStore();
  const planStore = new InMemoryPlanStore();
  const stepStore = new InMemoryStepStore();
  const approvalStore = new InMemoryApprovalStore();
  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();

  const orchestrator = new PersonalAgentOrchestrator({
    taskStore,
    planStore,
    stepStore,
    approvalStore,
    eventBus,
    auditLog,
    gateway: createApprovalAwareGateway(),
    granted_capabilities: ["workspace.read", "workspace.write"],
  });

  await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "command_center_user",
    workspaceRoot,
  });

  const commandCenter = new InMemoryCommandCenter({
    taskStore,
    planStore,
    stepStore,
    approvalStore,
    eventBus,
    auditLog,
  });

  const items = commandCenter.listTaskItems();
  assert.equal(items.length, 1);
  assert.equal(items[0]?.status, "waiting_approval");
  assert.equal(items[0]?.pending_approval_count, 1);
  assert.equal(items[0]?.risk_flag_count, 1);
});

test("command center approval queue exposes action set and non-ambiguous approval summary", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const taskStore = new InMemoryTaskStore();
  const planStore = new InMemoryPlanStore();
  const stepStore = new InMemoryStepStore();
  const approvalStore = new InMemoryApprovalStore();
  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();

  const orchestrator = new PersonalAgentOrchestrator({
    taskStore,
    planStore,
    stepStore,
    approvalStore,
    eventBus,
    auditLog,
    gateway: createApprovalAwareGateway(),
    granted_capabilities: ["workspace.read", "workspace.write"],
  });

  await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "approval_queue_user",
    workspaceRoot,
  });

  const commandCenter = new InMemoryCommandCenter({
    taskStore,
    planStore,
    stepStore,
    approvalStore,
    eventBus,
    auditLog,
  });

  const queue = commandCenter.listApprovalQueue();
  assert.equal(queue.length, 1);
  assert.ok(queue[0]?.summary.includes("승인 필요"));
  assert.deepEqual(queue[0]?.actions, ["approve", "deny", "request_changes", "cancel_task"]);
});

test("command center task detail links task, plan, steps, approvals, risk flags, timeline, and audit", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const taskStore = new InMemoryTaskStore();
  const planStore = new InMemoryPlanStore();
  const stepStore = new InMemoryStepStore();
  const approvalStore = new InMemoryApprovalStore();
  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();

  const orchestrator = new PersonalAgentOrchestrator({
    taskStore,
    planStore,
    stepStore,
    approvalStore,
    eventBus,
    auditLog,
    gateway: createApprovalAwareGateway(),
    granted_capabilities: ["workspace.read", "workspace.write"],
  });

  const run = await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "detail_user",
    workspaceRoot,
  });

  const commandCenter = new InMemoryCommandCenter({
    taskStore,
    planStore,
    stepStore,
    approvalStore,
    eventBus,
    auditLog,
  });

  const detail = commandCenter.getTaskDetail(run.task.id);
  assert.equal(detail.task?.id, run.task.id);
  assert.equal(detail.plans.length, 1);
  assert.equal(detail.steps.length, 2);
  assert.equal(detail.approvals.length, 1);
  assert.equal(detail.risk_flags.length, 1);
  assert.ok(detail.timeline.some((event) => event.event_type === "step.approval_requested"));
  assert.ok(detail.audit_records.some((record) => record.event_type === "plan.updated"));
});
