import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryAuditLog,
  InMemoryEventBus,
  redactPayload,
  type BaseEvent,
  type Event,
} from "../src/index.js";

type PolicyEvaluatedEvent = BaseEvent<"policy.evaluated">;

function createEvent(overrides: Partial<PolicyEvaluatedEvent> = {}): PolicyEvaluatedEvent {
  return {
    event_id: "evt_01",
    event_type: "policy.evaluated",
    timestamp: "2026-04-22T00:00:00.000Z",
    actor: "system",
    task_id: "task_01",
    trace_id: "trace_01",
    correlation_id: "step_01",
    payload: {
      policy_decision_id: "pd_01",
      step_id: "step_01",
      tool_name: "workspace.read_file",
      decision: "allow",
      risk_level: "low",
      required_capabilities: ["workspace.read"],
      reasons: ["workspace_scope_allowed"],
    },
    ...overrides,
  };
}

test("publish stores events and notifies subscriber", () => {
  const bus = new InMemoryEventBus();
  const received: Event[] = [];
  const unsubscribe = bus.subscribe((event) => {
    received.push(event);
  });
  const event = createEvent();

  bus.publish(event);

  assert.deepEqual(bus.getEvents(), [event]);
  assert.deepEqual(received, [event]);

  unsubscribe();
});

test("unsubscribe stops notifications", () => {
  const bus = new InMemoryEventBus();
  const received: Event[] = [];
  const unsubscribe = bus.subscribe((event) => {
    received.push(event);
  });

  unsubscribe();
  bus.publish(createEvent({ event_id: "evt_02" }));

  assert.deepEqual(received, []);
});

test("getEventsByTraceId filters events", () => {
  const bus = new InMemoryEventBus();
  const first = createEvent({ event_id: "evt_01", trace_id: "trace_a" });
  const second = createEvent({ event_id: "evt_02", trace_id: "trace_b" });
  const third = createEvent({ event_id: "evt_03", trace_id: "trace_a" });

  bus.publish(first);
  bus.publish(second);
  bus.publish(third);

  assert.deepEqual(bus.getEventsByTraceId("trace_a"), [first, third]);
  assert.deepEqual(bus.getEventsByTraceId("trace_b"), [second]);
});

test("recordEvent creates audit record from event", () => {
  const auditLog = new InMemoryAuditLog();
  const event: Event = {
    event_id: "evt_01",
    timestamp: "2026-04-22T00:00:00.000Z",
    correlation_id: "step_01",
    task_id: "task_99",
    trace_id: "trace_99",
    actor: "agent",
    event_type: "action.succeeded",
    payload: {
      action_id: "action_01",
      step_id: "step_01",
      tool_name: "http.fetch",
      output_ref: "output_01",
      summary: "Fetched content",
    },
  };

  const record = auditLog.recordEvent(event, "Action completed", "action_01");

  assert.equal(record.trace_id, event.trace_id);
  assert.equal(record.task_id, event.task_id);
  assert.equal(record.event_type, event.event_type);
  assert.equal(record.actor, event.actor);
  assert.equal(record.target, "action_01");
  assert.equal(record.summary, "Action completed");
  assert.equal(record.created_at, event.timestamp);
  assert.deepEqual(record.payload_redacted, event.payload);
  assert.deepEqual(auditLog.getRecords(), [record]);
});

test("redactPayload masks nested token/password/secret/api_key/authorization keys", () => {
  const payload = {
    access: {
      token: "token-1",
      nested: {
        password: "password-1",
        keep: "visible",
      },
    },
    settings: [
      {
        api_key: "key-1",
        authorization: "Bearer abc",
      },
      {
        secret: "secret-1",
        non_sensitive: true,
      },
    ],
    "auth-authorization": "Bearer xyz",
  };

  assert.deepEqual(redactPayload(payload), {
    access: {
      token: "[REDACTED]",
      nested: {
        password: "[REDACTED]",
        keep: "visible",
      },
    },
    settings: [
      {
        api_key: "[REDACTED]",
        authorization: "[REDACTED]",
      },
      {
        secret: "[REDACTED]",
        non_sensitive: true,
      },
    ],
    "auth-authorization": "[REDACTED]",
  });
});
