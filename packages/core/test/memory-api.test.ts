import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryAuditLog,
  InMemoryEventBus,
  InMemoryMemoryApi,
  InMemoryMemoryStore,
} from "../src/index.js";

test("memory write stores project memory and emits memory.written", () => {
  const store = new InMemoryMemoryStore();
  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();
  const api = new InMemoryMemoryApi({ store, eventBus, auditLog });

  const result = api.write({
    task_id: "task_01",
    content: "Project rule: keep workspace tools read-only by default.",
    source: "planner-summary",
    purpose: "project recall",
    retention: "project",
  });

  assert.equal(result.decision, "stored");
  assert.ok(result.entry);
  assert.equal(result.entry?.scope, "project");
  assert.equal(store.list().length, 1);
  assert.ok(eventBus.getEvents().some((event) => event.event_type === "memory.written"));
  assert.ok(auditLog.getRecords().some((record) => record.event_type === "memory.written"));
});

test("memory write blocks sensitive content by default and audits blocked write", () => {
  const store = new InMemoryMemoryStore();
  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();
  const api = new InMemoryMemoryApi({ store, eventBus, auditLog });

  const result = api.write({
    task_id: "task_02",
    content: "api_key is secret-123 and should be remembered forever",
    source: "chat",
    purpose: "long-term memory",
    retention: "permanent",
  });

  assert.equal(result.decision, "blocked");
  assert.equal(result.reason, "sensitive_data_detected");
  assert.equal(store.list().length, 0);

  const writeEvents = eventBus.getEvents().filter((event) => event.event_type === "memory.written");
  assert.equal(writeEvents.length, 1);
  assert.equal(writeEvents[0]?.payload.decision, "blocked");
});

test("memory write requires explicit approval for personal preference memory", () => {
  const api = new InMemoryMemoryApi({
    store: new InMemoryMemoryStore(),
    eventBus: new InMemoryEventBus(),
    auditLog: new InMemoryAuditLog(),
  });

  const blocked = api.write({
    task_id: "task_03",
    content: "User preference: prefer terse bullet summaries.",
    source: "chat",
    purpose: "preference memory",
    retention: "30d",
  });
  assert.equal(blocked.decision, "blocked");
  assert.equal(blocked.reason, "personal_identifier_without_consent");

  const stored = api.write({
    task_id: "task_03",
    content: "User preference: prefer terse bullet summaries.",
    source: "chat",
    purpose: "preference memory",
    retention: "30d",
    user_approved: true,
  });
  assert.equal(stored.decision, "stored");
  assert.equal(stored.entry?.scope, "personal");
});

test("memory search requires purpose and task context driven filtering via allowed scopes", () => {
  const store = new InMemoryMemoryStore();
  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();
  const api = new InMemoryMemoryApi({ store, eventBus, auditLog });

  api.write({
    task_id: "task_project",
    content: "Project workspace uses task and plan stores.",
    source: "workspace-overview",
    purpose: "project recall",
    retention: "project",
  });
  api.write({
    task_id: "task_personal",
    content: "User preference: prefer concise status updates.",
    source: "chat",
    purpose: "preference memory",
    retention: "30d",
    user_approved: true,
  });

  const projectResults = api.search({
    query: "workspace",
    purpose: "project recall",
    task_context: "workspace-overview",
  });
  assert.equal(projectResults.entries.length, 1);
  assert.equal(projectResults.entries[0]?.scope, "project");

  const preferenceResults = api.search({
    query: "preference",
    purpose: "user preference recall",
    task_context: "chat",
  });
  assert.equal(preferenceResults.entries.length, 1);
  assert.equal(preferenceResults.entries[0]?.scope, "personal");
  assert.ok(eventBus.getEvents().some((event) => event.event_type === "memory.read"));
});

test("memory delete marks entry deleted and emits memory.deleted", () => {
  const store = new InMemoryMemoryStore();
  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();
  const api = new InMemoryMemoryApi({ store, eventBus, auditLog });

  const result = api.write({
    task_id: "task_delete",
    content: "Project rule: delete stale ephemeral notes.",
    source: "planner",
    purpose: "project recall",
    retention: "project",
  });
  assert.ok(result.entry);

  const deleted = api.delete({
    id: result.entry!.id,
    reason: "user requested deletion",
  });

  assert.ok(deleted);
  assert.equal(deleted?.status, "deleted");
  assert.equal(api.get(result.entry!.id)?.status, "deleted");
  assert.ok(eventBus.getEvents().some((event) => event.event_type === "memory.deleted"));
  assert.ok(auditLog.getRecords().some((record) => record.event_type === "memory.deleted"));
});
