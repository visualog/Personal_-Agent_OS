import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  InMemoryApprovalStore,
  InMemoryAuditLog,
  InMemoryCommandCenter,
  InMemoryEventBus,
  InMemoryPlanStore,
  InMemoryRuntimeReadModel,
  InMemoryStepStore,
  InMemoryTaskStore,
  PersonalAgentOrchestrator,
  evaluatePolicy,
  type Approval,
  type AuditRecord,
  type CommandCenterApprovalCard,
  type CommandCenterTaskDetail,
  type CommandCenterTaskListItem,
  type Event,
  type OrchestratorToolGateway,
  type Plan,
  type Task,
} from '../packages/core/src/index.js';

export type GeneratedTaskItem = {
  id: string;
  title: string;
  status: string;
  summary: string;
  priority: string;
  pending_approval_count: number;
  risk_flag_count: number;
  updated_at: string;
};

export type GeneratedApprovalQueueItem = {
  id: string;
  task_id: string;
  step_id: string;
  title: string;
  summary: string;
  risk_level: string;
  actions: readonly string[];
};

export type GeneratedTaskDetail = {
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
  steps: Array<{
    id: string;
    title: string;
    status: string;
    tool_name: string;
    risk_level: string;
  }>;
  approvals: Array<{
    id: string;
    status: string;
    summary: string;
  }>;
  risk_flags: Array<{
    id: string;
    decision: string;
    risk_level: string;
    reason: string;
    summary: string;
  }>;
  timeline: Array<{
    id: string;
    name: string;
    timestamp: string;
    summary: string;
  }>;
  audit_records: Array<{
    id: string;
    action: string;
    channel: string;
    summary: string;
    created_at: string;
  }>;
};

export type GeneratedCommandCenterState = {
  taskItems: GeneratedTaskItem[];
  approvalQueue: GeneratedApprovalQueueItem[];
  taskDetails: Record<string, GeneratedTaskDetail>;
};

export type RuntimeApprovalAction = 'approve' | 'deny' | 'cancel_task';

function createApprovalAwareGateway(): OrchestratorToolGateway {
  return {
    registerTool() {
      return undefined;
    },
    async execute(request) {
      if (request.tool_name === 'workspace.list_files') {
        return {
          status: 'succeeded' as const,
          output: { entries: [{ path: 'README.md', type: 'file' }] },
          policy: evaluatePolicy({
            id: request.action_id,
            step_id: request.step_id,
            tool_name: request.tool_name,
            requested_capabilities: ['workspace.read'],
            granted_capabilities: request.granted_capabilities,
            risk_level: 'low',
            scope_allowed: request.scope_allowed,
            approval_granted: request.approval_granted,
            audit_available: request.audit_available,
            tool_registered: true,
            sandbox_matched: request.sandbox_matched,
          }),
        };
      }

      if (request.approval_granted !== true) {
        return {
          status: 'requires_approval' as const,
          policy: evaluatePolicy({
            id: request.action_id,
            step_id: request.step_id,
            tool_name: request.tool_name,
            requested_capabilities: ['workspace.write'],
            granted_capabilities: ['workspace.write'],
            risk_level: 'medium',
            scope_allowed: request.scope_allowed,
            approval_granted: request.approval_granted,
            audit_available: request.audit_available,
            tool_registered: true,
            sandbox_matched: request.sandbox_matched,
          }),
        };
      }

      return {
        status: 'succeeded' as const,
        output: { ok: true, source: 'approved-demo' },
        policy: evaluatePolicy({
          id: request.action_id,
          step_id: request.step_id,
          tool_name: request.tool_name,
          requested_capabilities: ['workspace.write'],
          granted_capabilities: ['workspace.write'],
          risk_level: 'medium',
          scope_allowed: request.scope_allowed,
          approval_granted: true,
          audit_available: request.audit_available,
          tool_registered: true,
          sandbox_matched: request.sandbox_matched,
        }),
      };
    },
  };
}

async function createTempWorkspace(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), 'paos-web-demo-'));
  await mkdir(path.join(root, 'nested'), { recursive: true });
  await writeFile(path.join(root, 'README.md'), '# Personal Agent OS\n', 'utf8');
  await writeFile(path.join(root, 'nested', 'notes.txt'), 'team notes\n', 'utf8');
  return root;
}

