export interface TelegramUser {
  readonly id: number;
  readonly username?: string;
}

export interface TelegramChat {
  readonly id: number;
}

export interface TelegramMessage {
  readonly message_id: number;
  readonly text?: string;
  readonly from?: TelegramUser;
  readonly chat: TelegramChat;
}

export interface TelegramUpdate {
  readonly update_id: number;
  readonly message?: TelegramMessage;
}

export interface TelegramGetUpdatesOptions {
  readonly offset?: number;
  readonly timeout_seconds?: number;
}

export interface TelegramBotIdentity {
  readonly id: number;
  readonly username?: string;
  readonly first_name?: string;
}

export interface TelegramBotClient {
  getMe(): Promise<TelegramBotIdentity>;
  getUpdates(options?: TelegramGetUpdatesOptions): Promise<readonly TelegramUpdate[]>;
  sendMessage(input: { chat_id: number; text: string }): Promise<void>;
}

export interface TelegramCommandResult {
  readonly handled: boolean;
  readonly response_text?: string;
}

export interface TelegramRemoteCommandService {
  submitCommand(input: {
    text: string;
    actor_id: string;
    channel: "telegram";
  }): Promise<{
    readonly status: "accepted" | "rejected";
    readonly reasons: readonly string[];
    readonly summary: string;
    readonly task_id?: string;
    readonly approval_id?: string;
  }>;
}

export interface TelegramBridgeConfig {
  readonly allowed_user_ids: readonly string[];
  readonly bot_name?: string;
}

export interface TelegramBridgeStartupStatus {
  readonly ok: boolean;
  readonly bot?: TelegramBotIdentity;
  readonly daemon_health?: {
    readonly ok: boolean;
    readonly service?: string;
  };
}

function normalizeAllowedUserIds(userIds: readonly string[]): string[] {
  return userIds
    .map((userId) => userId.trim())
    .filter(Boolean);
}

export function isTelegramUserAllowed(input: {
  user_id: number | string;
  allowed_user_ids: readonly string[];
}): boolean {
  const allowedUserIds = normalizeAllowedUserIds(input.allowed_user_ids);
  if (allowedUserIds.length === 0) {
    return false;
  }

  return allowedUserIds.includes(String(input.user_id));
}

export function formatTelegramHelpMessage(botName = "Personal Agent OS"): string {
  return [
    `${botName} 원격 제어 명령`,
    "",
    "/task <요청> - 새 작업 생성",
    "/status <task_id> - 작업 상태 확인",
    "/approve <approval_id> - 승인 처리",
    "/deny <approval_id> - 거부 처리",
    "/cancel <task_id> - 작업 취소",
    "",
    "안전 규칙:",
    "- 기본은 읽기 중심 범위",
    "- 위험한 작업은 승인 필요",
    "- 명령 범위를 벗어난 실행 금지",
  ].join("\n");
}

function formatRemoteResultMessage(result: Awaited<ReturnType<TelegramRemoteCommandService["submitCommand"]>>): string {
  const lines = [result.summary];

  if (result.task_id) {
    lines.push(`task_id: ${result.task_id}`);
  }

  if (result.approval_id) {
    lines.push(`approval_id: ${result.approval_id}`);
  }

  if (result.reasons.length > 0) {
    lines.push(`reasons: ${result.reasons.join(", ")}`);
  }

  return lines.join("\n");
}

export async function handleTelegramMessage(input: {
  message: TelegramMessage;
  config: TelegramBridgeConfig;
  service: TelegramRemoteCommandService;
}): Promise<TelegramCommandResult> {
  const text = input.message.text?.trim();
  const userId = input.message.from?.id;

  if (!text || !userId) {
    return { handled: false };
  }

  if (!isTelegramUserAllowed({
    user_id: userId,
    allowed_user_ids: input.config.allowed_user_ids,
  })) {
    return {
      handled: true,
      response_text: "허용되지 않은 사용자입니다. 이 에이전트는 승인된 계정만 제어할 수 있습니다.",
    };
  }

  if (text === "/start" || text === "/help") {
    return {
      handled: true,
      response_text: formatTelegramHelpMessage(input.config.bot_name),
    };
  }

  const result = await input.service.submitCommand({
    text,
    actor_id: String(userId),
    channel: "telegram",
  });

  return {
    handled: true,
    response_text: formatRemoteResultMessage(result),
  };
}

export async function processTelegramUpdates(input: {
  updates: readonly TelegramUpdate[];
  config: TelegramBridgeConfig;
  service: TelegramRemoteCommandService;
  client: TelegramBotClient;
}): Promise<{ readonly last_update_id: number | null }> {
  let lastUpdateId: number | null = null;

  for (const update of input.updates) {
    lastUpdateId = update.update_id;
    const message = update.message;
    if (!message) {
      continue;
    }

    const result = await handleTelegramMessage({
      message,
      config: input.config,
      service: input.service,
    });

    if (!result.handled || !result.response_text) {
      continue;
    }

    await input.client.sendMessage({
      chat_id: message.chat.id,
      text: result.response_text,
    });
  }

  return {
    last_update_id: lastUpdateId,
  };
}

export async function verifyTelegramDaemonHealth(input: {
  daemon_url: string;
  fetch_impl?: typeof fetch;
}): Promise<{ readonly ok: boolean; readonly service?: string }> {
  const fetchImpl = input.fetch_impl ?? fetch;
  const response = await fetchImpl(`${input.daemon_url.replace(/\/$/, "")}/health`);
  if (!response.ok) {
    throw new Error(`Agent daemon health check failed: ${response.status}`);
  }

  return await response.json() as {
    readonly ok: boolean;
    readonly service?: string;
  };
}

export async function verifyTelegramBridgeStartup(input: {
  client: TelegramBotClient;
  daemon_url?: string;
  fetch_impl?: typeof fetch;
}): Promise<TelegramBridgeStartupStatus> {
  const bot = await input.client.getMe();
  const daemonHealth = input.daemon_url
    ? await verifyTelegramDaemonHealth({
        daemon_url: input.daemon_url,
        fetch_impl: input.fetch_impl,
      })
    : undefined;

  return {
    ok: true,
    bot,
    daemon_health: daemonHealth,
  };
}

export function createTelegramBotClient(input: {
  token: string;
  fetch_impl?: typeof fetch;
}): TelegramBotClient {
  const fetchImpl = input.fetch_impl ?? fetch;
  const baseUrl = `https://api.telegram.org/bot${input.token}`;

  return {
    async getMe() {
      const response = await fetchImpl(`${baseUrl}/getMe`);
      if (!response.ok) {
        throw new Error(`Telegram getMe failed: ${response.status}`);
      }

      const payload = await response.json() as {
        ok: boolean;
        result: TelegramBotIdentity;
      };

      return payload.result;
    },

    async getUpdates(options) {
      const params = new URLSearchParams();
      if (typeof options?.offset === "number") {
        params.set("offset", String(options.offset));
      }
      if (typeof options?.timeout_seconds === "number") {
        params.set("timeout", String(options.timeout_seconds));
      }

      const response = await fetchImpl(`${baseUrl}/getUpdates?${params.toString()}`);
      if (!response.ok) {
        throw new Error(`Telegram getUpdates failed: ${response.status}`);
      }

      const payload = await response.json() as {
        ok: boolean;
        result: TelegramUpdate[];
      };
      return payload.result ?? [];
    },

    async sendMessage(message) {
      const response = await fetchImpl(`${baseUrl}/sendMessage`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`Telegram sendMessage failed: ${response.status}`);
      }
    },
  };
}
