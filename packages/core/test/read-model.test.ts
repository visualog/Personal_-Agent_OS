import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  InMemoryApprovalStore,
  InMemoryEventBus,
  InMemoryPlanStore,
  InMemoryRuntimeReadModel,
  InMemoryStepStore,
  InMemoryTaskStore,
  PersonalAgentOrchestrator,
  type OrchestratorToolGateway,
  evaluatePolicy,
} from "../src/index.js";

async function createTempWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "paos-read-model-"));
  await mkdir(path.join(root, "nested"), { recursive: true });
  await writeFile(path.join(root, "README.md"), "# Personal Agent OS\n", "utf8");
  await writeFile(path.join(root, "nested", "note.txt"), "nested note\n", "utf8");
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

test("runtime read model returns completed task view with plans, steps, and empty risk flags for low-risk run", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const taskStore = new InMemoryTaskStore();
  const planStore = new InMemoryPlanStore();
  const stepStore = new InMemoryStepStore();
  const approvalStore = new InMemoryApprovalStore();
  const eventBus = new InMemoryEventBus();

  const orchestrator = new PersonalAgentOrchestrator({
    taskStore,
    planStore,
    stepStore,
    approvalStore,
    eventBus,
    granted_capabilities: ["workspace.read"],
  });
  const readModel = new InMemoryRuntimeReadModel({
    taskStore,
    planStore,
    stepStore,
    approvalStore,
    eventBus,
  });

  const result = await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "user_read_model_success",
    workspaceRoot,
  });

  const view = readModel.getTaskRuntimeView(result.task.id);

  assert.equal(view.task?.status, "completed");
  assert.equal(view.plans.length, 1);
  assert.equal(view.steps.length, 2);
  assert.ok(view.steps.every((step) => step.status === "completed"));
  assert.equal(view.approvals.length, 0);
  assert.equal(view.pendingApprovals.length, 0);
  assert.equal(view.riskFlags.length, 0);
  assert.ok(view.timeline.some((event) => event.event_type === "task.updated"));
});

test("runtime read model returns pending approval and risk signal for approval-required run", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const taskStore = new InMemoryTaskStore();
  const planStore = new InMemoryPlanStore();
  const stepStore = new InMemoryStepStore();
  const approvalStore = new InMemoryApprovalStore();
  const eventBus = new InMemoryEventBus();

  const orchestrator = new PersonalAgentOrchestrator({
    taskStore,
    planStore,
    stepStore,
    approvalStore,
    eventBus,
    granted_capabilities: ["workspace.read", "workspace.write"],
    gateway: createApprovalAwareGateway(),
  });
  const readModel = new InMemoryRuntimeReadModel({
    taskStore,
    planStore,
    stepStore,
    approvalStore,
    eventBus,
  });

  const result = await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "user_read_model_pending",
    workspaceRoot,
  });

  const view = readModel.getTaskRuntimeView(result.task.id);

  assert.equal(view.task?.status, "waiting_approval");
  assert.equal(view.approvals.length, 1);
  assert.equal(view.pendingApprovals.length, 1);
  assert.equal(view.riskFlags.length, 1);
  assert.equal(view.riskFlags[0]?.payload.decision, "require_approval");
  assert.ok(view.timeline.some((event) => event.event_type === "step.approval_requested"));
});

test("runtime read model reflects approved resume by clearing pending approvals and preserving risk history", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const taskStore = new InMemoryTaskStore();
  const planStore = new InMemoryPlanStore();
  const stepStore = new InMemoryStepStore();
  const approvalStore = new InMemoryApprovalStore();
  const eventBus = new InMemoryEventBus();

  const gateway = {
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
          output: { ok: true },
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
  } satisfies OrchestratorToolGateway;

  const orchestrator = new PersonalAgentOrchestrator({
    taskStore,
    planStore,
    stepStore,
    approvalStore,
    eventBus,
    granted_capabilities: ["workspace.read", "workspace.write"],
    gateway,
  });
  const readModel = new InMemoryRuntimeReadModel({
    taskStore,
    planStore,
    stepStore,
    approvalStore,
    eventBus,
  });

  const initial = await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "user_read_model_resume",
    workspaceRoot,
  });
  const pendingApproval = initial.approvals[0];
  assert.ok(pendingApproval);

  await orchestrator.resumeApproval({
    approval_id: pendingApproval!.id,
    resolution: "approved",
    task: initial.task,
    plan: initial.plan,
    workspaceRoot,
  });

  const view = readModel.getTaskRuntimeView(initial.task.id);

  assert.equal(view.task?.status, "completed");
  assert.equal(view.pendingApprovals.length, 0);
  assert.equal(view.approvals.length, 1);
  assert.equal(view.approvals[0]?.status, "approved");
  assert.equal(view.riskFlags.length, 1);
  assert.ok(view.timeline.some((event) => event.event_type === "step.approved"));
});
