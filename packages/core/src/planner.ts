import { randomUUID } from "node:crypto";

import type { BaseEvent } from "./events.js";
import type { Capability, RiskLevel } from "./policy.js";
import type { Plan, Step, Task } from "./domain.js";

export interface CreatePlanInput {
  task: Task;
  workspaceRoot?: string;
  now?: string;
}

export interface PlannerResult {
  plan: Plan;
  event: BaseEvent<"plan.drafted">;
}

const STATUS_KEYWORDS = [
  "프로젝트",
  "상태",
  "파일",
  "읽",
  "목록",
  "project",
  "status",
  "file",
  "read",
  "list",
];

const CODE_KEYWORDS = [
  "코드",
  "구현",
  "수정",
  "리팩터링",
  "fix",
  "implement",
  "refactor",
  "patch",
  "code",
];

const PATH_HINT_PATTERN = /[`"'(]?([A-Za-z0-9_./-]+\.[A-Za-z0-9]+|[A-Za-z0-9_./-]+\/[A-Za-z0-9_./-]+)[`"')?,]?/g;

function hasWorkspaceReadIntent(rawRequest: string): boolean {
  const normalized = rawRequest.toLowerCase();
  return STATUS_KEYWORDS.some((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  );
}

function hasCodeIntent(rawRequest: string): boolean {
  const normalized = rawRequest.toLowerCase();
  return CODE_KEYWORDS.some((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  );
}

function extractRequestedPath(rawRequest: string): string | null {
  const matches = [...rawRequest.matchAll(PATH_HINT_PATTERN)];
  for (const match of matches) {
    const candidate = match[1]?.trim();
    if (!candidate) {
      continue;
    }

    if (candidate.startsWith("./")) {
      return candidate.slice(2);
    }

    return candidate;
  }

  return null;
}

function buildStep(
  planId: string,
  title: string,
  toolName: string,
  requiredCapabilities: readonly Capability[],
  riskLevel: RiskLevel,
  dependsOn: readonly string[] = [],
): Step {
  return {
    id: `step_${randomUUID()}`,
    plan_id: planId,
    title,
    status: "ready",
    tool_name: toolName,
    required_capabilities: requiredCapabilities,
    risk_level: riskLevel,
    approval_id: null,
    depends_on: dependsOn,
  };
}

export function createPlan(input: CreatePlanInput): PlannerResult {
  const now = input.now ?? new Date().toISOString();
  const planId = `plan_${randomUUID()}`;
  const requiresWorkspaceRead = hasWorkspaceReadIntent(input.task.raw_request);
  const requiresCodeWrite = hasCodeIntent(input.task.raw_request);
  const requestedPath = extractRequestedPath(input.task.raw_request);

  const steps = requiresCodeWrite
    ? [
        buildStep(
          planId,
          "작업공간 파일 목록 확인",
          "workspace.list_files",
          ["workspace.read"],
          "low",
        ),
        buildStep(
          planId,
          "작업공간 파일 읽기",
          "workspace.read_file",
          ["workspace.read"],
          "low",
        ),
        buildStep(
          planId,
          "수정 제안 초안 작성",
          "workspace.write_draft",
          ["workspace.write"],
          "low",
        ),
        ...(requestedPath
          ? [
              buildStep(
                planId,
                "수정 patch 제안 작성",
                "workspace.write_patch",
                ["workspace.write"],
                "low",
              ),
              buildStep(
                planId,
                "승인 후 patch 적용",
                "workspace.apply_patch",
                ["workspace.write"],
                "high",
              ),
            ]
          : []),
      ]
    : requiresWorkspaceRead
    ? [
        buildStep(
          planId,
          "작업공간 파일 목록 확인",
          "workspace.list_files",
          ["workspace.read"],
          "low",
        ),
        buildStep(
          planId,
          "작업공간 파일 읽기",
          "workspace.read_file",
          ["workspace.read"],
          "low",
        ),
      ]
    : [
        buildStep(
          planId,
          "작업공간 파일 목록 확인",
          "workspace.list_files",
          ["workspace.read"],
          "low",
        ),
      ];

  if (steps.length > 1) {
    steps[1] = {
      ...steps[1],
      depends_on: [steps[0].id],
    };
  }

  if (steps.length > 2) {
    steps[2] = {
      ...steps[2],
      depends_on: [steps[1].id],
    };
  }

  if (steps.length > 3) {
    steps[3] = {
      ...steps[3],
      depends_on: [steps[2].id],
    };
  }

  if (steps.length > 4) {
    steps[4] = {
      ...steps[4],
      depends_on: [steps[3].id],
    };
  }

  const plan: Plan = {
    id: planId,
    task_id: input.task.id,
    summary: requiresCodeWrite
      ? requestedPath
        ? "작업공간 상태를 확인하고 수정 제안을 만든 뒤 승인 시 파일에 적용하는 초안입니다."
        : "작업공간 상태를 확인하고 수정 제안 초안을 생성하는 계획입니다."
      : requiresWorkspaceRead
      ? "작업공간 상태를 확인한 뒤 파일을 읽는 초안입니다."
      : "작업공간 파일 목록을 확인하는 초안입니다.",
    steps,
    status: "drafted",
    created_at: now,
    updated_at: now,
  };

  const event: BaseEvent<"plan.drafted"> = {
    event_id: `evt_${randomUUID()}`,
    event_type: "plan.drafted",
    timestamp: now,
    actor: "agent",
    task_id: input.task.id,
    trace_id: `trace_${randomUUID()}`,
    correlation_id: null,
    payload: {
      plan_id: planId,
      step_count: steps.length,
      requires_approval: Boolean(requestedPath && requiresCodeWrite),
      risk_summary: {
        low: steps.filter((step) => step.risk_level === "low").length,
        medium: steps.filter((step) => step.risk_level === "medium").length,
        high: steps.filter((step) => step.risk_level === "high").length,
        critical: 0,
      },
    },
  };

  return { plan, event };
}
