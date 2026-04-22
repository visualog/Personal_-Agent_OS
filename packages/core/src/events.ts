import type { PlanStatus, StepStatus, TaskStatus } from "./domain.js";
import type { RiskLevel } from "./policy.js";

export type Actor = "user" | "agent" | "system" | "tool";

export const ACTORS = ["user", "agent", "system", "tool"] as const;

export type EventType =
  | "task.created"
  | "task.updated"
  | "plan.drafted"
  | "plan.updated"
  | "step.ready"
  | "step.approval_requested"
  | "step.approved"
  | "step.denied"
  | "action.started"
  | "action.succeeded"
  | "action.failed"
  | "policy.evaluated"
  | "risk.flagged"
  | "memory.read"
  | "memory.written"
  | "memory.deleted"
  | "audit.recorded";

export const EVENT_TYPES = [
  "task.created",
  "task.updated",
  "plan.drafted",
  "plan.updated",
  "step.ready",
  "step.approval_requested",
  "step.approved",
  "step.denied",
  "action.started",
  "action.succeeded",
  "action.failed",
  "policy.evaluated",
  "risk.flagged",
  "memory.read",
  "memory.written",
  "memory.deleted",
  "audit.recorded",
] as const;

export type EventPayloadMap = {
  "task.created": {
    title: string;
    raw_request_hash: string;
    channel: "web" | "cli" | "telegram" | "slack";
    priority: "low" | "normal" | "high";
    sensitivity: "public" | "internal" | "personal" | "sensitive";
  };
  "task.updated": {
    status: TaskStatus;
    previous_status: TaskStatus;
    summary: string;
  };
  "plan.drafted": {
    plan_id: string;
    step_count: number;
    requires_approval: boolean;
    risk_summary: {
      low: number;
      medium: number;
      high: number;
      critical: number;
    };
  };
  "plan.updated": {
    plan_id: string;
    status: PlanStatus;
    previous_status: PlanStatus;
    summary: string;
  };
  "step.ready": {
    plan_id: string;
    step_id: string;
    tool_name: string;
    status: Extract<StepStatus, "ready">;
    risk_level: RiskLevel;
    depends_on: string[];
  };
  "step.approval_requested": {
    approval_id: string;
    step_id: string;
    summary: string;
    risk_reasons: string[];
    expires_at: string;
  };
  "step.approved": {
    approval_id: string;
    step_id: string;
    resolved_at: string;
    summary: string;
  };
  "step.denied": {
    approval_id: string;
    step_id: string;
    resolved_at: string;
    summary: string;
  };
  "action.started": {
    action_id: string;
    step_id: string;
    tool_name: string;
    idempotency_key: string;
    timeout_ms: number;
  };
  "action.succeeded": {
    action_id: string;
    step_id: string;
    tool_name: string;
    output_ref: string;
    summary: string;
  };
  "action.failed": {
    action_id: string;
    step_id: string;
    tool_name: string;
    error_code: string;
    retryable: boolean;
    summary: string;
  };
  "policy.evaluated": {
    policy_decision_id: string;
    step_id: string;
    tool_name: string;
    decision: "allow" | "require_approval" | "deny";
    risk_level: "low" | "medium" | "high" | "critical";
    required_capabilities: string[];
    reasons: string[];
    deny_reasons: string[];
  };
  "risk.flagged": {
    policy_decision_id: string;
    step_id: string;
    tool_name: string;
    decision: "require_approval" | "deny";
    risk_level: "low" | "medium" | "high" | "critical";
    required_capabilities: string[];
    reasons: string[];
    deny_reasons: string[];
    summary: string;
  };
  "memory.read": {
    query: string;
    purpose: string;
    task_context: string;
    result_count: number;
    allowed_scopes: Array<"ephemeral" | "project" | "personal" | "sensitive" | "blocked">;
  };
  "memory.written": {
    memory_id: string;
    memory_class: "ephemeral" | "project" | "personal" | "sensitive" | "blocked";
    source_task_id: string;
    retention: "session" | "project" | "30d" | "permanent";
    redacted: boolean;
    decision: "stored" | "blocked";
    reason: string;
  };
  "memory.deleted": {
    memory_id: string;
    source_task_id: string;
    reason: string;
    deleted: true;
  };
  "audit.recorded": Record<string, unknown>;
};

export type EventPayload<T extends EventType = EventType> = EventPayloadMap[T];

export type BaseEvent<T extends EventType = EventType, P = EventPayload<T>> = {
  event_id: string;
  event_type: T;
  timestamp: string;
  actor: Actor;
  task_id?: string | null;
  trace_id: string;
  correlation_id?: string | null;
  payload: P;
};

export type Event = {
  [K in EventType]: BaseEvent<K, EventPayloadMap[K]>;
}[EventType];
