import http from "node:http";

import {
  getAgentDaemonRuntime,
  type RuntimeApprovalAction,
} from "./command-center-demo-runtime.js";

type JsonObject = Record<string, unknown>;

async function readJsonBody(req: http.IncomingMessage): Promise<JsonObject> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as JsonObject;
}

function sendJson(res: http.ServerResponse, statusCode: number, body: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

export async function handleAgentDaemonRequest(input: {
  method: string;
  pathname: string;
  body?: JsonObject;
}): Promise<{ readonly statusCode: number; readonly body: unknown }> {
  const pathname = input.pathname;

  if (input.method === "GET" && pathname === "/health") {
    return {
      statusCode: 200,
      body: {
        ok: true,
        service: "personal-agent-os-daemon",
      },
    };
  }

  if (input.method === "GET" && pathname === "/api/command-center/state") {
    const runtime = await getAgentDaemonRuntime();
    const snapshot = await runtime.getSnapshot();
    return {
      statusCode: 200,
      body: snapshot,
    };
  }

  if (input.method === "POST" && pathname === "/api/command-center/reset") {
    const runtime = await getAgentDaemonRuntime();
    const snapshot = await runtime.getSnapshot();
    return {
      statusCode: 200,
      body: snapshot,
    };
  }

  if (input.method === "GET" && pathname === "/api/remote/tasks") {
    const runtime = await getAgentDaemonRuntime();
    const tasks = await runtime.listRemoteTasks();
    return {
      statusCode: 200,
      body: { tasks },
    };
  }

  if (input.method === "GET" && pathname.startsWith("/api/remote/tasks/")) {
    const taskId = pathname.split("/").at(-1);
    if (!taskId) {
      return {
        statusCode: 400,
        body: { error: "task id required" },
      };
    }

    const runtime = await getAgentDaemonRuntime();
    const task = await runtime.getRemoteTask(taskId);
    return {
      statusCode: 200,
      body: { task },
    };
  }

  if (input.method === "POST" && pathname === "/api/remote/commands") {
    const body = input.body ?? {};
    const text = typeof body.text === "string" ? body.text : "";
    const actorId = typeof body.actor_id === "string" ? body.actor_id : "";
    const channel = body.channel === "telegram" || body.channel === "cli" ? body.channel : "web";

    if (!text || !actorId) {
      return {
        statusCode: 400,
        body: { error: "text and actor_id required" },
      };
    }

    const runtime = await getAgentDaemonRuntime();
    const receipt = await runtime.submitRemoteCommand({
      text,
      actor_id: actorId,
      channel,
    });
    return {
      statusCode: 200,
      body: receipt,
    };
  }

  if (input.method === "POST" && pathname.startsWith("/api/command-center/approvals/")) {
    const approvalId = pathname.split("/").at(-1);
    if (!approvalId) {
      return {
        statusCode: 400,
        body: { error: "approval id required" },
      };
    }

    const body = input.body ?? {};
    const action = body.action;
    if (
      action !== "approve" &&
      action !== "deny" &&
      action !== "request_changes" &&
      action !== "cancel_task"
    ) {
      return {
        statusCode: 400,
        body: { error: "unsupported action" },
      };
    }

    const runtime = await getAgentDaemonRuntime();
    const snapshot = await runtime.resolveApprovalAction(
      approvalId,
      action as RuntimeApprovalAction,
    );
    return {
      statusCode: 200,
      body: snapshot,
    };
  }

  return {
    statusCode: 404,
    body: { error: "not_found" },
  };
}

export function createAgentDaemonServer(): http.Server {
  return http.createServer(async (req, res) => {
    try {
      const result = await handleAgentDaemonRequest({
        method: req.method ?? "GET",
        pathname: req.url?.split("?")[0] ?? "",
        body: req.method === "POST" ? await readJsonBody(req) : undefined,
      });
      sendJson(res, result.statusCode, result.body);
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : "daemon_failure",
      });
    }
  });
}

export async function startAgentDaemonServer(input?: {
  host?: string;
  port?: number;
}): Promise<http.Server> {
  const host = input?.host ?? "127.0.0.1";
  const port = input?.port ?? 4180;
  const server = createAgentDaemonServer();

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return server;
}
