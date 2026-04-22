import { randomUUID, createHash } from "node:crypto";
import type { BaseEvent } from "./events.js";
import type { Sensitivity, Task, TaskPriority } from "./domain.js";

export interface CreateTaskInput {
  raw_request: string;
  created_by: string;
  title?: string;
  priority?: TaskPriority;
  sensitivity?: Sensitivity;
  now?: string;
}

export interface TaskIntakeResult {
  task: Task;
  event: BaseEvent<"task.created">;
}

function normalizeTitle(input: CreateTaskInput): string {
  const provided = input.title?.trim();
  if (provided) {
    return provided.slice(0, 80);
  }

  const firstLine = input.raw_request
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  return firstLine ? firstLine.slice(0, 80) : "Untitled task";
}

export function createTask(input: CreateTaskInput): TaskIntakeResult {
  const timestamp = input.now ?? new Date().toISOString();
  const title = normalizeTitle(input);
  const priority = input.priority ?? "normal";
  const sensitivity = input.sensitivity ?? "internal";
  const raw_request_hash = createHash("sha256").update(input.raw_request).digest("hex");
  const task_id = `task_${randomUUID()}`;
  const trace_id = `trace_${randomUUID()}`;

  const task: Task = {
    id: task_id,
    title,
    raw_request: input.raw_request,
    status: "created",
    priority,
    sensitivity,
    created_by: input.created_by,
    created_at: timestamp,
    updated_at: timestamp,
  };

  const event: BaseEvent<"task.created"> = {
    event_id: `evt_${randomUUID()}`,
    event_type: "task.created",
    timestamp,
    actor: "user",
    task_id,
    trace_id,
    payload: {
      title,
      raw_request_hash,
      channel: "cli",
      priority,
      sensitivity,
    },
  };

  return { task, event };
}
