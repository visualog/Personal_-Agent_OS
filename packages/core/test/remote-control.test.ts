import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultRemoteScope,
  parseRemoteCommand,
  validateRemoteCommand,
} from "../src/index.js";

test("parseRemoteCommand creates a coding task envelope with write scope for code requests", () => {
  const command = parseRemoteCommand({
    text: "/task 이 저장소에서 로그인 오류를 수정해줘",
    actor_id: "telegram_user",
    channel: "telegram",
    workspace_root: "/tmp/workspace",
  });

  assert.equal(command.intent, "create_task");
  assert.equal(command.args.task_mode, "coding");
  assert.equal(command.scope.allow_write, true);
  assert.equal(command.scope.allow_execute, false);
  assert.equal(command.scope.allow_network, false);
});

test("parseRemoteCommand creates status and approval commands with required ids", () => {
  const statusCommand = parseRemoteCommand({
    text: "/status task_123",
    actor_id: "telegram_user",
    workspace_root: "/tmp/workspace",
  });
  const approvalCommand = parseRemoteCommand({
    text: "/approve approval_123",
    actor_id: "telegram_user",
    workspace_root: "/tmp/workspace",
  });

  assert.equal(statusCommand.intent, "get_status");
  assert.equal(statusCommand.args.task_id, "task_123");
  assert.equal(approvalCommand.intent, "approve");
  assert.equal(approvalCommand.args.approval_id, "approval_123");
});

test("validateRemoteCommand rejects missing ids and dangerous default scope flags", () => {
  const invalidStatus = parseRemoteCommand({
    text: "/status",
    actor_id: "remote_user",
    workspace_root: "/tmp/workspace",
  });
  const invalidCreate = {
    ...parseRemoteCommand({
      text: "/task 저장소를 정리해줘",
      actor_id: "remote_user",
      workspace_root: "/tmp/workspace",
    }),
    scope: {
      ...createDefaultRemoteScope("/tmp/workspace"),
      allow_execute: true,
    },
  };

  const statusValidation = validateRemoteCommand(invalidStatus);
  const createValidation = validateRemoteCommand(invalidCreate);

  assert.equal(statusValidation.ok, false);
  assert.ok(statusValidation.reasons.includes("task_id_required"));
  assert.equal(createValidation.ok, false);
  assert.ok(createValidation.reasons.includes("remote_commands_cannot_enable_execute_by_default"));
});
