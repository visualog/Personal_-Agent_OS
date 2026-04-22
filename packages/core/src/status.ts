import type {
  Plan,
  PlanStatus,
  Step,
  StepStatus,
  Task,
  TaskStatus,
} from "./domain.js";

type StepExecutionLike = {
  step: Step;
  execution: {
    status: "succeeded" | "requires_approval" | "denied" | "failed";
  };
};

function deriveStepStatus(result: StepExecutionLike): StepStatus {
  switch (result.execution.status) {
    case "succeeded":
      return "completed";
    case "requires_approval":
      return "waiting_approval";
    case "denied":
      return "blocked";
    case "failed":
      return "failed";
    default:
      return result.step.status;
  }
}

export function applyStepResults(
  steps: readonly Step[],
  results: readonly StepExecutionLike[],
): readonly Step[] {
  const statusByStepId = new Map(
    results.map((result) => [result.step.id, deriveStepStatus(result)]),
  );

  return steps.map((step) => {
    const nextStatus = statusByStepId.get(step.id);
    if (!nextStatus) {
      return step;
    }

    return {
      ...step,
      status: nextStatus,
    };
  });
}

export function derivePlanStatus(steps: readonly Step[]): PlanStatus {
  if (steps.some((step) => step.status === "failed")) {
    return "failed";
  }

  if (steps.some((step) => step.status === "waiting_approval")) {
    return "partially_approved";
  }

  if (steps.every((step) => step.status === "completed" || step.status === "skipped")) {
    return "completed";
  }

  if (steps.some((step) => step.status === "running")) {
    return "running";
  }

  if (steps.some((step) => step.status === "blocked")) {
    return "failed";
  }

  return "drafted";
}

export function deriveTaskStatus(steps: readonly Step[]): TaskStatus {
  if (steps.some((step) => step.status === "failed")) {
    return "failed";
  }

  if (steps.some((step) => step.status === "waiting_approval")) {
    return "waiting_approval";
  }

  if (steps.every((step) => step.status === "completed" || step.status === "skipped")) {
    return "completed";
  }

  if (steps.some((step) => step.status === "running")) {
    return "running";
  }

  if (steps.some((step) => step.status === "blocked")) {
    return "failed";
  }

  return "created";
}

export function withUpdatedPlan(
  plan: Plan,
  steps: readonly Step[],
  updatedAt: string,
): Plan {
  return {
    ...plan,
    steps,
    status: derivePlanStatus(steps),
    updated_at: updatedAt,
  };
}

export function withUpdatedTask(
  task: Task,
  steps: readonly Step[],
  updatedAt: string,
): Task {
  return {
    ...task,
    status: deriveTaskStatus(steps),
    updated_at: updatedAt,
  };
}

export function withCanceledSteps(steps: readonly Step[]): readonly Step[] {
  return steps.map((step) => {
    if (step.status === "completed" || step.status === "failed" || step.status === "skipped") {
      return step;
    }

    return {
      ...step,
      status: "skipped",
    };
  });
}

export function withCanceledPlan(
  plan: Plan,
  steps: readonly Step[],
  updatedAt: string,
): Plan {
  return {
    ...plan,
    steps,
    status: "canceled",
    updated_at: updatedAt,
  };
}

export function withCanceledTask(task: Task, updatedAt: string): Task {
  return {
    ...task,
    status: "canceled",
    updated_at: updatedAt,
  };
}