function summarizeTimelineEvent(event: Event): string {
  switch (event.event_type) {
    case 'task.created':
      return `Task created: ${event.payload.title}`;
    case 'task.updated':
      return event.payload.summary;
    case 'plan.drafted':
      return `${event.payload.step_count} planned steps drafted`;
    case 'plan.updated':
      return event.payload.summary;
    case 'step.ready':
      return `${event.payload.tool_name} is ready`;
    case 'step.approval_requested':
      return event.payload.summary;
    case 'step.approved':
    case 'step.denied':
      return event.payload.summary;
    case 'policy.evaluated':
      return `${event.payload.tool_name}: ${event.payload.decision}`;
    case 'risk.flagged':
      return event.payload.summary;
    case 'action.started':
      return `${event.payload.tool_name} started`;
    case 'action.succeeded':
    case 'action.failed':
      return event.payload.summary;
    case 'safety.lockdown_enabled':
    case 'safety.lockdown_disabled':
      return event.payload.reason;
    case 'capability.revoked':
    case 'capability.restored':
      return `${event.payload.capability}: ${event.payload.reason}`;
    default:
      return event.event_type;
  }
}

function summarizeTask(item: CommandCenterTaskListItem, detail: CommandCenterTaskDetail): string {
  if (item.pending_approval_count > 0) {
    return `${item.pending_approval_count} approval waiting across ${detail.steps.length} planned steps.`;
  }

  if (item.risk_flag_count > 0) {
    return `${item.risk_flag_count} policy risk signals recorded for this task.`;
  }

  return detail.plans[0]?.summary ?? 'Task finished without approval blockers.';
}

function findRiskLevelForApproval(
  queueItem: CommandCenterApprovalCard,
  detail: CommandCenterTaskDetail,
): string {
  const matchedRisk = detail.risk_flags.find((risk) => risk.payload.step_id === queueItem.step_id);
  return matchedRisk?.payload.risk_level ?? 'medium';
}

function mapAuditRecord(record: AuditRecord): GeneratedTaskDetail['audit_records'][number] {
  return {
    id: record.id,
    action: record.event_type,
    channel: record.target || 'audit',
    summary: record.summary,
    created_at: record.created_at,
  };
}

function mapApproval(approval: Approval): GeneratedTaskDetail['approvals'][number] {
  return {
    id: approval.id,
    status: approval.status,
    summary: approval.summary,
  };
}

class CommandCenterDemoRuntime {
  private readonly taskStore = new InMemoryTaskStore();
  private readonly planStore = new InMemoryPlanStore();
  private readonly stepStore = new InMemoryStepStore();
  private readonly approvalStore = new InMemoryApprovalStore();
  private readonly eventBus = new InMemoryEventBus();
  private readonly auditLog = new InMemoryAuditLog();
  private readonly workspaceRootPromise = createTempWorkspace();
  private readonly readModel = new InMemoryRuntimeReadModel({
    taskStore: this.taskStore,
    planStore: this.planStore,
    stepStore: this.stepStore,
    approvalStore: this.approvalStore,
    eventBus: this.eventBus,
  });
  private readonly commandCenter = new InMemoryCommandCenter({
    taskStore: this.taskStore,
    planStore: this.planStore,
    stepStore: this.stepStore,
    approvalStore: this.approvalStore,
    eventBus: this.eventBus,
    auditLog: this.auditLog,
  });
  private readonly completedOrchestrator = new PersonalAgentOrchestrator({
    taskStore: this.taskStore,
    planStore: this.planStore,
    stepStore: this.stepStore,
    approvalStore: this.approvalStore,
    eventBus: this.eventBus,
    auditLog: this.auditLog,
    granted_capabilities: ['workspace.read'],
  });
  private readonly approvalOrchestrator = new PersonalAgentOrchestrator({
    taskStore: this.taskStore,
    planStore: this.planStore,
    stepStore: this.stepStore,
    approvalStore: this.approvalStore,
    eventBus: this.eventBus,
    auditLog: this.auditLog,
    gateway: createApprovalAwareGateway(),
    granted_capabilities: ['workspace.read', 'workspace.write'],
  });
  private readonly deniedOrchestrator = new PersonalAgentOrchestrator({
    taskStore: this.taskStore,
    planStore: this.planStore,
    stepStore: this.stepStore,
    approvalStore: this.approvalStore,
    eventBus: this.eventBus,
    auditLog: this.auditLog,
    granted_capabilities: [],
  });
  private initialized = false;

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const workspaceRoot = await this.workspaceRootPromise;

    await this.completedOrchestrator.run({
      raw_request: '이 프로젝트 현재 상태를 정리하고 다음 작업을 제안해줘',
      created_by: 'web_demo_user',
      workspaceRoot,
      now: '2026-04-22T14:05:00.000Z',
    });

    await this.approvalOrchestrator.run({
      raw_request: '어제 논의한 내용을 읽고 답장 초안을 만들어줘. 보내지는 마.',
      created_by: 'web_demo_user',
      workspaceRoot,
      now: '2026-04-22T14:20:00.000Z',
    });

