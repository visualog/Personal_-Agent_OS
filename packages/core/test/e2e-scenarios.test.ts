import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  InMemoryApprovalStore,
  InMemoryAuditLog,
  InMemoryEventBus,
  InMemoryPlanStore,
  InMemoryRuntimeControl,
  InMemoryStepStore,
  InMemoryTaskStore,
  PersonalAgentOrchestrator,
  type OrchestratorToolGateway,
  evaluatePolicy,
} from "../src/index.js";

async function createTempWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "paos-e2e-"));
  await mkdir(path.join(root, "nested"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "# Personal Agent OS\n", "utf8");
  await writeFile(path.join(root, "nested", "status.txt"), "project is active\n", "utf8");
  return root;
}

function createApprovalGateway(): OrchestratorToolGateway {
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

      if (request.approval_granted === true) {
        return {
          status: "succeeded" as const,
          output: { draft: "reply draft created" },
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

test("Scenario A: project status request completes from task creation through audit log", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();
  const orchestrator = new PersonalAgentOrchestrator({
    eventBus,
    auditLog,
    granted_capabilities: ["workspace.read"],
  });

  const result = await orchestrator.run({
    raw_request: "이 프로젝트 현재 상태를 정리하고 다음 작업을 제안해줘",
    created_by: "scenario_a_user",
    workspaceRoot,
  });

  assert.equal(result.task.status, "completed");
  assert.equal(result.plan.status, "completed");
  assert.ok(result.steps.every(({ execution }) => execution.status === "succeeded"));
  assert.ok(result.events.some((event) => event.event_type === "task.created"));
  assert.ok(result.events.some((event) => event.event_type === "action.succeeded"));
  assert.ok(result.auditRecords.length >= result.events.length);
  assert.ok(result.auditRecords.some((record) => record.event_type === "action.succeeded"));
});

test("Scenario B: draft-like approval flow pauses, requests approval, and resumes to success with full audit trail", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();
  const approvalStore = new InMemoryApprovalStore();
  const taskStore = new InMemoryTaskStore();
  const planStore = new InMemoryPlanStore();
  const stepStore = new InMemoryStepStore();
  const orchestrator = new PersonalAgentOrchestrator({
    eventBus,
    auditLog,
    approvalStore,
    taskStore,
    planStore,
    stepStore,
    gateway: createApprovalGateway(),
    granted_capabilities: ["workspace.read", "workspace.write"],
  });

  const initial = await orchestrator.run({
    raw_request: "어제 논의한 내용을 읽고 답장 초안을 만들어줘. 보내지는 마.",
    created_by: "scenario_b_user",
    workspaceRoot,
  });

  assert.equal(initial.task.status, "waiting_approval");
  assert.equal(initial.approvals.length, 1);
  assert.ok(initial.events.some((event) => event.event_type === "step.approval_requested"));
  assert.ok(initial.events.some((event) => event.event_type === "risk.flagged"));

  const resumed = await orchestrator.resumeApproval({
    approval_id: initial.approvals[0]!.id,
    resolution: "approved",
    task: initial.task,
    plan: initial.plan,
    workspaceRoot,
  });

  assert.equal(resumed.status, "resolved");
  assert.equal(resumed.task?.status, "completed");
  assert.equal(resumed.plan?.status, "completed");
  assert.ok(resumed.events.some((event) => event.event_type === "step.approved"));
  assert.ok(resumed.auditRecords.some((record) => record.event_type === "step.approved"));
  assert.ok(resumed.auditRecords.some((record) => record.event_type === "action.succeeded"));
});

test("Scenario C: dangerous request is blocked under lockdown and leaves deny reasons in audit trail", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();
  const runtimeControl = new InMemoryRuntimeControl({ eventBus, auditLog });
  runtimeControl.enableLockdown("dangerous destructive request");

  const orchestrator = new PersonalAgentOrchestrator({
    eventBus,
    auditLog,
    runtimeControl,
    granted_capabilities: ["workspace.read", "workspace.write"],
  });

  const result = await orchestrator.run({
    raw_request: "오래된 파일을 정리해서 삭제해줘",
    created_by: "scenario_c_user",
    workspaceRoot,
  });

  assert.ok(result.steps.some(({ execution }) => execution.status === "denied"));
  assert.ok(result.events.some((event) => event.event_type === "safety.lockdown_enabled"));
  const flagged = result.events.filter((event) => event.event_type === "risk.flagged");
  assert.ok(flagged.length > 0);
  assert.ok(
    flagged.some((event) => event.payload.decision === "deny"),
  );
  assert.ok(
    result.auditRecords.some((record) => record.summary.includes("lockdown")),
  );
  assert.ok(
    result.auditRecords.some((record) => record.event_type === "action.failed"),
  );
});
