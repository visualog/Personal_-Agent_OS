import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryAuditLog,
  InMemoryEventBus,
  InMemoryRuntimeControl,
} from "../src/index.js";

test("runtime control enables and disables lockdown with events and audit records", () => {
  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();
  const control = new InMemoryRuntimeControl({ eventBus, auditLog });

  control.enableLockdown("incident response");
  assert.equal(control.isLockdownActive(), true);

  control.disableLockdown("incident resolved");
  assert.equal(control.isLockdownActive(), false);

  const eventTypes = eventBus.getEvents().map((event) => event.event_type);
  assert.deepEqual(eventTypes, ["safety.lockdown_enabled", "safety.lockdown_disabled"]);
  assert.deepEqual(
    auditLog.getRecords().map((record) => record.event_type),
    ["safety.lockdown_enabled", "safety.lockdown_disabled"],
  );
});

test("runtime control revokes and restores capability with state, events, and audit", () => {
  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();
  const control = new InMemoryRuntimeControl({ eventBus, auditLog });

  control.revokeCapability("workspace.write", "operator revoked write access");
  assert.deepEqual(control.getRevokedCapabilities(), ["workspace.write"]);

  control.restoreCapability("workspace.write", "write access restored");
  assert.deepEqual(control.getRevokedCapabilities(), []);

  const eventTypes = eventBus.getEvents().map((event) => event.event_type);
  assert.deepEqual(eventTypes, ["capability.revoked", "capability.restored"]);
  assert.deepEqual(
    auditLog.getRecords().map((record) => record.event_type),
    ["capability.revoked", "capability.restored"],
  );
});

test("runtime control ignores duplicate lockdown and duplicate revoke transitions", () => {
  const eventBus = new InMemoryEventBus();
  const auditLog = new InMemoryAuditLog();
  const control = new InMemoryRuntimeControl({ eventBus, auditLog });

  control.enableLockdown("incident response");
  control.enableLockdown("incident response");
  control.revokeCapability("workspace.write", "operator revoked write access");
  control.revokeCapability("workspace.write", "operator revoked write access");

  assert.equal(eventBus.getEvents().length, 2);
  assert.equal(auditLog.getRecords().length, 2);
});