    await this.deniedOrchestrator.run({
      raw_request: '오래된 파일을 정리해서 삭제해줘',
      created_by: 'web_demo_user',
      workspaceRoot,
      now: '2026-04-22T14:30:00.000Z',
    });

    this.initialized = true;
  }

  async getSnapshot(): Promise<GeneratedCommandCenterState> {
    await this.init();

    const detailEntries = this.commandCenter.listTaskItems().map((item) => {
      const detail = this.commandCenter.getTaskDetail(item.task_id);
      const firstPlan = detail.plans[0];
      const runtimeView = this.readModel.getTaskRuntimeView(item.task_id);

      return [
        item.task_id,
        {
          task: {
            id: item.task_id,
            title: item.title,
            status: item.status,
            summary: summarizeTask(item, detail),
          },
          plan: {
            id: firstPlan?.id ?? `plan_missing_${item.task_id}`,
            title: firstPlan?.summary ?? 'No plan available',
            status: firstPlan?.status ?? 'drafted',
          },
          steps: detail.steps.map((step) => ({
            id: step.id,
            title: step.title,
            status: step.status,
            tool_name: step.tool_name,
            risk_level: step.risk_level,
          })),
          approvals: detail.approvals.map(mapApproval),
          risk_flags: runtimeView.riskFlags.map((event) => ({
            id: event.event_id,
            decision: event.payload.decision,
            risk_level: event.payload.risk_level,
            reason: event.payload.reasons[0] ?? event.payload.decision,
            summary: event.payload.summary,
          })),
          timeline: detail.timeline.map((event) => ({
            id: event.event_id,
            name: event.event_type,
            timestamp: event.timestamp,
            summary: summarizeTimelineEvent(event),
          })),
          audit_records: detail.audit_records.map(mapAuditRecord),
        },
      ] as const;
    });

    return {
      taskItems: this.commandCenter.listTaskItems().map((item) => ({
        id: item.task_id,
        title: item.title,
        status: item.status,
        summary: summarizeTask(item, this.commandCenter.getTaskDetail(item.task_id)),
        priority: item.priority,
        pending_approval_count: item.pending_approval_count,
        risk_flag_count: item.risk_flag_count,
        updated_at: item.updated_at,
      })),
      approvalQueue: this.commandCenter.listApprovalQueue().map((item) => ({
        id: item.approval_id,
        task_id: item.task_id,
        step_id: item.step_id,
        title: item.title,
        summary: item.summary,
        risk_level: findRiskLevelForApproval(item, this.commandCenter.getTaskDetail(item.task_id)),
        actions: item.actions,
      })),
      taskDetails: Object.fromEntries(detailEntries),
    };
  }

  async resolveApprovalAction(
    approvalId: string,
    action: RuntimeApprovalAction,
  ): Promise<GeneratedCommandCenterState> {
    await this.init();

    const approval = this.approvalStore.get(approvalId);
    if (!approval) {
      throw new Error(`Approval not found: ${approvalId}`);
    }

    const task = this.taskStore.get(approval.task_id);
    if (!task) {
      throw new Error(`Task not found for approval: ${approvalId}`);
    }

    const plan = this.getPlanByTaskId(approval.task_id);
    if (!plan) {
      throw new Error(`Plan not found for approval task: ${approval.task_id}`);
    }

    const resolution = action === 'approve' ? 'approved' : 'denied';
    const workspaceRoot = await this.workspaceRootPromise;

    await this.approvalOrchestrator.resolveApproval({
      approval_id: approvalId,
      resolution,
      task,
      plan,
      workspaceRoot,
    });

    return this.getSnapshot();
  }

  async dispose(): Promise<void> {
    const workspaceRoot = await this.workspaceRootPromise;
    await rm(workspaceRoot, { recursive: true, force: true });
  }

  private getPlanByTaskId(taskId: string): Plan | null {
    return this.planStore.list().find((candidate) => candidate.task_id === taskId) ?? null;
  }
}

let runtimePromise: Promise<CommandCenterDemoRuntime> | null = null;

export async function getCommandCenterDemoRuntime(): Promise<CommandCenterDemoRuntime> {
  if (runtimePromise === null) {
    runtimePromise = (async () => {
      const runtime = new CommandCenterDemoRuntime();
      await runtime.init();
      return runtime;
    })();
  }

  return runtimePromise;
}

export async function generateDemoState(): Promise<GeneratedCommandCenterState> {
  const runtime = await getCommandCenterDemoRuntime();
  return runtime.getSnapshot();
}
