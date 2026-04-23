export type RemoteCommandIntent =
  | "create_task"
  | "get_status"
  | "approve"
  | "deny"
  | "cancel";

export interface RemoteCommandScope {
  readonly workspace_root: string;
  readonly allowed_paths: readonly string[];
  readonly allow_read: boolean;
  readonly allow_write: boolean;
  readonly allow_execute: boolean;
  readonly allow_network: boolean;
}

export interface RemoteCommandEnvelope {
  readonly channel: "telegram" | "web" | "cli";
  readonly actor_id: string;
  readonly text: string;
  readonly intent: RemoteCommandIntent;
  readonly args: Record<string, string>;
  readonly scope: RemoteCommandScope;
}

export interface RemoteCommandValidation {
  readonly ok: boolean;
  readonly reasons: readonly string[];
}

const CODE_TASK_KEYWORDS = [
  "코드",
  "수정",
  "구현",
  "리팩터링",
  "파일",
  "patch",
  "fix",
  "implement",
  "refactor",
  "code",
];

function hasCodeTaskIntent(text: string): boolean {
  const normalized = text.toLowerCase();
  return CODE_TASK_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

function normalizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function createDefaultRemoteScope(workspaceRoot: string): RemoteCommandScope {
  return {
    workspace_root: workspaceRoot,
    allowed_paths: [workspaceRoot],
    allow_read: true,
    allow_write: false,
    allow_execute: false,
    allow_network: false,
  };
}

export function parseRemoteCommand(input: {
  text: string;
  actor_id: string;
  channel?: RemoteCommandEnvelope["channel"];
  workspace_root: string;
}): RemoteCommandEnvelope {
  const normalizedText = normalizeText(input.text);
  const channel = input.channel ?? "web";
  const scope = createDefaultRemoteScope(input.workspace_root);

  if (normalizedText.startsWith("/status")) {
    const [, taskId = ""] = normalizedText.split(" ");
    return {
      channel,
      actor_id: input.actor_id,
      text: normalizedText,
      intent: "get_status",
      args: { task_id: taskId },
      scope,
    };
  }

  if (normalizedText.startsWith("/approve")) {
    const [, approvalId = ""] = normalizedText.split(" ");
    return {
      channel,
      actor_id: input.actor_id,
      text: normalizedText,
      intent: "approve",
      args: { approval_id: approvalId },
      scope,
    };
  }

  if (normalizedText.startsWith("/deny")) {
    const [, approvalId = ""] = normalizedText.split(" ");
    return {
      channel,
      actor_id: input.actor_id,
      text: normalizedText,
      intent: "deny",
      args: { approval_id: approvalId },
      scope,
    };
  }

  if (normalizedText.startsWith("/cancel")) {
    const [, taskId = ""] = normalizedText.split(" ");
    return {
      channel,
      actor_id: input.actor_id,
      text: normalizedText,
      intent: "cancel",
      args: { task_id: taskId },
      scope,
    };
  }

  const taskText = normalizedText.startsWith("/task ")
    ? normalizedText.slice("/task ".length)
    : normalizedText;

  return {
    channel,
    actor_id: input.actor_id,
    text: normalizedText,
    intent: "create_task",
    args: {
      raw_request: taskText,
      task_mode: hasCodeTaskIntent(taskText) ? "coding" : "general",
    },
    scope: hasCodeTaskIntent(taskText)
      ? {
          ...scope,
          allow_write: true,
        }
      : scope,
  };
}

export function validateRemoteCommand(command: RemoteCommandEnvelope): RemoteCommandValidation {
  const reasons: string[] = [];

  if (!command.actor_id.trim()) {
    reasons.push("actor_id_required");
  }

  if (command.scope.allowed_paths.length === 0) {
    reasons.push("allowed_paths_required");
  }

  if (command.intent === "create_task") {
    const rawRequest = command.args.raw_request?.trim() ?? "";
    if (!rawRequest) {
      reasons.push("raw_request_required");
    }

    if (command.scope.allow_network) {
      reasons.push("remote_commands_cannot_enable_network_by_default");
    }
  }

  if (command.intent === "approve" || command.intent === "deny") {
    if (!command.args.approval_id?.trim()) {
      reasons.push("approval_id_required");
    }
  }

  if (command.intent === "get_status" || command.intent === "cancel") {
    if (!command.args.task_id?.trim()) {
      reasons.push("task_id_required");
    }
  }

  if (command.scope.allow_execute) {
    reasons.push("remote_commands_cannot_enable_execute_by_default");
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}
