import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  InMemoryPlanStore,
  InMemoryStepStore,
  InMemoryTaskStore,
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

function getEventIndexes(events: readonly Event[], eventType: string): number[] {
  return events.reduce<number[]>((indexes, event, index) => {
    if (event.event_type === eventType) {
      indexes.push(index);
    }

    return indexes;
  }, []);
}

function isRiskFlaggedEvent(event: Event): event is Extract<Event, { event_type: "risk.flagged" }> {
  return event.event_type === "risk.flagged";
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
  assert.equal(result.task.status, "completed");
  assert.equal(result.plan.status, "completed");
  assert.ok(result.steps.some((step) => step.step.tool_name === "workspace.list_files"));
  assert.ok(result.steps.some((step) => step.step.tool_name === "workspace.read_file"));
  assert.ok(result.steps.every((step) => step.execution.status === "succeeded"));
  assert.ok(result.steps.every((step) => step.step.status === "completed"));
});

test("coding task without explicit target path writes a proposal draft and completes without source edit approval", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read", "workspace.write"],
  });

  const result = await orchestrator.run({
    raw_request: "이 저장소에서 로그인 오류를 수정해줘",
    created_by: "user_code_01",
    workspaceRoot,
  });

  assert.equal(result.task.status, "completed");
  assert.equal(result.approvals.length, 0);
  assert.ok(result.steps.some((step) => step.step.tool_name === "workspace.write_draft"));
  assert.ok(!result.steps.some((step) => step.step.tool_name === "workspace.apply_file_edit"));
});

test("coding task with explicit target path requests approval for apply step and appends approved note after resume", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read", "workspace.write"],
  });

  const result = await orchestrator.run({
    raw_request: "README.md 파일에서 로그인 오류 수정 방향을 정리해줘",
    created_by: "user_code_02",
    workspaceRoot,
  });

  const approval = result.approvals[0];
  assert.ok(approval);
  assert.equal(result.task.status, "waiting_approval");
  assert.ok(result.steps.some((step) => step.step.tool_name === "workspace.write_draft"));
  assert.ok(result.steps.some((step) => step.step.tool_name === "workspace.write_patch"));
  assert.ok(result.steps.some((step) => step.step.tool_name === "workspace.apply_patch"));

  const resume = await orchestrator.resumeApproval({
    approval_id: approval.id,
    resolution: "approved",
    task: result.task,
    plan: result.plan,
    workspaceRoot,
  });

  assert.equal(resume.status, "resolved");
  assert.equal(resume.task?.status, "completed");

  const readme = await readFile(path.join(workspaceRoot, "README.md"), "utf8");
  assert.match(readme, /PAOS Approved Change Note/);
  assert.match(readme, /README\.md 파일에서 로그인 오류 수정 방향을 정리해줘/);

  const patch = await readFile(path.join(workspaceRoot, `docs/agent-drafts/${result.task.id}.patch`), "utf8");
  assert.match(patch, /--- a\/README\.md/);
  assert.match(patch, /\+\+ b\/README\.md/);
  assert.match(patch, /\+## PAOS Approved Change Note/);
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
  assert.ok(eventTypes.includes("step.ready"));
  assert.ok(eventTypes.includes("policy.evaluated"));
  assert.ok(eventTypes.includes("action.started"));
  assert.ok(eventTypes.includes("action.succeeded"));
  assert.ok(eventTypes.includes("plan.updated"));
  assert.ok(eventTypes.includes("task.updated"));
  assert.ok(!eventTypes.includes("risk.flagged"));
});

test("run emits lifecycle projection events in a sane order before closing with plan/task updates", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read"],
  });

  const result = await orchestrator.run({
    raw_request: "List files and read the README.",
    created_by: "user_02b",
    workspaceRoot,
  });

  const eventTypes = getEventTypes(result.events);

  const stepReadyIndexes = getEventIndexes(result.events, "step.ready");
  const policyIndexes = getEventIndexes(result.events, "policy.evaluated");
  const planUpdatedIndexes = getEventIndexes(result.events, "plan.updated");
  const taskUpdatedIndexes = getEventIndexes(result.events, "task.updated");

  assert.ok(eventTypes.includes("task.created"));
  assert.ok(eventTypes.includes("plan.drafted"));
  assert.equal(stepReadyIndexes.length, result.plan.steps.length);
  assert.equal(policyIndexes.length, result.plan.steps.length);
  assert.deepEqual(planUpdatedIndexes.length, 1);
  assert.deepEqual(taskUpdatedIndexes.length, 1);
  assert.ok(stepReadyIndexes[0]! > eventTypes.indexOf("plan.drafted"));
  assert.ok(policyIndexes[0]! > stepReadyIndexes[0]!);
  assert.ok(planUpdatedIndexes[0]! > policyIndexes.at(-1)!);
  assert.ok(taskUpdatedIndexes[0]! > planUpdatedIndexes[0]!);
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
  const riskEvents = result.events.filter(isRiskFlaggedEvent);
  assert.ok(riskEvents.length > 0);
  assert.ok(riskEvents.every((event) => event.payload.decision === "deny"));
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
  assert.equal(resumed.task?.status, "completed");
  assert.equal(resumed.plan?.status, "completed");
  assert.equal(
    resumed.plan?.steps.find((step) => step.id === pendingApproval.step_id)?.status,
    "completed",
  );
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
  assert.equal(denied.task?.status, "failed");
  assert.equal(denied.plan?.status, "failed");
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

