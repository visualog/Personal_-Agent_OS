import type { Actor, EventType } from "./events.js";
import type { Capability, PolicyDecisionValue, RiskLevel } from "./policy.js";

export type Timestamp = string;
export type Identifier = string;

export type TaskPriority = "low" | "normal" | "high";
export type Sensitivity = "public" | "internal" | "personal" | "sensitive";

export type TaskStatus =
  | "created"
  | "planning"
  | "waiting_approval"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export type PlanStatus =
  | "drafted"
  | "approved"
  | "partially_approved"
  | "running"
  | "completed"
  | "failed"
  | "canceled";

export type StepStatus =
  | "ready"
  | "waiting_approval"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "blocked";

export type ToolRegistrationStatus = "enabled" | "disabled" | "deprecated";

export type ApprovalStatus = "requested" | "approved" | "denied" | "expired";

export type MemoryEntryStatus =
  | "proposed"
  | "stored"
  | "blocked"
  | "expired"
  | "deleted";

export type MemoryEntryScope =
  | "ephemeral"
  | "project"
  | "personal"
  | "sensitive"
  | "blocked";

export interface Task {
  readonly id: Identifier;
  readonly title: string;
  readonly raw_request: string;
  readonly status: TaskStatus;
  readonly priority: TaskPriority;
  readonly sensitivity: Sensitivity;
  readonly created_by: string;
  readonly created_at: Timestamp;
  readonly updated_at: Timestamp;
}

export interface Plan {
  readonly id: Identifier;
  readonly task_id: Identifier;
  readonly summary: string;
  readonly steps: readonly Step[];
  readonly status: PlanStatus;
  readonly created_at: Timestamp;
  readonly updated_at: Timestamp;
}

export interface Step {
  readonly id: Identifier;
  readonly plan_id: Identifier;
  readonly title: string;
  readonly status: StepStatus;
  readonly tool_name: string;
  readonly required_capabilities: readonly Capability[];
  readonly risk_level: RiskLevel;
  readonly approval_id: Identifier | null;
  readonly depends_on: readonly Identifier[];
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly input_schema: unknown;
  readonly output_schema: unknown;
  readonly capabilities: readonly Capability[];
  readonly default_risk: RiskLevel;
  readonly requires_approval: boolean;
  readonly sandbox: string;
  readonly status?: ToolRegistrationStatus;
}

export interface PolicyDecision {
  readonly id: Identifier;
  readonly action_id: Identifier;
  readonly decision: PolicyDecisionValue;
  readonly risk_level: RiskLevel;
  readonly reasons: readonly string[];
  readonly evaluated_rules: readonly string[];
  readonly created_at: Timestamp;
}

export interface Approval {
  readonly id: Identifier;
  readonly task_id: Identifier;
  readonly step_id: Identifier;
  readonly status: ApprovalStatus;
  readonly summary: string;
  readonly risk_reasons: readonly string[];
  readonly requested_at: Timestamp;
  readonly resolved_at?: Timestamp | null;
}

export interface MemoryEntry {
  readonly id: Identifier;
  readonly task_id: Identifier;
  readonly scope: MemoryEntryScope;
  readonly status: MemoryEntryStatus;
  readonly content: string;
  readonly source: string;
  readonly retention_policy: string;
  readonly created_at: Timestamp;
  readonly updated_at: Timestamp;
}

export interface AuditRecord {
  readonly id: Identifier;
  readonly trace_id: Identifier;
  readonly task_id: Identifier;
  readonly event_type: EventType;
  readonly actor: Actor;
  readonly target: string;
  readonly summary: string;
  readonly payload_redacted: unknown;
  readonly created_at: Timestamp;
}
