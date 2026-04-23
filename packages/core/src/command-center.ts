import type { ApprovalStore } from "./approval-store.js";
import { InMemoryApprovalStore } from "./approval-store.js";
import type { AuditLog } from "./audit-log.js";
import { InMemoryAuditLog } from "./audit-log.js";
import type { Approval, AuditRecord, Plan, Step, Task } from "./domain.js";
import type { EventBus } from "./event-bus.js";
import { InMemoryEventBus } from "./event-bus.js";
import type {
  InMemoryRuntimeReadModel,
  RuntimeReadModelDependencies,
  TaskRuntimeView,
} from "./read-model.js";
import { InMemoryRuntimeReadModel as DefaultRuntimeReadModel } from "./read-model.js";
import type { PlanStore, StepStore, TaskStore } from "./state-store.js";
import {
  InMemoryPlanStore,
  InMemoryStepStore,
  InMemoryTaskStore,
} from "./state-store.js";

export interface CommandCenterDependencies extends RuntimeReadModelDependencies {
  auditLog?: AuditLog;
  readModel?: InMemoryRuntimeReadModel;
}

export interface CommandCenterTaskListItem {
  task_id: string;
  title: string;
  status: Task["status"];
  priority: Task["priority"];
  sensitivity: Task["sensitivity"];
  pending_approval_count: number;
  risk_flag_count: number;
  updated_at: string;
}

export interface CommandCenterApprovalCard {
  approval_id: string;
  task_id: string;
  step_id: string;
  title: string;
  summary: string;
  risk_reasons: readonly string[];
  actions: readonly ["approve", "deny", "request_changes", "cancel_task"];
}

export interface CommandCenterTaskDetail {
  task: Task | null;
  plans: readonly Plan[];
  steps: readonly Step[];
  approvals: readonly Approval[];
  risk_flags: TaskRuntimeView["riskFlags"];
  timeline: TaskRuntimeView["timeline"];
  audit_records: readonly AuditRecord[];
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

function createApprovalStore(approvalStore?: ApprovalStore): ApprovalStore {
  return approvalStore ?? new InMemoryApprovalStore();
}

function createEventBus(eventBus?: EventBus): EventBus {
  return eventBus ?? new InMemoryEventBus();
}

function createAuditLog(auditLog?: AuditLog): AuditLog {
  return auditLog ?? new InMemoryAuditLog();
}

function byUpdatedAt<T extends { updated_at: string }>(left: T, right: T): number {
  return right.updated_at.localeCompare(left.updated_at);
}

export class InMemoryCommandCenter {
  private readonly taskStore: TaskStore;
  private readonly approvalStore: ApprovalStore;
  private readonly auditLog: AuditLog;
  private readonly readModel: InMemoryRuntimeReadModel;

  constructor(dependencies: CommandCenterDependencies = {}) {
    this.taskStore = createTaskStore(dependencies.taskStore);
    const planStore = createPlanStore(dependencies.planStore);
    const stepStore = createStepStore(dependencies.stepStore);
    this.approvalStore = createApprovalStore(dependencies.approvalStore);
    const eventBus = createEventBus(dependencies.eventBus);
    this.auditLog = createAuditLog(dependencies.auditLog);
    this.readModel = dependencies.readModel ?? new DefaultRuntimeReadModel({
      taskStore: this.taskStore,
      planStore,
      stepStore,
      approvalStore: this.approvalStore,
      eventBus,
    });
  }

  listTaskItems(): readonly CommandCenterTaskListItem[] {
    return this.taskStore.list()
      .slice()
      .sort(byUpdatedAt)
      .map((task) => {
        const view = this.readModel.getTaskRuntimeView(task.id);
        return {
          task_id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          sensitivity: task.sensitivity,
          pending_approval_count: view.pendingApprovals.length,
          risk_flag_count: view.riskFlags.length,
          updated_at: task.updated_at,
        };
      });
  }

  listApprovalQueue(): readonly CommandCenterApprovalCard[] {
    return this.approvalStore.listPending().map((approval) => {
      const view = this.readModel.getTaskRuntimeView(approval.task_id);
      const taskTitle = view.task?.title ?? "대기 중인 작업";
      return {
        approval_id: approval.id,
        task_id: approval.task_id,
        step_id: approval.step_id,
        title: taskTitle,
        summary: approval.summary,
        risk_reasons: approval.risk_reasons,
        actions: ["approve", "deny", "request_changes", "cancel_task"],
      };
    });
  }

  getTaskDetail(taskId: string): CommandCenterTaskDetail {
    const view = this.readModel.getTaskRuntimeView(taskId);
    return {
      task: view.task,
      plans: view.plans,
      steps: view.steps,
      approvals: view.approvals,
      risk_flags: view.riskFlags,
      timeline: view.timeline,
      audit_records: this.auditLog.getRecordsByTaskId(taskId),
    };
  }
}
