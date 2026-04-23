import { randomUUID } from "node:crypto";

import type { ApprovalStore } from "./approval-store.js";
import { InMemoryApprovalStore } from "./approval-store.js";
import type { AuditLog } from "./audit-log.js";
import { InMemoryAuditLog } from "./audit-log.js";
import type { EventBus } from "./event-bus.js";
import { InMemoryEventBus } from "./event-bus.js";
import type { Approval, AuditRecord, Plan, Step, Task } from "./domain.js";
import type { Event } from "./events.js";
import type { Capability } from "./policy.js";
import type { RuntimeControl } from "./runtime-control.js";
import { InMemoryRuntimeControl } from "./runtime-control.js";
import {
  createPlan,
  type PlannerResult,
} from "./planner.js";
import {
  createTask,
  type TaskIntakeResult,
} from "./task-intake.js";
import {
  applyStepResults,
  withCanceledPlan,
  withCanceledSteps,
  withCanceledTask,
  withUpdatedPlan,
  withUpdatedTask,
} from "./status.js";
import type {
  PlanStore,
  StepStore,
  TaskStore,
} from "./state-store.js";
import {
  InMemoryPlanStore,
  InMemoryStepStore,
  InMemoryTaskStore,
} from "./state-store.js";
import {
  InMemoryToolGateway,
  type ToolGatewayTool,
  type ToolExecutionResult,
  type ToolExecutionRequest,
} from "./tool-gateway.js";
import { createWorkspaceToolGatewayTools } from "./workspace-tools.js";

export interface RunTaskInput {
  raw_request: string;
  created_by: string;
  workspaceRoot: string;
  now?: string;
}

export interface OrchestratorDependencies {
  approvalStore?: ApprovalStore;
  eventBus?: EventBus;
  auditLog?: AuditLog;
  gateway?: OrchestratorToolGateway;
  taskStore?: TaskStore;
  planStore?: PlanStore;
  stepStore?: StepStore;
  runtimeControl?: RuntimeControl;
  granted_capabilities?: readonly Capability[];
}

export interface OrchestratorStepResult {
  step: Step;
  execution: ToolExecutionResult;
}

export interface OrchestratorRunResult {
  task: Task;
  plan: Plan;
  approvals: readonly Approval[];
  steps: readonly OrchestratorStepResult[];
  events: readonly Event[];
  auditRecords: readonly AuditRecord[];
}

export interface OrchestratorToolGateway {
  registerTool(tool: ToolGatewayTool): void;
  execute(request: ToolExecutionRequest): Promise<ToolExecutionResult>;
}

export interface ResolveApprovalInput {
  approval_id: string;
  resolution: "approved" | "denied" | "expired";
  task: Task;
  plan: Plan;
  workspaceRoot: string;
  now?: string;
}

export interface ResolveApprovalResult {
  status: "resolved" | "not_found" | "already_resolved" | "step_not_found";
  approval: Approval | null;
  task?: Task;
  plan?: Plan;
  stepResult?: OrchestratorStepResult;
  events: readonly Event[];
  auditRecords: readonly AuditRecord[];
}

export interface CancelTaskInput {
  task: Task;
  plan: Plan;
  reason: string;
  now?: string;
}

export interface CancelTaskResult {
  task: Task;
  plan: Plan;
  approvals: readonly Approval[];
  events: readonly Event[];
  auditRecords: readonly AuditRecord[];
}

function createActionId(): string {
  return `action_${randomUUID()}`;
}

const CODE_FILE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".swift",
  ".kt",
  ".json",
  ".md",
  ".txt",
];

