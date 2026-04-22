export type TaskItem = {
  task_id: string;
  title: string;
  status: "completed" | "waiting_approval" | "failed";
  priority: "normal" | "high";
  sensitivity: "internal" | "personal";
  pending_approval_count: number;
  risk_flag_count: number;
  updated_at: string;
};

export type ApprovalCard = {
  approval_id: string;
  task_id: string;
  step_id: string;
  title: string;
  summary: string;
  risk_reasons: string[];
  actions: ["approve", "deny", "request_changes", "cancel_task"];
};

export type TimelineEvent = {
  type: string;
  timestamp: string;
  summary: string;
};

export type AuditRecord = {
  event_type: string;
  actor: string;
  summary: string;
  created_at: string;
};

export type TaskDetail = {
  task_id: string;
  title: string;
  status: string;
  plans: Array<{ id: string; status: string; summary: string }>;
  steps: Array<{ id: string; title: string; status: string; tool_name: string }>;
  approvals: Array<{ id: string; status: string; summary: string }>;
  risk_flags: Array<{ decision: string; tool_name: string; summary: string }>;
  timeline: TimelineEvent[];
  audit_records: AuditRecord[];
};

export const taskItems: TaskItem[] = [
  {
    task_id: "task_a",
    title: "이 프로젝트 현재 상태를 정리하고 다음 작업을 제안해줘",
    status: "completed",
    priority: "normal",
    sensitivity: "internal",
    pending_approval_count: 0,
    risk_flag_count: 0,
    updated_at: "2026-04-22T14:10:00.000Z",
  },
  {
    task_id: "task_b",
    title: "어제 논의한 내용을 읽고 답장 초안을 만들어줘. 보내지는 마.",
    status: "waiting_approval",
    priority: "high",
    sensitivity: "personal",
    pending_approval_count: 1,
    risk_flag_count: 1,
    updated_at: "2026-04-22T14:24:00.000Z",
  },
  {
    task_id: "task_c",
    title: "오래된 파일을 정리해서 삭제해줘",
    status: "failed",
    priority: "high",
    sensitivity: "internal",
    pending_approval_count: 0,
    risk_flag_count: 1,
    updated_at: "2026-04-22T14:31:00.000Z",
  },
];

export const approvalQueue: ApprovalCard[] = [
  {
    approval_id: "approval_b",
    task_id: "task_b",
    step_id: "step_b_02",
    title: taskItems[1]!.title,
    summary: "작업공간 파일 읽기 승인 필요",
    risk_reasons: ["medium risk capability requires approval"],
    actions: ["approve", "deny", "request_changes", "cancel_task"],
  },
];

