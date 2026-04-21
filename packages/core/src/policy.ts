export type RiskLevel = "low" | "medium" | "high" | "critical";

export const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;

export type Capability =
  | "workspace.read"
  | "workspace.write"
  | "filesystem.read"
  | "filesystem.write"
  | "memory.read"
  | "memory.write"
  | "approval.request"
  | "audit.read"
  | "audit.write"
  | "external.network.read"
  | "external.network.write"
  | "external.send"
  | "identity.read"
  | "identity.write"
  | "settings.write"
  | "deployment.write"
  | "payments.write"
  | "browser.automation"
  | "admin.override";

export const CAPABILITIES = [
  "workspace.read",
  "workspace.write",
  "filesystem.read",
  "filesystem.write",
  "memory.read",
  "memory.write",
  "approval.request",
  "audit.read",
  "audit.write",
  "external.network.read",
  "external.network.write",
  "external.send",
  "identity.read",
  "identity.write",
  "settings.write",
  "deployment.write",
  "payments.write",
  "browser.automation",
  "admin.override",
] as const;

export type PolicyDecisionValue = "allow" | "require_approval" | "deny";

export const POLICY_DECISION_VALUES = [
  "allow",
  "require_approval",
  "deny",
] as const;

export type DenyReason =
  | "missing_capability"
  | "scope_outside_request"
  | "risk_exceeds_policy"
  | "critical_action_disabled"
  | "approval_required_not_granted"
  | "approval_expired"
  | "sandbox_mismatch"
  | "tool_not_registered"
  | "input_schema_invalid"
  | "output_schema_unusable"
  | "policy_conflict"
  | "audit_unavailable"
  | "permission_revoked"
  | "system_lockdown";

export const DENY_REASONS = [
  "missing_capability",
  "scope_outside_request",
  "risk_exceeds_policy",
  "critical_action_disabled",
  "approval_required_not_granted",
  "approval_expired",
  "sandbox_mismatch",
  "tool_not_registered",
  "input_schema_invalid",
  "output_schema_unusable",
  "policy_conflict",
  "audit_unavailable",
  "permission_revoked",
  "system_lockdown",
] as const;