const PATH_HINT_PATTERN = /[`"'(]?([A-Za-z0-9_./-]+\.[A-Za-z0-9]+|[A-Za-z0-9_./-]+\/[A-Za-z0-9_./-]+)[`"')?,]?/g;

function summarizeEvent(event: Event): string {
  switch (event.event_type) {
    case "task.created":
      return `task created: ${event.payload.title}`;
    case "task.updated":
      return `task updated: ${event.payload.status}`;
    case "plan.drafted":
      return `plan drafted: ${event.payload.plan_id}`;
    case "plan.updated":
      return `plan updated: ${event.payload.status}`;
    case "step.ready":
      return `step ready: ${event.payload.step_id}`;
    case "step.approval_requested":
      return `approval requested: ${event.payload.approval_id}`;
    case "step.approved":
      return `approval approved: ${event.payload.approval_id}`;
    case "step.denied":
      return `approval denied: ${event.payload.approval_id}`;
    case "policy.evaluated":
      return `policy evaluated: ${event.payload.decision}`;
    case "risk.flagged":
      return `risk flagged: ${event.payload.decision}`;
    case "action.started":
      return `action started: ${event.payload.tool_name}`;
    case "action.succeeded":
      return `action succeeded: ${event.payload.tool_name}`;
    case "action.failed":
      return `action failed: ${event.payload.tool_name}`;
    default:
      return event.event_type;
  }
}

function createEventBus(eventBus?: EventBus): EventBus {
  return eventBus ?? new InMemoryEventBus();
}

function createAuditLog(auditLog?: AuditLog): AuditLog {
  return auditLog ?? new InMemoryAuditLog();
}

function createApprovalStore(approvalStore?: ApprovalStore): ApprovalStore {
  return approvalStore ?? new InMemoryApprovalStore();
}

function createTaskStore(taskStore?: TaskStore): TaskStore {
  return taskStore ?? new InMemoryTaskStore();
}

function createPlanStore(planStore?: PlanStore): PlanStore {
  return planStore ?? new InMemoryPlanStore();
}

function createStepStore(stepStore?: StepStore): StepStore {
  return stepStore ?? new InMemoryStepStore();
}

function createRuntimeControl(runtimeControl?: RuntimeControl): RuntimeControl {
  return runtimeControl ?? new InMemoryRuntimeControl();
}

export class PersonalAgentOrchestrator {
  private readonly eventBus: EventBus;
  private readonly auditLog: AuditLog;
  private readonly approvalStore: ApprovalStore;
  private readonly taskStore: TaskStore;
  private readonly planStore: PlanStore;
  private readonly stepStore: StepStore;
  private readonly runtimeControl: RuntimeControl;
  private readonly gateway: OrchestratorToolGateway;
  private readonly grantedCapabilities: readonly Capability[];
  private readonly ownsGateway: boolean;

  constructor(dependencies: OrchestratorDependencies = {}) {
    this.eventBus = createEventBus(dependencies.eventBus);
    this.auditLog = createAuditLog(dependencies.auditLog);
    this.approvalStore = createApprovalStore(dependencies.approvalStore);
    this.taskStore = createTaskStore(dependencies.taskStore);
    this.planStore = createPlanStore(dependencies.planStore);
    this.stepStore = createStepStore(dependencies.stepStore);
    this.runtimeControl = createRuntimeControl(dependencies.runtimeControl);
    this.ownsGateway = dependencies.gateway === undefined;
    this.gateway = dependencies.gateway ?? new InMemoryToolGateway();
    this.grantedCapabilities = dependencies.granted_capabilities ?? ["workspace.read"];
  }

  async run(input: RunTaskInput): Promise<OrchestratorRunResult> {
    this.ensureWorkspaceTools(input.workspaceRoot);

    const taskResult: TaskIntakeResult = createTask({
      raw_request: input.raw_request,
      created_by: input.created_by,
      now: input.now,
    });
    const planResult: PlannerResult = createPlan({
      task: taskResult.task,
      workspaceRoot: input.workspaceRoot,
      now: input.now,
    });

    this.publishAndAudit(taskResult.event);
    this.publishAndAudit(planResult.event);
    this.persistTask(taskResult.task);
    this.persistPlan(planResult.plan);
    this.persistSteps(planResult.plan.steps);
    for (const step of planResult.plan.steps) {
      this.publishAndAudit(this.createStepReadyEvent({
        taskId: taskResult.task.id,
        step,
      }));
    }

    const stepResults: OrchestratorStepResult[] = [];
    let listFilesOutput: unknown = undefined;

    for (const step of planResult.plan.steps) {
      const actionId = createActionId();
      const startedEvent = this.createActionStartedEvent({
        actionId,
        step,
        taskId: taskResult.task.id,
      });
      this.publishAndAudit(startedEvent);

      const executionInput = this.buildExecutionInput(step, taskResult.task, listFilesOutput, input.workspaceRoot);
      const execution = await this.gateway.execute({
        action_id: actionId,
        step_id: step.id,
        tool_name: step.tool_name,
        input: executionInput,
        granted_capabilities: this.grantedCapabilities,
        scope_allowed: true,
        approval_granted: false,
        audit_available: true,
        sandbox_matched: true,
        system_lockdown: this.runtimeControl.isLockdownActive(),
        revoked_capabilities: this.runtimeControl.getRevokedCapabilities(),
      });
      if ("policy" in execution && execution.policy) {
        const policyEvent = this.createPolicyEvaluatedEvent({
          taskId: taskResult.task.id,
          step,
          policy: execution.policy,
        });
        this.publishAndAudit(policyEvent);
        const riskEvent = this.createRiskFlaggedEvent({
          taskId: taskResult.task.id,
          step,
          policyEvent,
        });
        if (riskEvent) {
          this.publishAndAudit(riskEvent);
        }
      }

      if (execution.status === "succeeded" && step.tool_name === "workspace.list_files") {
        listFilesOutput = execution.output;
      }

      const finishedEvent =
        execution.status === "succeeded"
          ? this.createActionSucceededEvent({
              actionId,
              step,
              taskId: taskResult.task.id,
              output: execution.output,
            })
          : execution.status === "requires_approval"
            ? this.createApprovalRequestedEvent({
                taskId: taskResult.task.id,
                step,
                approval: this.approvalStore.create({
                  task_id: taskResult.task.id,
                  step_id: step.id,
                  summary: `${step.title} 승인 필요`,
                  risk_reasons: execution.policy?.reasons ?? [],
                  requested_at: input.now,
                }),
              })
            : this.createActionFailedEvent({
                actionId,
                step,
                taskId: taskResult.task.id,
                execution,
              });

      this.publishAndAudit(finishedEvent);
      stepResults.push({ step, execution });
    }

    const finalizedSteps = applyStepResults(planResult.plan.steps, stepResults);
    const finalizedPlan = withUpdatedPlan(
      planResult.plan,
      finalizedSteps,
      input.now ?? new Date().toISOString(),
    );
    const finalizedTask = withUpdatedTask(
      taskResult.task,
      finalizedSteps,
      input.now ?? new Date().toISOString(),
    );
    this.publishAndAudit(this.createPlanUpdatedEvent({
      previousStatus: planResult.plan.status,
      plan: finalizedPlan,
    }));
    this.publishAndAudit(this.createTaskUpdatedEvent({
      previousStatus: taskResult.task.status,
      task: finalizedTask,
    }));
    this.persistTask(finalizedTask);
    this.persistPlan(finalizedPlan);
    this.persistSteps(finalizedSteps);

    return {
      task: finalizedTask,
      plan: finalizedPlan,
      approvals: this.approvalStore.list(),
      steps: stepResults.map((result) => ({
        step: finalizedSteps.find((step) => step.id === result.step.id) ?? result.step,
        execution: result.execution,
      })),
      events: this.eventBus.getEvents(),
      auditRecords: this.auditLog.getRecords(),
    };
  }

  async resolveApproval(input: ResolveApprovalInput): Promise<ResolveApprovalResult> {
    this.ensureWorkspaceTools(input.workspaceRoot);

    const resolvedApproval = this.approvalStore.resolve(
      input.approval_id,
      input.resolution,
      input.now,
    );

    if (resolvedApproval === null) {
      const currentApproval = this.approvalStore.get(input.approval_id);
      return {
        status: currentApproval ? "already_resolved" : "not_found",
        approval: currentApproval,
        events: this.eventBus.getEvents(),
        auditRecords: this.auditLog.getRecords(),
      };
    }

    const step = input.plan.steps.find((candidate) => candidate.id === resolvedApproval.step_id);
    if (!step) {
      return {
        status: "step_not_found",
        approval: resolvedApproval,
        events: this.eventBus.getEvents(),
        auditRecords: this.auditLog.getRecords(),
      };
    }

    if (input.resolution !== "approved") {
      this.publishAndAudit(this.createApprovalDeniedEvent({
        taskId: input.task.id,
        approval: resolvedApproval,
      }));

      const deniedSteps = input.plan.steps.map((step) =>
        step.id === resolvedApproval.step_id
          ? { ...step, status: "blocked" as const }
          : step,
      );

      const finalizedTask = withUpdatedTask(
        input.task,
        deniedSteps,
        input.now ?? new Date().toISOString(),
      );
      const finalizedPlan = withUpdatedPlan(
        input.plan,
        deniedSteps,
        input.now ?? new Date().toISOString(),
      );
      this.publishAndAudit(this.createPlanUpdatedEvent({
        previousStatus: input.plan.status,
        plan: finalizedPlan,
      }));
      this.publishAndAudit(this.createTaskUpdatedEvent({
        previousStatus: input.task.status,
        task: finalizedTask,
      }));
      this.persistTask(finalizedTask);
      this.persistPlan(finalizedPlan);
      this.persistSteps(deniedSteps);

      return {
        status: "resolved",
        approval: resolvedApproval,
        task: finalizedTask,
        plan: finalizedPlan,
        events: this.eventBus.getEvents(),
        auditRecords: this.auditLog.getRecords(),
      };
    }

    this.publishAndAudit(this.createApprovalApprovedEvent({
      taskId: input.task.id,
      approval: resolvedApproval,
    }));
    this.publishAndAudit(this.createStepReadyEvent({
      taskId: input.task.id,
      step: {
        ...step,
        status: "ready",
      },
    }));

    const stepResult = await this.executeStep({
      step,
      task: input.task,
      taskId: input.task.id,
      workspaceRoot: input.workspaceRoot,
      listFilesOutput: undefined,
      approvalGranted: true,
    });

    const resumedSteps = applyStepResults(
      input.plan.steps.map((candidate) =>
        candidate.id === step.id ? { ...candidate, status: "running" as const } : candidate,
      ),
      [stepResult],
    );
    const finalizedTask = withUpdatedTask(
      input.task,
      resumedSteps,
      input.now ?? new Date().toISOString(),
    );
    const finalizedPlan = withUpdatedPlan(
      input.plan,
      resumedSteps,
      input.now ?? new Date().toISOString(),
    );
    this.publishAndAudit(this.createPlanUpdatedEvent({
      previousStatus: input.plan.status,
      plan: finalizedPlan,
    }));
    this.publishAndAudit(this.createTaskUpdatedEvent({
      previousStatus: input.task.status,
      task: finalizedTask,
    }));
    this.persistTask(finalizedTask);
    this.persistPlan(finalizedPlan);
    this.persistSteps(resumedSteps);

    return {
      status: "resolved",
      approval: resolvedApproval,
      stepResult,
      task: finalizedTask,
      plan: finalizedPlan,
      events: this.eventBus.getEvents(),
      auditRecords: this.auditLog.getRecords(),
    };
  }

  async resumeApproval(input: ResolveApprovalInput): Promise<ResolveApprovalResult> {
    return this.resolveApproval(input);
  }

  cancelTask(input: CancelTaskInput): CancelTaskResult {
    const updatedAt = input.now ?? new Date().toISOString();

    for (const approval of this.approvalStore.listByTask(input.task.id)) {
      if (approval.status === "requested") {
        this.approvalStore.resolve(approval.id, "expired", updatedAt);
      }
    }

    const canceledSteps = withCanceledSteps(input.plan.steps);
    const canceledPlan = withCanceledPlan(input.plan, canceledSteps, updatedAt);
    const canceledTask = withCanceledTask(input.task, updatedAt);

    this.publishAndAudit(this.createPlanUpdatedEvent({
      previousStatus: input.plan.status,
      plan: canceledPlan,
    }));
    this.publishAndAudit(this.createTaskUpdatedEvent({
      previousStatus: input.task.status,
      task: canceledTask,
    }));
    this.persistTask(canceledTask);
    this.persistPlan(canceledPlan);
    this.persistSteps(canceledSteps);

    return {
      task: canceledTask,
      plan: canceledPlan,
      approvals: this.approvalStore.listByTask(input.task.id),
      events: this.eventBus.getEvents(),
      auditRecords: this.auditLog.getRecords(),
    };
  }

  private publishAndAudit(event: Event): void {
    this.eventBus.publish(event);
    this.auditLog.recordEvent(event, summarizeEvent(event));
  }

  private persistTask(task: Task): void {
    this.taskStore.save(task);
  }

  private persistPlan(plan: Plan): void {
    this.planStore.save(plan);
  }

  private persistSteps(steps: readonly Step[]): void {
    for (const step of steps) {
      this.stepStore.save(step);
    }
  }

  private ensureWorkspaceTools(workspaceRoot: string): void {
    if (!this.ownsGateway) {
      return;
    }

    for (const tool of createWorkspaceToolGatewayTools({ root: workspaceRoot })) {
      this.gateway.registerTool(tool);
    }
  }

  private async executeStep({
    step,
    task,
    taskId,
    workspaceRoot,
    listFilesOutput,
    approvalGranted,
  }: {
    step: Step;
    task: Task;
    taskId: string;
    workspaceRoot: string;
    listFilesOutput: unknown;
    approvalGranted: boolean;
  }): Promise<OrchestratorStepResult> {
    const actionId = createActionId();
    const startedEvent = this.createActionStartedEvent({
      actionId,
      step,
      taskId,
    });
    this.publishAndAudit(startedEvent);

    const executionInput = this.buildExecutionInput(step, task, listFilesOutput, workspaceRoot);
    const execution = await this.gateway.execute({
      action_id: actionId,
      step_id: step.id,
      tool_name: step.tool_name,
      input: executionInput,
      granted_capabilities: this.grantedCapabilities,
      scope_allowed: true,
      approval_granted: approvalGranted,
      audit_available: true,
      sandbox_matched: true,
      system_lockdown: this.runtimeControl.isLockdownActive(),
      revoked_capabilities: this.runtimeControl.getRevokedCapabilities(),
    });
    if ("policy" in execution && execution.policy) {
      const policyEvent = this.createPolicyEvaluatedEvent({
        taskId,
        step,
        policy: execution.policy,
      });
      this.publishAndAudit(policyEvent);
      const riskEvent = this.createRiskFlaggedEvent({
        taskId,
        step,
        policyEvent,
      });
      if (riskEvent) {
        this.publishAndAudit(riskEvent);
      }
    }

    const finishedEvent =
      execution.status === "succeeded"
        ? this.createActionSucceededEvent({
            actionId,
            step,
            taskId,
            output: execution.output,
          })
        : execution.status === "requires_approval"
          ? this.createApprovalRequestedEvent({
              taskId,
              step,
              approval:
                this.approvalStore.findPendingByStep(taskId, step.id) ??
                this.approvalStore.create({
                  task_id: taskId,
                  step_id: step.id,
                  summary: `${step.title} 승인 필요`,
                  risk_reasons: execution.policy?.reasons ?? [],
                }),
            })
          : this.createActionFailedEvent({
              actionId,
              step,
              taskId,
              execution,
            });

    this.publishAndAudit(finishedEvent);

    return { step, execution };
  }

  private createActionStartedEvent({
    actionId,
    step,
    taskId,
  }: {
    actionId: string;
    step: Step;
    taskId: string;
  }): Event {
    return {
      event_id: `evt_${randomUUID()}`,
      event_type: "action.started",
      timestamp: new Date().toISOString(),
      actor: "agent",
      task_id: taskId,
      trace_id: `trace_${randomUUID()}`,
      payload: {
        action_id: actionId,
        step_id: step.id,
        tool_name: step.tool_name,
        idempotency_key: actionId,
        timeout_ms: 30_000,
      },
    };
  }

  private createStepReadyEvent({
    taskId,
    step,
  }: {
    taskId: string;
    step: Step;
  }): Event {
    return {
      event_id: `evt_${randomUUID()}`,
      event_type: "step.ready",
      timestamp: new Date().toISOString(),
      actor: "agent",
      task_id: taskId,
      trace_id: `trace_${randomUUID()}`,
      payload: {
        plan_id: step.plan_id,
        step_id: step.id,
        tool_name: step.tool_name,
        status: "ready",
        risk_level: step.risk_level,
        depends_on: [...step.depends_on],
      },
    };
  }

  private createPolicyEvaluatedEvent({
    taskId,
    step,
    policy,
  }: {
    taskId: string;
    step: Step;
    policy: NonNullable<Extract<ToolExecutionResult, { policy: unknown }>["policy"]>;
  }): Extract<Event, { event_type: "policy.evaluated" }> {
    return {
      event_id: `evt_${randomUUID()}`,
      event_type: "policy.evaluated",
      timestamp: new Date().toISOString(),
      actor: "system",
      task_id: taskId,
      trace_id: `trace_${randomUUID()}`,
      payload: {
        policy_decision_id: `pol_${randomUUID()}`,
        step_id: step.id,
        tool_name: step.tool_name,
        decision: policy.decision,
        risk_level: policy.risk_level,
        required_capabilities: [...step.required_capabilities],
        reasons: [...policy.reasons],
        deny_reasons: [...policy.deny_reasons],
      },
    };
  }

  private createRiskFlaggedEvent({
    taskId,
    step,
    policyEvent,
  }: {
    taskId: string;
    step: Step;
    policyEvent: Extract<Event, { event_type: "policy.evaluated" }>;
  }): Event | null {
    if (
      policyEvent.payload.decision !== "require_approval" &&
      policyEvent.payload.decision !== "deny"
    ) {
      return null;
    }

    const summary =
      policyEvent.payload.decision === "require_approval"
        ? `${step.tool_name} requires approval`
        : `${step.tool_name} denied by policy`;

    return {
      event_id: `evt_${randomUUID()}`,
      event_type: "risk.flagged",
      timestamp: new Date().toISOString(),
      actor: "system",
      task_id: taskId,
      trace_id: `trace_${randomUUID()}`,
      payload: {
        policy_decision_id: policyEvent.payload.policy_decision_id,
        step_id: step.id,
        tool_name: step.tool_name,
        decision: policyEvent.payload.decision,
        risk_level: policyEvent.payload.risk_level,
        required_capabilities: [...policyEvent.payload.required_capabilities],
        reasons: [...policyEvent.payload.reasons],
        deny_reasons: [...policyEvent.payload.deny_reasons],
        summary,
      },
    };
  }

  private createActionSucceededEvent({
    actionId,
    step,
    taskId,
    output,
  }: {
    actionId: string;
    step: Step;
    taskId: string;
    output: unknown;
  }): Event {
    return {
      event_id: `evt_${randomUUID()}`,
      event_type: "action.succeeded",
      timestamp: new Date().toISOString(),
      actor: "agent",
      task_id: taskId,
      trace_id: `trace_${randomUUID()}`,
      payload: {
        action_id: actionId,
        step_id: step.id,
        tool_name: step.tool_name,
        output_ref: JSON.stringify(output ?? null),
        summary: "action completed successfully",
      },
    };
  }

  private createActionFailedEvent({
    actionId,
    step,
    taskId,
    execution,
  }: {
    actionId: string;
    step: Step;
    taskId: string;
    execution: ToolExecutionResult;
  }): Event {
    const errorCode =
      execution.status === "denied"
        ? "denied"
        : execution.status === "requires_approval"
          ? "requires_approval"
          : "tool_failed";

    return {
      event_id: `evt_${randomUUID()}`,
      event_type: "action.failed",
      timestamp: new Date().toISOString(),
      actor: "agent",
      task_id: taskId,
      trace_id: `trace_${randomUUID()}`,
      payload: {
        action_id: actionId,
        step_id: step.id,
        tool_name: step.tool_name,
        error_code: errorCode,
        retryable: execution.status === "failed",
        summary: `action ${execution.status}`,
      },
    };
  }

  private createApprovalRequestedEvent({
    taskId,
    step,
    approval,
  }: {
    taskId: string;
    step: Step;
    approval: Approval;
  }): Event {
    return {
      event_id: `evt_${randomUUID()}`,
      event_type: "step.approval_requested",
      timestamp: approval.requested_at,
      actor: "system",
      task_id: taskId,
      trace_id: `trace_${randomUUID()}`,
      payload: {
        approval_id: approval.id,
        step_id: step.id,
        summary: approval.summary,
        risk_reasons: [...approval.risk_reasons],
        expires_at: "",
      },
    };
  }

  private createApprovalApprovedEvent({
    taskId,
    approval,
  }: {
    taskId: string;
    approval: Approval;
  }): Event {
    return {
      event_id: `evt_${randomUUID()}`,
      event_type: "step.approved",
      timestamp: approval.resolved_at ?? new Date().toISOString(),
      actor: "user",
      task_id: taskId,
      trace_id: `trace_${randomUUID()}`,
      payload: {
        approval_id: approval.id,
        step_id: approval.step_id,
        resolved_at: approval.resolved_at ?? new Date().toISOString(),
        summary: approval.summary,
      },
    };
  }

  private createTaskUpdatedEvent({
    previousStatus,
    task,
  }: {
    previousStatus: Task["status"];
    task: Task;
  }): Event {
    return {
      event_id: `evt_${randomUUID()}`,
      event_type: "task.updated",
      timestamp: task.updated_at,
      actor: "agent",
      task_id: task.id,
      trace_id: `trace_${randomUUID()}`,
      payload: {
        status: task.status,
        previous_status: previousStatus,
        summary: `task status changed to ${task.status}`,
      },
    };
  }

  private createPlanUpdatedEvent({
    previousStatus,
    plan,
  }: {
    previousStatus: Plan["status"];
    plan: Plan;
  }): Event {
    return {
      event_id: `evt_${randomUUID()}`,
      event_type: "plan.updated",
      timestamp: plan.updated_at,
      actor: "agent",
      task_id: plan.task_id,
      trace_id: `trace_${randomUUID()}`,
      payload: {
        plan_id: plan.id,
        status: plan.status,
        previous_status: previousStatus,
        summary: `plan status changed to ${plan.status}`,
      },
    };
  }

  private createApprovalDeniedEvent({
    taskId,
    approval,
  }: {
    taskId: string;
    approval: Approval;
  }): Event {
    return {
      event_id: `evt_${randomUUID()}`,
      event_type: "step.denied",
      timestamp: approval.resolved_at ?? new Date().toISOString(),
      actor: "user",
      task_id: taskId,
      trace_id: `trace_${randomUUID()}`,
      payload: {
        approval_id: approval.id,
        step_id: approval.step_id,
        resolved_at: approval.resolved_at ?? new Date().toISOString(),
        summary: approval.summary,
      },
    };
  }

  private buildExecutionInput(
    step: Step,
    task: Task,
    listFilesOutput: unknown,
    workspaceRoot: string,
  ): unknown {
    const entries = this.extractListFilesEntries(listFilesOutput);

    if (step.tool_name === "workspace.list_files") {
      return { root: workspaceRoot };
    }

    if (step.tool_name === "workspace.read_file") {
      const explicitTargetPath = this.findRequestedWorkspacePath(task.raw_request, entries);
      const firstFilePath = explicitTargetPath
        ?? entries.find((entry) => entry.type === "file")?.path;
      return {
        root: workspaceRoot,
        path: firstFilePath ?? "README.md",
      };
    }

    if (step.tool_name === "workspace.write_draft") {
      const candidateFiles = this.selectCandidateFiles(entries);
      const explicitTargetPath = this.findRequestedWorkspacePath(task.raw_request, entries);
      const candidateList = candidateFiles
        .slice(0, 5)
        .map((entry) => `- ${entry.path}`)
        .join("\n");
      const applyInstruction = explicitTargetPath
        ? `- 승인 후 ${explicitTargetPath}에 제한된 append 수정이 적용됩니다.`
        : "- 실제 파일 수정을 원하면 다음 요청에 대상 파일 경로를 포함해 주세요. 예: packages/core/src/orchestrator.ts";

      return {
        root: workspaceRoot,
        path: `docs/agent-drafts/${task.id}.md`,
        content: [
          "# Agent Draft",
          "",
          `Task ID: ${task.id}`,
          `Request: ${task.raw_request}`,
          "",
          "Explicit target:",
          explicitTargetPath ?? "명시되지 않음",
          "",
          "Candidate files:",
          candidateList || "- README.md",
          "",
          "Planned change:",
          explicitTargetPath
            ? `- ${explicitTargetPath}에 승인 기반 수정 메모를 append`
            : "- 우선 제안 초안만 생성",
          "",
          "Next step:",
          applyInstruction,
        ].join("\n"),
      };
    }

    if (step.tool_name === "workspace.apply_file_edit") {
      const explicitTargetPath = this.findRequestedWorkspacePath(task.raw_request, entries);
      const targetPath = explicitTargetPath ?? "README.md";

      return {
        root: workspaceRoot,
        path: targetPath,
        mode: "append",
        content: this.buildApprovedChangeBlock(task, targetPath),
      };
    }

    if (step.tool_name === "workspace.write_file") {
      return {
        root: workspaceRoot,
        path: `docs/agent-drafts/${task.id}.md`,
        content: [
          "# Agent Draft",
          "",
          `Task ID: ${task.id}`,
          `Request: ${task.raw_request}`,
        ].join("\n"),
      };
    }

    return {};
  }

  private extractListFilesEntries(
    output: unknown,
  ): Array<{ path: string; type?: string }> {
    if (!output || typeof output !== "object" || Array.isArray(output)) {
      return [];
    }

    const entries = (output as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) {
      return [];
    }

    return entries
      .filter(
        (entry): entry is { path: string; type?: string } =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as { path?: unknown }).path === "string",
      )
      .map((entry) => ({
        path: entry.path,
        type: typeof entry.type === "string" ? entry.type : undefined,
      }));
  }

  private findRequestedWorkspacePath(
    rawRequest: string,
    entries: Array<{ path: string; type?: string }>,
  ): string | null {
    const fileEntries = entries.filter((entry) => entry.type === "file");
    const matches = [...rawRequest.matchAll(PATH_HINT_PATTERN)];

    for (const match of matches) {
      const token = match[1]?.replace(/^[./]+/, (value) => (value === "./" ? "" : value)) ?? "";
      if (!token) {
        continue;
      }

      const exactMatch = fileEntries.find((entry) => entry.path === token);
      if (exactMatch) {
        return exactMatch.path;
      }

      const baseNameMatches = fileEntries.filter((entry) => entry.path.endsWith(`/${token}`) || entry.path === token);
      if (baseNameMatches.length === 1) {
        return baseNameMatches[0]?.path ?? null;
      }
    }

    return null;
  }

  private selectCandidateFiles(
    entries: Array<{ path: string; type?: string }>,
  ): Array<{ path: string; type?: string }> {
    const fileEntries = entries.filter((entry) => entry.type === "file");
    const preferred = fileEntries.filter((entry) =>
      CODE_FILE_EXTENSIONS.some((extension) => entry.path.endsWith(extension)),
    );

    return preferred.length > 0 ? preferred : fileEntries;
  }

  private buildApprovedChangeBlock(task: Task, targetPath: string): string {
    const extension = targetPath.includes(".")
      ? targetPath.slice(targetPath.lastIndexOf("."))
      : "";

    if ([".py", ".rb", ".sh", ".yaml", ".yml"].includes(extension)) {
      return [
        "",
        `# PAOS approved change note (${task.id})`,
        `# Request: ${task.raw_request}`,
        "# Follow-up: replace this note with a concrete implementation patch.",
      ].join("\n");
    }

    if (extension === ".md" || extension === ".txt") {
      return [
        "",
        "## PAOS Approved Change Note",
        "",
        `- task_id: ${task.id}`,
        `- request: ${task.raw_request}`,
        "- follow_up: replace this note with a concrete implementation patch.",
      ].join("\n");
    }

    return [
      "",
      `// PAOS approved change note (${task.id})`,
      `// Request: ${task.raw_request}`,
      "// Follow-up: replace this note with a concrete implementation patch.",
    ].join("\n");
  }
}
