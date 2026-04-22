import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePolicy, type PolicyAction } from "../src/index.js";

function createAction(overrides: Partial<PolicyAction> = {}): PolicyAction {
  return {
    id: "action_01",
    step_id: "step_01",
    tool_name: "workspace.read_file",
    requested_capabilities: ["workspace.read"],
    granted_capabilities: ["workspace.read"],
    risk_level: "low",
    scope_allowed: true,
    approval_granted: false,
    audit_available: true,
    tool_registered: true,
    sandbox_matched: true,
    ...overrides,
  };
}

test("low workspace.read is allowed when scope, capability, tool, sandbox, and audit are all OK", () => {
  const result = evaluatePolicy(createAction());

  assert.equal(result.decision, "allow");
  assert.equal(result.risk_level, "low");
  assert.deepEqual(result.deny_reasons, []);
  assert.deepEqual(result.required_capabilities, ["workspace.read"]);
  assert.ok(result.reasons.includes("policy allow"));
});

test("missing capability denies with missing_capability", () => {
  const result = evaluatePolicy(
    createAction({
      granted_capabilities: [],
    }),
  );

  assert.equal(result.decision, "deny");
  assert.deepEqual(result.deny_reasons, ["missing_capability"]);
  assert.ok(result.reasons.some((reason) => reason.startsWith("missing capability:")));
});

test("scope false denies scope_outside_request", () => {
  const result = evaluatePolicy(
    createAction({
      scope_allowed: false,
    }),
  );

  assert.equal(result.decision, "deny");
  assert.deepEqual(result.deny_reasons, ["scope_outside_request"]);
  assert.ok(result.reasons.includes("scope outside request for step: step_01"));
});

test("critical denies critical_action_disabled", () => {
  const result = evaluatePolicy(
    createAction({
      risk_level: "critical",
    }),
  );

  assert.equal(result.decision, "deny");
  assert.deepEqual(result.deny_reasons, ["critical_action_disabled"]);
  assert.ok(result.reasons.includes("critical action disabled by policy"));
});

test("high requires approval and then allows when approval_granted is true", () => {
  const requiresApproval = evaluatePolicy(
    createAction({
      risk_level: "high",
      approval_granted: false,
    }),
  );

  assert.equal(requiresApproval.decision, "require_approval");
  assert.deepEqual(requiresApproval.deny_reasons, []);
  assert.ok(requiresApproval.reasons.includes("high risk action requires approval"));

  const allowedAfterApproval = evaluatePolicy(
    createAction({
      risk_level: "high",
      approval_granted: true,
    }),
  );

  assert.equal(allowedAfterApproval.decision, "allow");
  assert.deepEqual(allowedAfterApproval.deny_reasons, []);
  assert.ok(allowedAfterApproval.reasons.includes("high risk action approved"));
});

test("medium write requires approval", () => {
  const result = evaluatePolicy(
    createAction({
      risk_level: "medium",
      requested_capabilities: ["workspace.write"],
      granted_capabilities: ["workspace.write"],
      approval_granted: false,
    }),
  );

  assert.equal(result.decision, "require_approval");
  assert.deepEqual(result.deny_reasons, []);
  assert.ok(result.reasons.includes("medium risk capability requires approval"));
});

test("tool_registered false denies tool_not_registered", () => {
  const result = evaluatePolicy(
    createAction({
      tool_registered: false,
    }),
  );

  assert.equal(result.decision, "deny");
  assert.deepEqual(result.deny_reasons, ["tool_not_registered"]);
  assert.ok(result.reasons.includes("tool not registered: workspace.read_file"));
});

test("system lockdown denies new tool calls with system_lockdown", () => {
  const result = evaluatePolicy(
    createAction({
      system_lockdown: true,
    }),
  );

  assert.equal(result.decision, "deny");
  assert.deepEqual(result.deny_reasons, ["system_lockdown"]);
  assert.ok(result.reasons.includes("system lockdown active"));
});

test("revoked capability denies with permission_revoked", () => {
  const result = evaluatePolicy(
    createAction({
      requested_capabilities: ["workspace.write"],
      granted_capabilities: ["workspace.write"],
      revoked_capabilities: ["workspace.write"],
      risk_level: "medium",
    }),
  );

  assert.equal(result.decision, "deny");
  assert.deepEqual(result.deny_reasons, ["permission_revoked"]);
  assert.ok(result.reasons.includes("permission revoked: workspace.write"));
});