export const taskDetails: Record<string, TaskDetail> = {
  task_a: {
    task_id: "task_a",
    title: taskItems[0]!.title,
    status: "completed",
    plans: [
      {
        id: "plan_a",
        status: "completed",
        summary: "작업공간 상태를 확인한 뒤 파일을 읽는 초안입니다.",
      },
    ],
    steps: [
      {
        id: "step_a_01",
        title: "작업공간 파일 목록 확인",
        status: "completed",
        tool_name: "workspace.list_files",
      },
      {
        id: "step_a_02",
        title: "작업공간 파일 읽기",
        status: "completed",
        tool_name: "workspace.read_file",
      },
    ],
    approvals: [],
    risk_flags: [],
    timeline: [
      { type: "task.created", timestamp: "2026-04-22T14:05:00.000Z", summary: "task created" },
      { type: "plan.drafted", timestamp: "2026-04-22T14:05:01.000Z", summary: "plan drafted" },
      { type: "action.succeeded", timestamp: "2026-04-22T14:05:03.000Z", summary: "workspace.list_files succeeded" },
      { type: "action.succeeded", timestamp: "2026-04-22T14:05:04.000Z", summary: "workspace.read_file succeeded" },
      { type: "task.updated", timestamp: "2026-04-22T14:05:05.000Z", summary: "task status changed to completed" },
    ],
    audit_records: [
      { event_type: "task.created", actor: "agent", summary: "task created", created_at: "2026-04-22T14:05:00.000Z" },
      { event_type: "action.succeeded", actor: "agent", summary: "action succeeded: workspace.read_file", created_at: "2026-04-22T14:05:04.000Z" },
    ],
  },
  task_b: {
    task_id: "task_b",
    title: taskItems[1]!.title,
    status: "waiting_approval",
    plans: [
      {
        id: "plan_b",
        status: "partially_approved",
        summary: "초안 작성 전 필요한 근거를 읽는 실행 계획입니다.",
      },
    ],
    steps: [
      {
        id: "step_b_01",
        title: "작업공간 파일 목록 확인",
        status: "completed",
        tool_name: "workspace.list_files",
      },
      {
        id: "step_b_02",
        title: "작업공간 파일 읽기",
        status: "waiting_approval",
        tool_name: "workspace.read_file",
      },
    ],
    approvals: [
      { id: "approval_b", status: "requested", summary: "작업공간 파일 읽기 승인 필요" },
    ],
    risk_flags: [
      {
        decision: "require_approval",
        tool_name: "workspace.read_file",
        summary: "workspace.read_file requires approval",
      },
    ],
    timeline: [
      { type: "task.created", timestamp: "2026-04-22T14:20:00.000Z", summary: "task created" },
      { type: "plan.drafted", timestamp: "2026-04-22T14:20:01.000Z", summary: "plan drafted" },
      { type: "policy.evaluated", timestamp: "2026-04-22T14:20:03.000Z", summary: "policy evaluated: require_approval" },
      { type: "risk.flagged", timestamp: "2026-04-22T14:20:03.100Z", summary: "risk flagged: require_approval" },
      { type: "step.approval_requested", timestamp: "2026-04-22T14:20:04.000Z", summary: "approval requested" },
      { type: "task.updated", timestamp: "2026-04-22T14:20:05.000Z", summary: "task status changed to waiting_approval" },
    ],
    audit_records: [
      { event_type: "policy.evaluated", actor: "system", summary: "policy evaluated: require_approval", created_at: "2026-04-22T14:20:03.000Z" },
      { event_type: "step.approval_requested", actor: "system", summary: "approval requested: approval_b", created_at: "2026-04-22T14:20:04.000Z" },
    ],
  },
  task_c: {
    task_id: "task_c",
    title: taskItems[2]!.title,
    status: "failed",
    plans: [
      {
        id: "plan_c",
        status: "failed",
        summary: "위험 요청을 정책과 런타임 제어 아래에서 차단합니다.",
      },
    ],
    steps: [
      {
        id: "step_c_01",
        title: "작업공간 파일 목록 확인",
        status: "failed",
        tool_name: "workspace.list_files",
      },
    ],
    approvals: [],
    risk_flags: [
      {
        decision: "deny",
        tool_name: "workspace.list_files",
        summary: "workspace.list_files denied by policy",
      },
    ],
    timeline: [
      { type: "safety.lockdown_enabled", timestamp: "2026-04-22T14:30:00.000Z", summary: "lockdown enabled" },
      { type: "policy.evaluated", timestamp: "2026-04-22T14:30:02.000Z", summary: "policy evaluated: deny" },
      { type: "risk.flagged", timestamp: "2026-04-22T14:30:02.100Z", summary: "risk flagged: deny" },
      { type: "action.failed", timestamp: "2026-04-22T14:30:03.000Z", summary: "action denied" },
      { type: "task.updated", timestamp: "2026-04-22T14:30:04.000Z", summary: "task status changed to failed" },
    ],
    audit_records: [
      { event_type: "safety.lockdown_enabled", actor: "system", summary: "lockdown enabled: dangerous destructive request", created_at: "2026-04-22T14:30:00.000Z" },
      { event_type: "action.failed", actor: "agent", summary: "action failed: workspace.list_files", created_at: "2026-04-22T14:30:03.000Z" },
    ],
  },
};
