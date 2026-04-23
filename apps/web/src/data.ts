import { generatedCommandCenterData } from './generated/demo-state';

export type TaskItem = {
  id: string;
  title: string;
  status: string;
  summary: string;
  priority: string;
  pending_approval_count: number;
  risk_flag_count: number;
  updated_at: string;
};

export type ApprovalQueueItem = {
  id: string;
  task_id: string;
  step_id: string;
  title: string;
  summary: string;
  risk_level: string;
  actions: readonly ('approve' | 'deny' | 'request_changes' | 'cancel_task')[];
};

export type TimelineEventView = {
  id: string;
  name: string;
  timestamp: string;
  summary: string;
};

export type AuditRecordView = {
  id: string;
  action: string;
  channel: string;
  summary: string;
  created_at: string;
};

export type RiskFlagView = {
  id: string;
  decision: string;
  risk_level: string;
  reason: string;
  summary: string;
};

export type StepView = {
  id: string;
  title: string;
  status: string;
  tool_name: string;
  risk_level: string;
};

export type TaskDetailView = {
  task: {
    id: string;
    title: string;
    status: string;
    summary: string;
  };
  plan: {
    id: string;
    title: string;
    status: string;
  };
  steps: StepView[];
  approvals: Array<{
    id: string;
    status: string;
    summary: string;
  }>;
  risk_flags: RiskFlagView[];
  timeline: TimelineEventView[];
  audit_records: AuditRecordView[];
};

export type CommandCenterState = {
  taskItems: TaskItem[];
  approvalQueue: ApprovalQueueItem[];
  taskDetails: Record<string, TaskDetailView>;
};

export type RuntimeApprovalAction = 'approve' | 'deny' | 'request_changes' | 'cancel_task';

export type RemoteCommandReceipt = {
  command: {
    channel: 'telegram' | 'web' | 'cli';
    actor_id: string;
    text: string;
    intent: 'create_task' | 'get_status' | 'approve' | 'deny' | 'cancel';
    args: Record<string, string>;
  };
  status: 'accepted' | 'rejected';
  reasons: readonly string[];
  task_id?: string;
  approval_id?: string;
  summary: string;
};

export const fallbackCommandCenterState: CommandCenterState = {
  taskItems: generatedCommandCenterData.taskItems as TaskItem[],
  approvalQueue: generatedCommandCenterData.approvalQueue as ApprovalQueueItem[],
  taskDetails: generatedCommandCenterData.taskDetails as Record<string, TaskDetailView>,
};

export async function fetchCommandCenterState(): Promise<CommandCenterState> {
  const response = await fetch('/api/command-center/state');
  if (!response.ok) {
    throw new Error(`Failed to fetch command center state: ${response.status}`);
  }

  return response.json() as Promise<CommandCenterState>;
}

export async function resetCommandCenterState(): Promise<CommandCenterState> {
  const response = await fetch('/api/command-center/reset', {
    method: 'POST',
  });
  if (!response.ok) {
    throw new Error(`Failed to reset command center state: ${response.status}`);
  }

  return response.json() as Promise<CommandCenterState>;
}

export async function resolveApprovalAction(
  approvalId: string,
  action: RuntimeApprovalAction,
): Promise<CommandCenterState> {
  const response = await fetch(`/api/command-center/approvals/${approvalId}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ action }),
  });

  if (!response.ok) {
    throw new Error(`Failed to resolve approval action: ${response.status}`);
  }

  return response.json() as Promise<CommandCenterState>;
}

export async function submitRemoteCommand(input: {
  text: string;
  actor_id: string;
  channel?: 'telegram' | 'web' | 'cli';
}): Promise<RemoteCommandReceipt> {
  const response = await fetch('/api/remote/commands', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(`Failed to submit remote command: ${response.status}`);
  }

  return response.json() as Promise<RemoteCommandReceipt>;
}
