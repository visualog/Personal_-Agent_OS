import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTelegramHelpMessage,
  handleTelegramMessage,
  isTelegramUserAllowed,
  processTelegramUpdates,
  type TelegramBotClient,
} from "../src/index.js";

test("isTelegramUserAllowed only permits configured user ids", () => {
  assert.equal(isTelegramUserAllowed({
    user_id: 123,
    allowed_user_ids: ["123", "456"],
  }), true);
  assert.equal(isTelegramUserAllowed({
    user_id: 789,
    allowed_user_ids: ["123", "456"],
  }), false);
});

test("handleTelegramMessage returns help text for allowed /help requests", async () => {
  const result = await handleTelegramMessage({
    message: {
      message_id: 1,
      text: "/help",
      from: { id: 123 },
      chat: { id: 999 },
    },
    config: {
      allowed_user_ids: ["123"],
      bot_name: "PAOS",
    },
    service: {
      async submitCommand() {
        throw new Error("submitCommand should not be called for /help");
      },
    },
  });

  assert.equal(result.handled, true);
  assert.match(result.response_text ?? "", /PAOS 원격 제어 명령/);
});

test("handleTelegramMessage rejects unauthorized users before submitting commands", async () => {
  const result = await handleTelegramMessage({
    message: {
      message_id: 1,
      text: "/task 로그인 오류를 고쳐줘",
      from: { id: 789 },
      chat: { id: 999 },
    },
    config: {
      allowed_user_ids: ["123"],
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

test("handleTelegramMessage forwards allowed remote commands and formats task metadata", async () => {
  const result = await handleTelegramMessage({
    message: {
      message_id: 1,
      text: "/task 이 저장소에서 인증 흐름을 정리해줘",
      from: { id: 123 },
      chat: { id: 999 },
    },
    config: {
      allowed_user_ids: ["123"],
    },
    service: {
      async submitCommand() {
        return {
          status: "accepted" as const,
          reasons: [],
          summary: "원격 작업이 생성되었고 승인 대기 중입니다.",
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

test("processTelegramUpdates sends replies for handled messages and returns the last update id", async () => {
  const sentMessages: Array<{ chat_id: number; text: string }> = [];
  const client: TelegramBotClient = {
    async getUpdates() {
      return [];
    },
    async sendMessage(message) {
      sentMessages.push(message);
    },
  };

  const result = await processTelegramUpdates({
    updates: [
      {
        update_id: 10,
        message: {
          message_id: 1,
          text: "/help",
          from: { id: 123 },
          chat: { id: 999 },
        },
      },
      {
        update_id: 11,
        message: {
          message_id: 2,
          text: "/task 테스트 작업 생성",
          from: { id: 123 },
          chat: { id: 999 },
        },
      },
    ],
    config: {
      allowed_user_ids: ["123"],
      bot_name: "PAOS",
    },
    service: {
      async submitCommand(input) {
        return {
          status: "accepted" as const,
          reasons: [],
          summary: `수락됨: ${input.text}`,
          task_id: "task_remote",
        };
      },
    },
    client,
  });

  assert.equal(result.last_update_id, 11);
  assert.equal(sentMessages.length, 2);
  assert.match(sentMessages[0]?.text ?? "", /PAOS 원격 제어 명령/);
  assert.match(sentMessages[1]?.text ?? "", /수락됨: \/task 테스트 작업 생성/);
});

test("formatTelegramHelpMessage documents the safety rules", () => {
  const help = formatTelegramHelpMessage("PAOS");
  assert.match(help, /위험한 작업은 승인 필요/);
  assert.match(help, /명령 범위를 벗어난 실행 금지/);
});
