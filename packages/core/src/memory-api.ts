import { randomUUID } from "node:crypto";

import type { AuditLog } from "./audit-log.js";
import { InMemoryAuditLog } from "./audit-log.js";
import type { MemoryEntry } from "./domain.js";
import type { Event, EventPayloadMap } from "./events.js";
import type { EventBus } from "./event-bus.js";
import { InMemoryEventBus } from "./event-bus.js";

export type MemoryRetention = "session" | "project" | "30d" | "permanent";
export type MemoryClass = MemoryEntry["scope"];
export type MemoryDecision = "stored" | "blocked";

export interface MemoryWriteInput {
  task_id: string;
  content: string;
  source: string;
  purpose: string;
  retention: MemoryRetention;
  user_approved?: boolean;
}

export interface MemorySearchInput {
  query: string;
  purpose: string;
  task_context: string;
}

export interface MemoryDeleteInput {
  id: string;
  reason: string;
}

export interface MemoryWriteResult {
  decision: MemoryDecision;
  entry: MemoryEntry | null;
  reason: string;
}

export interface MemorySearchResult {
  entries: readonly MemoryEntry[];
  allowed_scopes: readonly MemoryClass[];
}

export interface MemoryStore {
  save(entry: MemoryEntry): void;
  get(id: string): MemoryEntry | null;
  list(): readonly MemoryEntry[];
  delete(id: string): MemoryEntry | null;
  clear(): void;
}

export interface MemoryApiDependencies {
  store?: MemoryStore;
  eventBus?: EventBus;
  auditLog?: AuditLog;
}

const PERSONAL_KEYWORDS = ["prefer", "preference", "style", "tone", "선호", "문체"];
const PROJECT_KEYWORDS = ["repo", "project", "workspace", "규칙", "rule", "codebase"];
const BLOCKED_KEYWORDS = ["do not store", "don't store", "저장하지 마", "저장 금지"];
const SENSITIVE_PATTERNS = [
  /\b\d{2,4}-\d{3,4}-\d{4}\b/u,
  /\b\d{12,16}\b/u,
  /\b(password|token|secret|api[_-]?key|authorization)\b/iu,
];

function cloneMemoryEntry(entry: MemoryEntry): MemoryEntry {
  return { ...entry };
}

function createStore(store?: MemoryStore): MemoryStore {
  return store ?? new InMemoryMemoryStore();
}

function createEventBus(eventBus?: EventBus): EventBus {
  return eventBus ?? new InMemoryEventBus();
}

function createAuditLog(auditLog?: AuditLog): AuditLog {
  return auditLog ?? new InMemoryAuditLog();
}

function containsSensitiveContent(content: string): boolean {
  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(content));
}