test("resumeApproval emits step.approved, step.ready, policy.evaluated, and final plan/task updates in order", async (t) => {
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
    created_by: "user_resume_events",
    workspaceRoot,
  });

  const pendingApproval = initial.approvals[0];
  assert.ok(pendingApproval);

  const resumed = await orchestrator.resumeApproval({
    approval_id: pendingApproval!.id,
    resolution: "approved",
    task: initial.task,
    plan: initial.plan,
    workspaceRoot,
  });

  const initialEventCount = initial.events.length;
  const resumeEvents = resumed.events.slice(initialEventCount);

  assert.ok(resumeEvents.some((event) => event.event_type === "step.approved"));
  assert.ok(resumeEvents.some((event) => event.event_type === "step.ready"));
  assert.ok(resumeEvents.some((event) => event.event_type === "action.started"));
  assert.ok(resumeEvents.some((event) => event.event_type === "action.succeeded"));
  assert.equal(getEventIndexes(resumeEvents, "step.ready").length, 1);
  assert.equal(getEventIndexes(resumeEvents, "policy.evaluated").length, 1);
  assert.equal(getEventIndexes(resumeEvents, "risk.flagged").length, 0);
  assert.equal(getEventIndexes(resumeEvents, "plan.updated").length, 1);
  assert.equal(getEventIndexes(resumeEvents, "task.updated").length, 1);

  const approvedIndex = resumeEvents.findIndex((event) => event.event_type === "step.approved");
  const readyIndex = resumeEvents.findIndex((event) => event.event_type === "step.ready");
  const startedIndex = resumeEvents.findIndex((event) => event.event_type === "action.started");
  const policyIndex = resumeEvents.findIndex((event) => event.event_type === "policy.evaluated");
  const succeededIndex = resumeEvents.findIndex((event) => event.event_type === "action.succeeded");
  const planUpdatedIndex = resumeEvents.findIndex((event) => event.event_type === "plan.updated");
  const taskUpdatedIndex = resumeEvents.findIndex((event) => event.event_type === "task.updated");

  assert.ok(approvedIndex >= 0);
  assert.ok(readyIndex > approvedIndex);
  assert.ok(startedIndex > readyIndex);
  assert.ok(policyIndex > startedIndex);
  assert.ok(succeededIndex > policyIndex);
  assert.ok(planUpdatedIndex > succeededIndex);
  assert.ok(taskUpdatedIndex > planUpdatedIndex);
});

test("run with approval pending marks task waiting_approval, plan partially_approved, and blocked step waiting_approval until resumed", async (t) => {
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
    created_by: "user_status_contract",
    workspaceRoot,
  });

  assert.equal(initial.task.status, "waiting_approval");
  assert.equal(initial.plan.status, "partially_approved");
  assert.ok(initial.events.some((event) => event.event_type === "task.updated"));
  assert.ok(initial.events.some((event) => event.event_type === "plan.updated"));
  assert.ok(initial.events.filter((event) => event.event_type === "step.ready").length >= 2);
  assert.ok(initial.events.some((event) => event.event_type === "policy.evaluated"));
  const flaggedEvents = initial.events.filter(isRiskFlaggedEvent);
  assert.equal(flaggedEvents.length, 1);
  assert.equal(flaggedEvents[0]?.payload.decision, "require_approval");
  assert.deepEqual(
    initial.plan.steps.map((step) => step.status),
    ["completed", "waiting_approval"],
  );
  assert.deepEqual(
    initial.steps.map(({ execution }) => execution.status),
    ["succeeded", "requires_approval"],
  );

  const pendingApproval = initial.approvals[0];
  assert.ok(pendingApproval);

  const resumed = await orchestrator.resumeApproval({
    approval_id: pendingApproval!.id,
    resolution: "approved",
    task: initial.task,
    plan: initial.plan,
    workspaceRoot,
  });

  assert.equal(resumed.status, "resolved");
  assert.equal(resumed.approval?.status, "approved");
  assert.equal(resumed.task?.status, "completed");
  assert.equal(resumed.plan?.status, "completed");
  assert.ok(resumed.events.some((event) => event.event_type === "step.approved"));
  assert.ok(resumed.events.some((event) => event.event_type === "task.updated"));
  assert.ok(resumed.events.some((event) => event.event_type === "plan.updated"));
  assert.equal(
    resumed.events
      .slice(initial.events.length)
      .filter(isRiskFlaggedEvent).length,
    0,
  );
  assert.equal(
    resumed.plan?.steps.find((step) => step.id === pendingApproval.step_id)?.status,
    "completed",
  );
  assert.equal(resumed.stepResult?.execution.status, "succeeded");
  assert.equal(initial.task.status, "waiting_approval");
  assert.equal(initial.plan.status, "partially_approved");
});

