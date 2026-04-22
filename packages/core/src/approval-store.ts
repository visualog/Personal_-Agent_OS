import { randomUUID } from "node:crypto";

import type { Approval } from "./domain.js";

export interface CreateApprovalInput {
  task_id: string;
  step_id: string;
  summary: string;
  risk_reasons: readonly string[];
  requested_at?: string;
}

export type ApprovalResolution = "approved" | "denied" | "expired";

export interface ApprovalStore {
  create(input: CreateApprovalInput): Approval;
  resolve(
    id: string,
    status: ApprovalResolution,
    resolvedAt?: string,
  ): Approval | null;
  get(id: string): Approval | null;
  findPendingByStep(taskId: string, stepId: string): Approval | null;
  listByTask(taskId: string): readonly Approval[];
  list(): readonly Approval[];
  listPending(): readonly Approval[];
  clear(): void;
}

function createApprovalId(): string {
  return `approval_${randomUUID()}`;
}

function cloneApproval(approval: Approval): Approval {
  return {
    ...approval,
    risk_reasons: [...approval.risk_reasons],
  };
}

export class InMemoryApprovalStore implements ApprovalStore {
  private readonly approvals = new Map<string, Approval>();

  create(input: CreateApprovalInput): Approval {
    const approval: Approval = {
      id: createApprovalId(),
      task_id: input.task_id,
      step_id: input.step_id,
      status: "requested",
      summary: input.summary,
      risk_reasons: [...input.risk_reasons],
      requested_at: input.requested_at ?? new Date().toISOString(),
      resolved_at: null,
    };

    this.approvals.set(approval.id, approval);
    return cloneApproval(approval);
  }

  resolve(
    id: string,
    status: ApprovalResolution,
    resolvedAt = new Date().toISOString(),
  ): Approval | null {
    const approval = this.approvals.get(id);
    if (!approval || approval.status !== "requested") {
      return null;
    }

    const resolved: Approval = {
      ...approval,
      status,
      resolved_at: resolvedAt,
      risk_reasons: [...approval.risk_reasons],
    };

    this.approvals.set(id, resolved);
    return cloneApproval(resolved);
  }

  get(id: string): Approval | null {
    const approval = this.approvals.get(id);
    return approval ? cloneApproval(approval) : null;
  }

  findPendingByStep(taskId: string, stepId: string): Approval | null {
    for (const approval of this.approvals.values()) {
      if (
        approval.task_id === taskId &&
        approval.step_id === stepId &&
        approval.status === "requested"
      ) {
        return cloneApproval(approval);
      }
    }

    return null;
  }

  listByTask(taskId: string): readonly Approval[] {
    return Array.from(this.approvals.values())
      .filter((approval) => approval.task_id === taskId)
      .map(cloneApproval);
  }

  list(): readonly Approval[] {
    return Array.from(this.approvals.values(), cloneApproval);
  }

  listPending(): readonly Approval[] {
    return Array.from(this.approvals.values())
      .filter((approval) => approval.status === "requested")
      .map(cloneApproval);
  }

  clear(): void {
    this.approvals.clear();
  }
}
