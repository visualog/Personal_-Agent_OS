import type { Plan, Step, Task } from "./domain.js";

function cloneTask(task: Task): Task {
  return { ...task };
}

function cloneStep(step: Step): Step {
  return {
    ...step,
    required_capabilities: [...step.required_capabilities],
    depends_on: [...step.depends_on],
  };
}

function clonePlan(plan: Plan): Plan {
  return {
    ...plan,
    steps: plan.steps.map(cloneStep),
  };
}

export interface TaskStore {
  save(task: Task): void;
  get(id: string): Task | null;
  list(): readonly Task[];
  clear(): void;
}

export interface PlanStore {
  save(plan: Plan): void;
  get(id: string): Plan | null;
  list(): readonly Plan[];
  clear(): void;
}

export interface StepStore {
  save(step: Step): void;
  get(id: string): Step | null;
  list(): readonly Step[];
  listByPlan(planId: string): readonly Step[];
  clear(): void;
}

export class InMemoryTaskStore implements TaskStore {
  private readonly tasks = new Map<string, Task>();

  save(task: Task): void {
    this.tasks.set(task.id, cloneTask(task));
  }

  get(id: string): Task | null {
    const task = this.tasks.get(id);
    return task ? cloneTask(task) : null;
  }

  list(): readonly Task[] {
    return Array.from(this.tasks.values(), cloneTask);
  }

  clear(): void {
    this.tasks.clear();
  }
}

export class InMemoryPlanStore implements PlanStore {
  private readonly plans = new Map<string, Plan>();

  save(plan: Plan): void {
    this.plans.set(plan.id, clonePlan(plan));
  }

  get(id: string): Plan | null {
    const plan = this.plans.get(id);
    return plan ? clonePlan(plan) : null;
  }

  list(): readonly Plan[] {
    return Array.from(this.plans.values(), clonePlan);
  }

  clear(): void {
    this.plans.clear();
  }
}

export class InMemoryStepStore implements StepStore {
  private readonly steps = new Map<string, Step>();

  save(step: Step): void {
    this.steps.set(step.id, cloneStep(step));
  }

  get(id: string): Step | null {
    const step = this.steps.get(id);
    return step ? cloneStep(step) : null;
  }

  list(): readonly Step[] {
    return Array.from(this.steps.values(), cloneStep);
  }

  listByPlan(planId: string): readonly Step[] {
    return Array.from(this.steps.values())
      .filter((step) => step.plan_id === planId)
      .map(cloneStep);
  }

  clear(): void {
    this.steps.clear();
  }
}
