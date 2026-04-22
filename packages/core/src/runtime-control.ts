import { randomUUID } from "node:crypto";

import type { AuditLog } from "./audit-log.js";
import { InMemoryAuditLog } from "./audit-log.js";
import type { Event } from "./events.js";
import type { EventBus } from "./event-bus.js";
import { InMemoryEventBus } from "./event-bus.js";
import type { Capability } from "./policy.js";

export interface RuntimeControlState {
  lockdown_active: boolean;
  revoked_capabilities: readonly Capability[];
}

export interface RuntimeControlDependencies {
  eventBus?: EventBus;
  auditLog?: AuditLog;
}

export interface RuntimeControl {
  getState(): RuntimeControlState;
  isLockdownActive(): boolean;
  getRevokedCapabilities(): readonly Capability[];
  enableLockdown(reason: string): void;
  disableLockdown(reason: string): void;
  revokeCapability(capability: Capability, reason: string): void;
  restoreCapability(capability: Capability, reason: string): void;
}

function createEventBus(eventBus?: EventBus): EventBus {
  return eventBus ?? new InMemoryEventBus();
}

function createAuditLog(auditLog?: AuditLog): AuditLog {
  return auditLog ?? new InMemoryAuditLog();
}

function summarizeEvent(event: Event): string {
  switch (event.event_type) {
    case "safety.lockdown_enabled":
      return `lockdown enabled: ${event.payload.reason}`;
    case "safety.lockdown_disabled":
      return `lockdown disabled: ${event.payload.reason}`;
    case "capability.revoked":
      return `capability revoked: ${event.payload.capability}`;
    case "capability.restored":
      return `capability restored: ${event.payload.capability}`;
    default:
      return event.event_type;
  }
}

function createBaseEvent<T extends Event["event_type"]>(
  eventType: T,
  payload: Extract<Event, { event_type: T }>["payload"],
): Extract<Event, { event_type: T }> {
  return {
    event_id: `evt_${randomUUID()}`,
    event_type: eventType,
    timestamp: new Date().toISOString(),
    actor: "system",
    task_id: null,
    trace_id: `trace_${randomUUID()}`,
    correlation_id: null,
    payload,
  } as Extract<Event, { event_type: T }>;
}

export class InMemoryRuntimeControl implements RuntimeControl {
  private lockdownActive = false;
  private readonly revokedCapabilities = new Set<Capability>();
  private readonly eventBus: EventBus;
  private readonly auditLog: AuditLog;

  constructor(dependencies: RuntimeControlDependencies = {}) {
    this.eventBus = createEventBus(dependencies.eventBus);
    this.auditLog = createAuditLog(dependencies.auditLog);
  }

  getState(): RuntimeControlState {
    return {
      lockdown_active: this.lockdownActive,
      revoked_capabilities: Array.from(this.revokedCapabilities.values()),
    };
  }

  isLockdownActive(): boolean {
    return this.lockdownActive;
  }

  getRevokedCapabilities(): readonly Capability[] {
    return Array.from(this.revokedCapabilities.values());
  }

  enableLockdown(reason: string): void {
    if (this.lockdownActive) {
      return;
    }

    this.lockdownActive = true;
    this.publishAndAudit(createBaseEvent("safety.lockdown_enabled", {
      reason,
      active: true,
    }));
  }

  disableLockdown(reason: string): void {
    if (!this.lockdownActive) {
      return;
    }

    this.lockdownActive = false;
    this.publishAndAudit(createBaseEvent("safety.lockdown_disabled", {
      reason,
      active: false,
    }));
  }

  revokeCapability(capability: Capability, reason: string): void {
    if (this.revokedCapabilities.has(capability)) {
      return;
    }

    this.revokedCapabilities.add(capability);
    this.publishAndAudit(createBaseEvent("capability.revoked", {
      capability,
      reason,
      active: true,
    }));
  }

  restoreCapability(capability: Capability, reason: string): void {
    if (!this.revokedCapabilities.has(capability)) {
      return;
    }

    this.revokedCapabilities.delete(capability);
    this.publishAndAudit(createBaseEvent("capability.restored", {
      capability,
      reason,
      active: false,
    }));
  }

  private publishAndAudit(event: Event): void {
    this.eventBus.publish(event);
    this.auditLog.recordEvent(event, summarizeEvent(event), "runtime-control");
  }
}
