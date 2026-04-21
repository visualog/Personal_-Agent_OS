import type { AuditRecord } from "./domain.js";
import type { Event } from "./events.js";
import { randomUUID } from "node:crypto";

export interface AuditLog {
  append(record: AuditRecord): void;
  recordEvent(event: Event, summary: string, target?: string): AuditRecord;
  getRecords(): readonly AuditRecord[];
  getRecordsByTraceId(traceId: string): readonly AuditRecord[];
  getRecordsByTaskId(taskId: string): readonly AuditRecord[];
  clear(): void;
}

const REDACTED_KEYS = new Set([
  "token",
  "password",
  "secret",
  "api_key",
  "authorization",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[-\s]/g, "_").toLowerCase();
  return (
    REDACTED_KEYS.has(normalized) ||
    [...REDACTED_KEYS].some((sensitiveKey) =>
      normalized.split("_").includes(sensitiveKey),
    )
  );
}

export function redactPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map((item) => redactPayload(item));
  }

  if (!isObject(payload)) {
    return payload;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    redacted[key] = isSensitiveKey(key) ? "[REDACTED]" : redactPayload(value);
  }
  return redacted;
}

function createRecordId(): string {
  return randomUUID();
}

export class InMemoryAuditLog implements AuditLog {
  private readonly records: AuditRecord[] = [];

  append(record: AuditRecord): void {
    this.records.push(record);
  }

  recordEvent(event: Event, summary: string, target = ""): AuditRecord {
    const record: AuditRecord = {
      id: createRecordId(),
      trace_id: event.trace_id,
      task_id: event.task_id ?? "",
      event_type: event.event_type,
      actor: event.actor,
      target,
      summary,
      payload_redacted: redactPayload(event.payload),
      created_at: event.timestamp,
    };

    this.append(record);
    return record;
  }

  getRecords(): readonly AuditRecord[] {
    return [...this.records];
  }

  getRecordsByTraceId(traceId: string): readonly AuditRecord[] {
    return this.records.filter((record) => record.trace_id === traceId);
  }

  getRecordsByTaskId(taskId: string): readonly AuditRecord[] {
    return this.records.filter((record) => record.task_id === taskId);
  }

  clear(): void {
    this.records.length = 0;
  }
}
