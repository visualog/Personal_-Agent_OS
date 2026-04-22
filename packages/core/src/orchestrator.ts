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
import {
  createPlan,
  type PlannerResult,
} from "./planner.js";
import {
  createTask,
  type TaskIntakeResult,
} from "./task-intake.js";
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

function createActionId(): string {
  return `action_${randomUUID()}`;
}

function summarizeEvent(event: Event): string {
  switch (event.event_type) {
    case "task.created":
      return `task created: ${event.payload.title}`;
    case "plan.drafted":
      return `plan drafted: ${event.payload.plan_id}`;
    case "step.approval_requested":
      return `approval requested: ${event.payload.approval_id}`;
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

export class PersonalAgentOrchestrator {
  private readonly eventBus: EventBus;
  private readonly auditLog: AuditLog;
  private readonly approvalStore: ApprovalStore;
  private readonly gateway: OrchestratorToolGateway;
  private readonly grantedCapabilities: readonly Capability[];
  private readonly ownsGateway: boolean;

  constructor(dependencies: OrchestratorDependencies = {}) {
    this.eventBus = createEventBus(dependencies.eventBus);
    this.auditLog = createAuditLog(dependencies.auditLog);
    this.approvalStore = createApprovalStore(dependencies.approvalStore);
    this.ownsGateway = dependencies.gateway === undefined;
    this.gateway = dependencies.gateway ?? new InMemoryToolGateway();
    this.grantedCapabilities = dependencies.granted_capabilities ?? ["workspace.read"];
  }

  async run(input: RunTaskInput): Promise<OrchestratorRunResult> {
    if (this.ownsGateway) {
      for (const tool of createWorkspaceToolGatewayTools({ root: input.workspaceRoot })) {
        this.gateway.registerTool(tool);
      }
    }

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

      const executionInput = this.buildExecutionInput(step, listFilesOutput, input.workspaceRoot);
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
      });

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

    return {
      task: taskResult.task,
      plan: planResult.plan,
      approvals: this.approvalStore.list(),
      steps: stepResults,
      events: this.eventBus.getEvents(),
      auditRecords: this.auditLog.getRecords(),
    };
  }

  private publishAndAudit(event: Event): void {
    this.eventBus.publish(event);
    this.auditLog.recordEvent(event, summarizeEvent(event));
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

  private buildExecutionInput(
    step: Step,
    listFilesOutput: unknown,
    workspaceRoot: string,
  ): unknown {
    if (step.tool_name === "workspace.list_files") {
      return { root: workspaceRoot };
    }

    if (step.tool_name === "workspace.read_file") {
      const entries = this.extractListFilesEntries(listFilesOutput);
      const firstFilePath = entries.find((entry) => entry.type === "file")?.path;
      return {
        root: workspaceRoot,
        path: firstFilePath ?? "README.md",
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
}
