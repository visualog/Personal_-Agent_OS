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

function hasWorkspaceReadIntent(rawRequest: string): boolean {
  const normalized = rawRequest.toLowerCase();
  return STATUS_KEYWORDS.some((keyword) =>
    normalized.includes(keyword.toLowerCase()),
  );
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

  const steps = requiresWorkspaceRead
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

  const plan: Plan = {
    id: planId,
    task_id: input.task.id,
    summary: requiresWorkspaceRead
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
      requires_approval: false,
      risk_summary: {
        low: steps.length,
        medium: 0,
        high: 0,
        critical: 0,
      },
    },
  };

  return { plan, event };
}
