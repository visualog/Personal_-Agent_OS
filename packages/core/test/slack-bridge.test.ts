import assert from "node:assert/strict";
import test from "node:test";

import {
  createSlackBotClient,
  formatSlackHelpMessage,
  handleSlackMessage,
  isSlackChannelAllowed,
  isSlackUserAllowed,
  verifySlackBridgeStartup,
  verifySlackDaemonHealth,
  type SlackBotClient,
} from "../src/index.js";

test("isSlackUserAllowed and isSlackChannelAllowed check allowlists", () => {
  assert.equal(isSlackUserAllowed({
    user_id: "U123",
    allowed_user_ids: ["U123"],
  }), true);
  assert.equal(isSlackUserAllowed({
    user_id: "U999",
    allowed_user_ids: ["U123"],
  }), false);
  assert.equal(isSlackChannelAllowed({
    channel_id: "C123",
    allowed_channel_ids: ["C123"],
  }), true);
  assert.equal(isSlackChannelAllowed({
    channel_id: "C999",
    allowed_channel_ids: ["C123"],
  }), false);
});

test("handleSlackMessage returns help text for allowed /help", async () => {
  const result = await handleSlackMessage({
    message: {
      user: "U123",
      text: "/help",
      ts: "1.0",
    },
    channel_id: "C123",
    config: {
      allowed_user_ids: ["U123"],
      allowed_channel_ids: ["C123"],
      bot_name: "PAOS",
    },
    service: {
      async submitCommand() {
        throw new Error("submitCommand should not be called");
      },
    },
  });

  assert.equal(result.handled, true);
  assert.match(result.response_text ?? "", /PAOS 원격 제어 명령/);
});

test("handleSlackMessage rejects unauthorized users before submitting commands", async () => {
  const result = await handleSlackMessage({
    message: {
      user: "U999",
      text: "/task 로그인 오류를 고쳐줘",
      ts: "1.0",
    },
    channel_id: "C123",
    config: {
      allowed_user_ids: ["U123"],
      allowed_channel_ids: ["C123"],
    },
    service: {
      async submitCommand() {
        throw new Error("unauthorized user should not reach service");
      },
    },
  });

  assert.equal(result.handled, true);
  assert.match(result.response_text ?? "", /허용되지 않은 사용자/);
});

test("handleSlackMessage ignores bot-generated messages", async () => {
  const result = await handleSlackMessage({
    message: {
      user: "U123",
      text: "/task 테스트",
      ts: "1.0",
      bot_id: "B123",
    },
    channel_id: "C123",
    config: {
      allowed_user_ids: ["U123"],
      allowed_channel_ids: ["C123"],
    },
    service: {
      async submitCommand() {
        throw new Error("bot messages should be ignored");
      },
    },
  });

  assert.equal(result.handled, false);
});

test("handleSlackMessage forwards allowed remote commands and formats metadata", async () => {
  const result = await handleSlackMessage({
    message: {
      user: "U123",
      text: "/task 이 저장소에서 인증 흐름을 정리해줘",
      ts: "1.0",
    },
    channel_id: "C123",
    config: {
      allowed_user_ids: ["U123"],
      allowed_channel_ids: ["C123"],
    },
    service: {
      async submitCommand() {
        return {
          status: "accepted" as const,
          reasons: [],
          summary: "원격 작업이 생성되었습니다.",
          task_id: "task_123",
          approval_id: "approval_123",
        };
      },
    },
  });

  assert.equal(result.handled, true);
  assert.match(result.response_text ?? "", /task_123/);
  assert.match(result.response_text ?? "", /approval_123/);
});

test("createSlackBotClient authTest returns identity via fetch", async () => {
  const calls: Array<{ method: string; body?: string | null }> = [];
  const client = createSlackBotClient({
    token: "xoxb-test",
    fetch_impl: (async (_input: string | URL | Request, init?: RequestInit) => {
      calls.push({
        method: String(_input),
        body: typeof init?.body === "string" ? init.body : null,
      });
      return new Response(JSON.stringify({
        ok: true,
        bot_id: "B123",
        user_id: "U123",
        team: "loco",
        url: "https://loco.slack.com/",
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    }) as typeof fetch,
  });

  const auth = await client.authTest();
  assert.equal(auth.bot_id, "B123");
  assert.match(calls[0]?.method ?? "", /auth\.test/);
});

test("verifySlackDaemonHealth reads daemon health payload", async () => {
  const result = await verifySlackDaemonHealth({
    daemon_url: "http://127.0.0.1:4180",
    fetch_impl: (async () => new Response(JSON.stringify({
      ok: true,
      service: "personal-agent-os-daemon",
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    })) as typeof fetch,
  });

  assert.equal(result.ok, true);
  assert.equal(result.service, "personal-agent-os-daemon");
});

test("verifySlackBridgeStartup checks auth and optional daemon health", async () => {
  const client: SlackBotClient = {
    async authTest() {
      return {
        bot_id: "B123",
        user_id: "U123",
        team: "loco",
      };
    },
    async conversationsHistory() {
      return [];
    },
    async postMessage() {
      return;
    },
  };

  const status = await verifySlackBridgeStartup({
    client,
    daemon_url: "http://127.0.0.1:4180",
    fetch_impl: (async () => new Response(JSON.stringify({
      ok: true,
      service: "personal-agent-os-daemon",
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
      },
    })) as typeof fetch,
  });

  assert.equal(status.ok, true);
  assert.equal(status.auth.team, "loco");
  assert.equal(status.daemon_health?.service, "personal-agent-os-daemon");
});

test("formatSlackHelpMessage documents safety rules", () => {
  const help = formatSlackHelpMessage("PAOS");
  assert.match(help, /허용된 사용자와 채널만 처리/);
  assert.match(help, /명령 범위를 벗어난 실행 금지/);
});
