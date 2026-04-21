import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITIES,
  EVENT_TYPES,
  RISK_LEVELS,
  type Event,
  type Step,
  type Task,
} from "../src/index.js";

test("core contract constants expose the MVP policy surface", () => {
  assert.ok(RISK_LEVELS.includes("critical"));
  assert.ok(CAPABILITIES.includes("workspace.read"));
  assert.ok(CAPABILITIES.includes("external.send"));
  assert.ok(EVENT_TYPES.includes("policy.evaluated"));
});

test("domain and event contracts compose for a read-only step", () => {
  const task: Task = {
    id: "task_01",
    title: "프로젝트 상태 정리",
    raw_request: "이 프로젝트 현재 상태를 정리해줘",
    status: "planning",
    priority: "normal",
    sensitivity: "internal",
    created_by: "user",
    created_at: "2026-04-22T00:00:00.000Z",
    updated_at: "2026-04-22T00:00:00.000Z",
  };

  const step: Step = {
    id: "step_01",
    plan_id: "plan_01",
    title: "허용된 workspace 파일 읽기",
    status: "ready",
    tool_name: "workspace.read_file",
    required_capabilities: ["workspace.read"],
    risk_level: "low",
    approval_id: null,
    depends_on: [],
  };

  const event: Event = {
    event_id: "evt_01",
    event_type: "policy.evaluated",
    timestamp: "2026-04-22T00:00:00.000Z",
    actor: "system",
    task_id: task.id,
    trace_id: "trace_01",
    correlation_id: step.id,
    payload: {
      policy_decision_id: "pd_01",
      step_id: step.id,
      tool_name: step.tool_name,
      decision: "allow",
      risk_level: step.risk_level,
      required_capabilities: [...step.required_capabilities],
      reasons: ["workspace_scope_allowed"],
    },
  };

  assert.equal(event.payload.decision, "allow");
});

