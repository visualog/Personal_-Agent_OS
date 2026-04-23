export interface SlackAuthIdentity {
  readonly bot_id?: string;
  readonly user_id?: string;
  readonly team?: string;
  readonly url?: string;
}

export interface SlackMessage {
  readonly type?: string;
  readonly user?: string;
  readonly text?: string;
  readonly ts: string;
  readonly bot_id?: string;
  readonly subtype?: string;
}

export interface SlackBridgeConfig {
  readonly allowed_user_ids: readonly string[];
  readonly allowed_channel_ids: readonly string[];
  readonly bot_name?: string;
}

export interface SlackBridgeStartupStatus {
  readonly ok: boolean;
  readonly auth: SlackAuthIdentity;
  readonly daemon_health?: {
    readonly ok: boolean;
    readonly service?: string;
  };
}

export interface SlackCommandResult {
  readonly handled: boolean;
  readonly response_text?: string;
}

export interface SlackRemoteCommandService {
  submitCommand(input: {
    text: string;
    actor_id: string;
    channel: "slack";
  }): Promise<{
    readonly status: "accepted" | "rejected";
    readonly reasons: readonly string[];
    readonly summary: string;
    readonly task_id?: string;
    readonly approval_id?: string;
  }>;
}

export interface SlackBotClient {
  authTest(): Promise<SlackAuthIdentity>;
  conversationsHistory(input: {
    channel: string;
    oldest?: string;
    limit?: number;
  }): Promise<readonly SlackMessage[]>;
  postMessage(input: {
    channel: string;
    text: string;
  }): Promise<void>;
}

function normalizeIds(ids: readonly string[]): string[] {
  return ids
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isSlackUserAllowed(input: {
  user_id?: string;
  allowed_user_ids: readonly string[];
}): boolean {
  const userId = input.user_id?.trim();
  if (!userId) {
    return false;
  }

  return normalizeIds(input.allowed_user_ids).includes(userId);
}

export function isSlackChannelAllowed(input: {
  channel_id: string;
  allowed_channel_ids: readonly string[];
}): boolean {
  return normalizeIds(input.allowed_channel_ids).includes(input.channel_id.trim());
}

export function formatSlackHelpMessage(botName = "Personal Agent OS"): string {
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
    "- 허용된 사용자와 채널만 처리",
    "- 위험한 작업은 승인 필요",
    "- 명령 범위를 벗어난 실행 금지",
  ].join("\n");
}

function formatRemoteResultMessage(result: Awaited<ReturnType<SlackRemoteCommandService["submitCommand"]>>): string {
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

export async function handleSlackMessage(input: {
  message: SlackMessage;
  channel_id: string;
  config: SlackBridgeConfig;
  service: SlackRemoteCommandService;
}): Promise<SlackCommandResult> {
  if (!isSlackChannelAllowed({
    channel_id: input.channel_id,
    allowed_channel_ids: input.config.allowed_channel_ids,
  })) {
    return { handled: false };
  }

  if (!isSlackUserAllowed({
    user_id: input.message.user,
    allowed_user_ids: input.config.allowed_user_ids,
  })) {
    return {
      handled: true,
      response_text: "허용되지 않은 사용자입니다. 이 에이전트는 승인된 계정만 제어할 수 있습니다.",
    };
  }

  if (!input.message.text?.trim()) {
    return { handled: false };
  }

  if (input.message.bot_id || input.message.subtype) {
    return { handled: false };
  }

  const text = input.message.text.trim();
  if (text === "/help" || text === "/start") {
    return {
      handled: true,
      response_text: formatSlackHelpMessage(input.config.bot_name),
    };
  }

  const result = await input.service.submitCommand({
    text,
    actor_id: input.message.user ?? "",
    channel: "slack",
  });

  return {
    handled: true,
    response_text: formatRemoteResultMessage(result),
  };
}

export async function verifySlackDaemonHealth(input: {
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

export async function verifySlackBridgeStartup(input: {
  client: SlackBotClient;
  daemon_url?: string;
  fetch_impl?: typeof fetch;
}): Promise<SlackBridgeStartupStatus> {
  const auth = await input.client.authTest();
  const daemonHealth = input.daemon_url
    ? await verifySlackDaemonHealth({
        daemon_url: input.daemon_url,
        fetch_impl: input.fetch_impl,
      })
    : undefined;

  return {
    ok: true,
    auth,
    daemon_health: daemonHealth,
  };
}

export function createSlackBotClient(input: {
  token: string;
  fetch_impl?: typeof fetch;
}): SlackBotClient {
  const fetchImpl = input.fetch_impl ?? fetch;

  async function slackApi<T>(method: string, body?: Record<string, unknown>): Promise<T> {
    const response = await fetchImpl(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${input.token}`,
        "content-type": "application/json; charset=utf-8",
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Slack ${method} failed: ${response.status}`);
    }

    const payload = await response.json() as { ok: boolean; error?: string } & T;
    if (!payload.ok) {
      throw new Error(`Slack ${method} error: ${payload.error ?? "unknown_error"}`);
    }

    return payload;
  }

  return {
    async authTest() {
      const payload = await slackApi<SlackAuthIdentity>("auth.test");
      return {
        bot_id: payload.bot_id,
        user_id: payload.user_id,
        team: payload.team,
        url: payload.url,
      };
    },

    async conversationsHistory(history) {
      const payload = await slackApi<{
        messages?: SlackMessage[];
      }>("conversations.history", {
        channel: history.channel,
        oldest: history.oldest,
        limit: history.limit ?? 20,
        inclusive: false,
      });
      return payload.messages ?? [];
    },

    async postMessage(message) {
      await slackApi("chat.postMessage", {
        channel: message.channel,
        text: message.text,
      });
    },
  };
}
