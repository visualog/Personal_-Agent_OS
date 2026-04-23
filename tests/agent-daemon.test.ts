import assert from "node:assert/strict";
import test from "node:test";

import { handleAgentDaemonRequest } from "../scripts/agent-daemon.js";

test("agent daemon exposes health and remote command endpoints", async () => {
  const health = await handleAgentDaemonRequest({
    method: "GET",
    pathname: "/health",
  });
  assert.equal(health.statusCode, 200);
  assert.equal((health.body as { ok: boolean }).ok, true);

  const command = await handleAgentDaemonRequest({
    method: "POST",
    pathname: "/api/remote/commands",
    body: {
      text: "/task 이 저장소에서 로그인 오류를 수정해줘",
      actor_id: "daemon_test_user",
      channel: "cli",
    },
  });
  const receipt = command.body as {
    status: string;
    task_id?: string;
    approval_id?: string;
  };

  assert.equal(command.statusCode, 200);
  assert.equal(receipt.status, "accepted");
  assert.ok(receipt.task_id);
  assert.ok(receipt.approval_id);
});
