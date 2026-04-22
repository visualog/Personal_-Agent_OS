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
  actions: readonly string[];
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

export const taskItems = generatedCommandCenterData.taskItems as TaskItem[];
export const approvalQueue = generatedCommandCenterData.approvalQueue as ApprovalQueueItem[];
export const taskDetails = generatedCommandCenterData.taskDetails as Record<string, TaskDetailView>;