function containsBlockedInstruction(content: string): boolean {
  const normalized = content.toLowerCase();
  return BLOCKED_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function classifyMemory(content: string): MemoryClass {
  const normalized = content.toLowerCase();

  if (containsBlockedInstruction(content)) {
    return "blocked";
  }

  if (containsSensitiveContent(content)) {
    return "sensitive";
  }

  if (PERSONAL_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "personal";
  }

  if (PROJECT_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "project";
  }

  return "ephemeral";
}

function createMemoryId(): string {
  return `memory_${randomUUID()}`;
}

function createTimestamp(): string {
  return new Date().toISOString();
}

function summarizeEvent(event: Event): string {
  switch (event.event_type) {
    case "memory.written":
      return `memory ${event.payload.decision}: ${event.payload.memory_class}`;
    case "memory.read":
      return `memory read: ${event.payload.result_count} results`;
    case "memory.deleted":
      return `memory deleted: ${event.payload.memory_id}`;
    default:
      return event.event_type;
  }
}

function createBaseEvent<T extends keyof EventPayloadMap>(
  eventType: T,
  taskId: string,
  actor: Event["actor"],
  payload: EventPayloadMap[T],
): Extract<Event, { event_type: T }> {
  return {
    event_id: `evt_${randomUUID()}`,
    event_type: eventType,
    timestamp: createTimestamp(),
    actor,
    task_id: taskId,
    trace_id: `trace_${randomUUID()}`,
    correlation_id: null,
    payload,
  } as Extract<Event, { event_type: T }>;
}

function allowedScopesForSearch(purpose: string): MemoryClass[] {
  const normalized = purpose.toLowerCase();

  if (normalized.includes("preference") || normalized.includes("선호")) {
    return ["personal", "project", "ephemeral"];
  }

  if (normalized.includes("project") || normalized.includes("workspace") || normalized.includes("코드")) {
    return ["project", "ephemeral"];
  }

  return ["ephemeral", "project"];
}

export class InMemoryMemoryStore implements MemoryStore {
  private readonly entries = new Map<string, MemoryEntry>();

  save(entry: MemoryEntry): void {
    this.entries.set(entry.id, cloneMemoryEntry(entry));
  }

  get(id: string): MemoryEntry | null {
    const entry = this.entries.get(id);
    return entry ? cloneMemoryEntry(entry) : null;
  }

  list(): readonly MemoryEntry[] {
    return Array.from(this.entries.values(), cloneMemoryEntry);
  }

  delete(id: string): MemoryEntry | null {
    const entry = this.entries.get(id);
    if (!entry) {
      return null;
    }

    const deleted: MemoryEntry = {
      ...entry,
      status: "deleted",
      updated_at: createTimestamp(),
    };
    this.entries.set(id, deleted);
    return cloneMemoryEntry(deleted);
  }

  clear(): void {
    this.entries.clear();
  }
}

export class InMemoryMemoryApi {
  private readonly store: MemoryStore;
  private readonly eventBus: EventBus;
  private readonly auditLog: AuditLog;

  constructor(dependencies: MemoryApiDependencies = {}) {
    this.store = createStore(dependencies.store);
    this.eventBus = createEventBus(dependencies.eventBus);
    this.auditLog = createAuditLog(dependencies.auditLog);
  }

  write(input: MemoryWriteInput): MemoryWriteResult {
    const classification = classifyMemory(input.content);

    if (input.purpose.trim().length === 0) {
      return this.blockWrite(input, classification, "purpose_missing");
    }

    if (classification === "blocked") {
      return this.blockWrite(input, classification, "blocked_content");
    }

    if (classification === "sensitive") {
      return this.blockWrite(input, classification, "sensitive_data_detected");
    }

    if (classification === "personal" && input.user_approved !== true) {
      return this.blockWrite(input, classification, "personal_identifier_without_consent");
    }

    const now = createTimestamp();
    const entry: MemoryEntry = {
      id: createMemoryId(),
      task_id: input.task_id,
      scope: classification,
      status: "stored",
      content: input.content,
      source: input.source,
      retention_policy: input.retention,
      created_at: now,
      updated_at: now,
    };

    this.store.save(entry);

    const event = createBaseEvent("memory.written", input.task_id, "agent", {
      memory_id: entry.id,
      memory_class: classification,
      source_task_id: input.task_id,
      retention: input.retention,
      redacted: false,
      decision: "stored",
      reason: "stored",
    });
    this.publishAndAudit(event);

    return {
      decision: "stored",
      entry,
      reason: "stored",
    };
  }

  search(input: MemorySearchInput): MemorySearchResult {
    const allowedScopes = allowedScopesForSearch(input.purpose);
    const query = input.query.toLowerCase();
    const taskContext = input.task_context.toLowerCase();

    const entries = this.store.list()
      .filter((entry) => entry.status === "stored")
      .filter((entry) => allowedScopes.includes(entry.scope))
      .filter((entry) => entry.content.toLowerCase().includes(query) || entry.source.toLowerCase().includes(taskContext));

    const taskId = entries[0]?.task_id ?? "";
    const event = createBaseEvent("memory.read", taskId, "agent", {
      query: input.query,
      purpose: input.purpose,
      task_context: input.task_context,
      result_count: entries.length,
      allowed_scopes: allowedScopes,
    });
    this.publishAndAudit(event);

    return {
      entries,
      allowed_scopes: allowedScopes,
    };
  }

  delete(input: MemoryDeleteInput): MemoryEntry | null {
    const deleted = this.store.delete(input.id);
    if (!deleted) {
      return null;
    }

    const event = createBaseEvent("memory.deleted", deleted.task_id, "user", {
      memory_id: deleted.id,
      source_task_id: deleted.task_id,
      reason: input.reason,
      deleted: true,
    });
    this.publishAndAudit(event);
    return deleted;
  }

  list(): readonly MemoryEntry[] {
    return this.store.list();
  }

  get(id: string): MemoryEntry | null {
    return this.store.get(id);
  }

  private blockWrite(
    input: MemoryWriteInput,
    classification: MemoryClass,
    reason: string,
  ): MemoryWriteResult {
    const event = createBaseEvent("memory.written", input.task_id, "system", {
      memory_id: "",
      memory_class: classification,
      source_task_id: input.task_id,
      retention: input.retention,
      redacted: classification === "sensitive" || classification === "blocked",
      decision: "blocked",
      reason,
    });
    this.publishAndAudit(event);

    return {
      decision: "blocked",
      entry: null,
      reason,
    };
  }

  private publishAndAudit(event: Event): void {
    this.eventBus.publish(event);
    this.auditLog.recordEvent(event, summarizeEvent(event), "memory");
  }
}