test("risk.flagged follows policy.evaluated for non-allow decisions and carries decision metadata", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const gateway = createApprovalAwareGateway();
  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read", "workspace.write"],
    gateway,
  });

  const result = await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "user_risk_event_contract",
    workspaceRoot,
  });

  const policyIndexes = getEventIndexes(result.events, "policy.evaluated");
  const flaggedIndexes = getEventIndexes(result.events, "risk.flagged");

  assert.equal(flaggedIndexes.length, 1);
  assert.ok(flaggedIndexes[0]! > policyIndexes[0]!);

  const flagged = result.events[flaggedIndexes[0]!]!;
  if (flagged.event_type !== "risk.flagged") {
    throw new Error("expected risk.flagged event");
  }
  assert.equal(flagged.payload.decision, "require_approval");
  assert.equal(flagged.payload.tool_name, "workspace.read_file");
  assert.ok(Array.isArray(flagged.payload.reasons));
  assert.ok(Array.isArray(flagged.payload.deny_reasons));
  assert.equal(typeof flagged.payload.summary, "string");
});

test("run persists created task, drafted plan, stored steps, and final completed states when taskStore/planStore/stepStore are injected", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const taskStore = new InMemoryTaskStore();
  const planStore = new InMemoryPlanStore();
  const stepStore = new InMemoryStepStore();
  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read"],
    taskStore,
    planStore,
    stepStore,
  });

  const result = await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "user_store_success",
    workspaceRoot,
  });

  const persistedTask = taskStore.get(result.task.id);
  const persistedPlan = planStore.get(result.plan.id);
  const persistedSteps = stepStore.listByPlan(result.plan.id);

  assert.ok(persistedTask);
  assert.ok(persistedPlan);
  assert.equal(persistedTask?.status, "completed");
  assert.equal(persistedPlan?.status, "completed");
  assert.equal(persistedSteps.length, result.plan.steps.length);
  assert.ok(persistedSteps.every((step) => step.status === "completed"));
  assert.deepEqual(
    persistedSteps.map((step) => step.id).sort(),
    result.plan.steps.map((step) => step.id).sort(),
  );
});

test("approval-required run persists waiting_approval task state, partially_approved plan state, and waiting_approval step state in injected stores", async (t) => {
  const workspaceRoot = await createTempWorkspace();
  t.after(async () => {
    await rm(workspaceRoot, { recursive: true, force: true });
  });

  const taskStore = new InMemoryTaskStore();
  const planStore = new InMemoryPlanStore();
  const stepStore = new InMemoryStepStore();
  const gateway = createApprovalAwareGateway();
  const orchestrator = new PersonalAgentOrchestrator({
    granted_capabilities: ["workspace.read", "workspace.write"],
    gateway,
    taskStore,
    planStore,
    stepStore,
  });

  const result = await orchestrator.run({
    raw_request: "Inspect the workspace and read the README.",
    created_by: "user_store_waiting",
    workspaceRoot,
  });

  const persistedTask = taskStore.get(result.task.id);
  const persistedPlan = planStore.get(result.plan.id);
  const persistedSteps = stepStore.listByPlan(result.plan.id);

  assert.ok(persistedTask);
  assert.ok(persistedPlan);
  assert.equal(persistedTask?.status, "waiting_approval");
  assert.equal(persistedPlan?.status, "partially_approved");
  assert.equal(persistedSteps.length, result.plan.steps.length);
  assert.deepEqual(
    persistedSteps.map((step) => step.status),
    ["completed", "waiting_approval"],
  );
});
