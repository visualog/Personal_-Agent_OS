import type {
  Capability,
  DenyReason,
  PolicyDecisionValue,
  RiskLevel,
} from "./policy.js";

export interface PolicyAction {
  id: string;
  step_id: string;
  tool_name: string;
  requested_capabilities: readonly Capability[];
  granted_capabilities: readonly Capability[];
  risk_level: RiskLevel;
  scope_allowed: boolean;
  approval_granted?: boolean;
  audit_available?: boolean;
  tool_registered?: boolean;
  sandbox_matched?: boolean;
  system_lockdown?: boolean;
  revoked_capabilities?: readonly Capability[];
}

export interface PolicyEvaluationResult {
  decision: PolicyDecisionValue;
  risk_level: RiskLevel;
  reasons: readonly string[];
  deny_reasons: readonly DenyReason[];
  required_capabilities: readonly Capability[];
}

const MEDIUM_APPROVAL_CAPABILITIES: ReadonlySet<Capability> = new Set([
  "workspace.write",
  "filesystem.write",
  "memory.write",
  "external.network.write",
  "external.send",
  "identity.write",
  "settings.write",
  "deployment.write",
  "payments.write",
  "browser.automation",
  "admin.override",
]);

function hasAnyApprovalSensitiveCapability(
  capabilities: readonly Capability[],
): boolean {
  return capabilities.some((capability) => MEDIUM_APPROVAL_CAPABILITIES.has(capability));
}

function uniqueCapabilities(capabilities: readonly Capability[]): Capability[] {
  return Array.from(new Set(capabilities));
}

export function evaluatePolicy(action: PolicyAction): PolicyEvaluationResult {
  const reasons: string[] = [];
  const deny_reasons: DenyReason[] = [];
  const required_capabilities = uniqueCapabilities(action.requested_capabilities);
  const revokedCapabilities = uniqueCapabilities(action.revoked_capabilities ?? []);

  if (action.system_lockdown === true) {
    reasons.push("system lockdown active");
    deny_reasons.push("system_lockdown");
  }

  const missingCapabilities = required_capabilities.filter(
    (capability) => !action.granted_capabilities.includes(capability),
  );
  if (missingCapabilities.length > 0) {
    reasons.push(
      `missing capability: ${missingCapabilities.join(", ")}`,
    );
    deny_reasons.push("missing_capability");
  }

  const revokedRequestedCapabilities = required_capabilities.filter(
    (capability) => revokedCapabilities.includes(capability),
  );
  if (revokedRequestedCapabilities.length > 0) {
    reasons.push(
      `permission revoked: ${revokedRequestedCapabilities.join(", ")}`,
    );
    deny_reasons.push("permission_revoked");
  }

  if (action.tool_registered === false) {
    reasons.push(`tool not registered: ${action.tool_name}`);
    deny_reasons.push("tool_not_registered");
  }

  if (action.sandbox_matched === false) {
    reasons.push(`sandbox mismatch for tool: ${action.tool_name}`);
    deny_reasons.push("sandbox_mismatch");
  }

  if (action.audit_available === false) {
    reasons.push(`audit unavailable for action: ${action.id}`);
    deny_reasons.push("audit_unavailable");
  }

  if (action.scope_allowed === false) {
    reasons.push(`scope outside request for step: ${action.step_id}`);
    deny_reasons.push("scope_outside_request");
  }

  if (action.risk_level === "critical") {
    reasons.push("critical action disabled by policy");
    deny_reasons.push("critical_action_disabled");
  }

  if (deny_reasons.length > 0) {
    return {
      decision: "deny",
      risk_level: action.risk_level,
      reasons,
      deny_reasons: Array.from(new Set(deny_reasons)),
      required_capabilities,
    };
  }

  if (action.risk_level === "high") {
    if (action.approval_granted === true) {
      reasons.push("high risk action approved");
      return {
        decision: "allow",
        risk_level: action.risk_level,
        reasons,
        deny_reasons: [],
        required_capabilities,
      };
    }

    reasons.push("high risk action requires approval");
    return {
      decision: "require_approval",
      risk_level: action.risk_level,
      reasons,
      deny_reasons: [],
      required_capabilities,
    };
  }

  if (
    action.risk_level === "medium" &&
    hasAnyApprovalSensitiveCapability(required_capabilities)
  ) {
    if (action.approval_granted === true) {
      reasons.push("medium risk capability approved");
      return {
        decision: "allow",
        risk_level: action.risk_level,
        reasons,
        deny_reasons: [],
        required_capabilities,
      };
    }

    reasons.push("medium risk capability requires approval");
    return {
      decision: "require_approval",
      risk_level: action.risk_level,
      reasons,
      deny_reasons: [],
      required_capabilities,
    };
  }

  reasons.push("policy allow");
  return {
    decision: "allow",
    risk_level: action.risk_level,
    reasons,
    deny_reasons: [],
    required_capabilities,
  };
}
