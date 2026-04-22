import type { ApprovalStore } from "./approval-store.js";
import { InMemoryApprovalStore } from "./approval-store.js";
import type { Approval, Plan, Step, Task } from "./domain.js";
import type { Event, EventType } from "./events.js";
import type { EventBus } from "./event-bus.js";
import { InMemoryEventBus } from "./event-bus.js";
import type { PlanStore, StepStore, TaskStore } from "./state-store.js";
import {
  InMemoryPlanStore,
  InMemoryStepStore,
  InMemoryTaskStore,
} from "./state-store.js";

export interface RuntimeReadModelDependencies {
  taskStore?: TaskStore;
  planStore?: PlanStore;
  stepStore?: StepStore;
  approvalStore?: ApprovalStore;
  eventBus?: EventBus;
}

export interface TaskRuntimeView {
  task: Task | null;
  plans: readonly Plan[];
  steps: readonly Step[];
  approvals: readonly Approval[];
  pendingApprovals: readonly Approval[];
  riskFlags: readonly Extract<Event, { event_type: "risk.flagged" }>[];
  timeline: readonly Event[];
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

function byTimestamp<T extends { timestamp?: string; created_at?: string; updated_at?: string }>(
  left: T,
  right: T,
): number {
  const leftValue = left.timestamp ?? left.updated_at ?? left.created_at ?? "";
  const rightValue = right.timestamp ?? right.updated_at ?? right.created_at ?? "";
  return leftValue.localeCompare(rightValue);
}

function isRiskFlaggedEvent(event: Event): event is Extract<Event, { event_type: "risk.flagged" }> {
  return event.event_type === "risk.flagged";
}

export class InMemoryRuntimeReadModel {
  private readonly taskStore: TaskStore;
  private readonly planStore: PlanStore;
  private readonly stepStore: StepStore;
  private readonly approvalStore: ApprovalStore;
  private readonly eventBus: EventBus;

  constructor(dependencies: RuntimeReadModelDependencies = {}) {
    this.taskStore = createTaskStore(dependencies.taskStore);
    this.planStore = createPlanStore(dependencies.planStore);
    this.stepStore = createStepStore(dependencies.stepStore);
    this.approvalStore = createApprovalStore(dependencies.approvalStore);
    this.eventBus = createEventBus(dependencies.eventBus);
  }

  getTask(taskId: string): Task | null {
    return this.taskStore.get(taskId);
  }

  listTasks(): readonly Task[] {
    return this.taskStore.list().slice().sort(byTimestamp);
  }

  listPlansByTask(taskId: string): readonly Plan[] {
    return this.planStore.list()
      .filter((plan) => plan.task_id === taskId)
      .sort(byTimestamp);
  }

  listStepsByTask(taskId: string): readonly Step[] {
    const planIds = new Set(this.listPlansByTask(taskId).map((plan) => plan.id));
    return this.stepStore.list()
      .filter((step) => planIds.has(step.plan_id))
      .sort((left, right) => left.id.localeCompare(right.id));
  }

  listApprovalsByTask(taskId: string): readonly Approval[] {
    return this.approvalStore.listByTask(taskId).slice().sort((left, right) => {
      return left.requested_at.localeCompare(right.requested_at);
    });
  }

  listPendingApprovals(taskId?: string): readonly Approval[] {
    const approvals = taskId
      ? this.approvalStore.listByTask(taskId)
      : this.approvalStore.listPending();

    return approvals
      .filter((approval) => approval.status === "requested")
      .slice()
      .sort((left, right) => left.requested_at.localeCompare(right.requested_at));
  }

  listEventsByTask(taskId: string, eventType?: EventType): readonly Event[] {
    return this.eventBus.getEvents()
      .filter((event) => event.task_id === taskId)
      .filter((event) => eventType === undefined || event.event_type === eventType)
      .slice()
      .sort(byTimestamp);
  }

  listRiskFlagsByTask(taskId: string): readonly Extract<Event, { event_type: "risk.flagged" }>[] {
    return this.listEventsByTask(taskId, "risk.flagged")
      .filter(isRiskFlaggedEvent);
  }

  getTaskRuntimeView(taskId: string): TaskRuntimeView {
    return {
      task: this.getTask(taskId),
      plans: this.listPlansByTask(taskId),
      steps: this.listStepsByTask(taskId),
      approvals: this.listApprovalsByTask(taskId),
      pendingApprovals: this.listPendingApprovals(taskId),
      riskFlags: this.listRiskFlagsByTask(taskId),
      timeline: this.listEventsByTask(taskId),
    };
  }
}
