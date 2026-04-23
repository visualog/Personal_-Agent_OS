import { access, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
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
  parseRemoteCommand,
  validateRemoteCommand,
  evaluatePolicy,
  type Approval,
  type AuditRecord,
  type CommandCenterApprovalCard,
  type CommandCenterTaskDetail,
  type CommandCenterTaskListItem,
  type Event,
  type OrchestratorToolGateway,
  type Plan,
  type RemoteCommandEnvelope,
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

export type RuntimeApprovalAction = 'approve' | 'deny' | 'request_changes' | 'cancel_task';

export interface RemoteCommandReceipt {
  readonly command: RemoteCommandEnvelope;
  readonly status: 'accepted' | 'rejected';
  readonly reasons: readonly string[];
  readonly task_id?: string;
  readonly approval_id?: string;
  readonly summary: string;
}

type ApprovalChangeRequest = {
  approval_id: string;
  task_id: string;
  summary: string;
  requested_at: string;
};

function translatePolicyDecision(decision: string): string {
  switch (decision) {
    case 'allow':
      return '허용';
    case 'deny':
      return '거부';
    case 'require_approval':
      return '승인 필요';
    default:
      return decision;
  }
}

function translateRuntimeSummary(summary: string): string {
  return summary
    .replaceAll('action completed successfully', '작업이 성공적으로 완료되었습니다')
    .replaceAll('policy evaluated: allow', '정책 평가: 허용')
    .replaceAll('policy evaluated: deny', '정책 평가: 거부')
    .replaceAll('policy evaluated: require_approval', '정책 평가: 승인 필요')
    .replaceAll('risk flagged: deny', '위험 신호: 거부')
    .replaceAll('risk flagged: require_approval', '위험 신호: 승인 필요')
    .replaceAll('action succeeded:', '작업 성공:')
    .replaceAll('action failed:', '작업 실패:')
    .replaceAll('action started:', '작업 시작:')
    .replaceAll('task created:', '작업 생성:')
    .replaceAll('plan drafted:', '계획 초안 생성:')
    .replaceAll('plan updated:', '계획 상태 변경:')
    .replaceAll('task updated:', '작업 상태 변경:')
    .replaceAll('plan status changed to completed', '계획 상태가 완료로 변경되었습니다')
    .replaceAll('plan status changed to failed', '계획 상태가 실패로 변경되었습니다')
    .replaceAll('plan status changed to partially_approved', '계획 상태가 부분 승인으로 변경되었습니다')
    .replaceAll('plan status changed to canceled', '계획 상태가 취소됨으로 변경되었습니다')
    .replaceAll('task status changed to completed', '작업 상태가 완료로 변경되었습니다')
    .replaceAll('task status changed to failed', '작업 상태가 실패로 변경되었습니다')
    .replaceAll('task status changed to waiting_approval', '작업 상태가 승인 대기로 변경되었습니다')
    .replaceAll('task status changed to canceled', '작업 상태가 취소됨으로 변경되었습니다')
    .replaceAll('step ready:', '단계 준비 완료:')
    .replaceAll('approval requested:', '승인 요청:')
    .replaceAll('workspace.read_file requires approval', 'workspace.read_file 실행에는 승인이 필요합니다')
    .replaceAll('missing capability: workspace.read', '권한 부족: workspace.read')
    .replaceAll('workspace.list_files denied by policy', 'workspace.list_files가 정책에 의해 거부되었습니다')
    .replaceAll('workspace.read_file denied by policy', 'workspace.read_file이 정책에 의해 거부되었습니다')
    .replaceAll('action denied', '작업이 거부되었습니다');
}

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

async function createWorkspaceRoot(preferredRoot?: string): Promise<{ root: string; disposable: boolean }> {
  if (preferredRoot) {
    await access(preferredRoot);
    return { root: preferredRoot, disposable: false };
  }

  const root = await mkdtemp(path.join(os.tmpdir(), 'paos-web-demo-'));
  await mkdir(path.join(root, 'nested'), { recursive: true });
  await writeFile(path.join(root, 'README.md'), '# Personal Agent OS\n', 'utf8');
  await writeFile(path.join(root, 'nested', 'notes.txt'), 'team notes\n', 'utf8');
  return { root, disposable: true };
}

function summarizeTimelineEvent(event: Event): string {
  switch (event.event_type) {
    case 'task.created':
      return `작업 생성: ${event.payload.title}`;
    case 'task.updated':
      return event.payload.summary;
    case 'plan.drafted':
      return `${event.payload.step_count}개의 계획 단계가 생성되었습니다`;
    case 'plan.updated':
      return event.payload.summary;
    case 'step.ready':
      return `${event.payload.tool_name} 준비 완료`;
    case 'step.approval_requested':
      return event.payload.summary;
    case 'step.approved':
    case 'step.denied':
      return event.payload.summary;
    case 'policy.evaluated':
      return `${event.payload.tool_name}: ${translatePolicyDecision(event.payload.decision)}`;
    case 'risk.flagged':
      return translateRuntimeSummary(event.payload.summary);
    case 'action.started':
      return `${event.payload.tool_name} 실행 시작`;
    case 'action.succeeded':
    case 'action.failed':
      return translateRuntimeSummary(event.payload.summary);
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
    return `${detail.steps.length}개 계획 단계 중 ${item.pending_approval_count}건이 승인 대기 중입니다.`;
  }

  if (item.risk_flag_count > 0) {
    return `이 작업에는 ${item.risk_flag_count}건의 정책 위험 신호가 기록되었습니다.`;
  }

  return detail.plans[0]?.summary ?? '승인 차단 없이 작업이 완료되었습니다.';
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
    summary: translateRuntimeSummary(record.summary),
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

interface CommandCenterRuntimeOptions {
  workspaceRoot?: string;
  seedDemoData?: boolean;
  useDemoApprovalGateway?: boolean;
}

class CommandCenterDemoRuntime {
  private readonly taskStore = new InMemoryTaskStore();
  private readonly planStore = new InMemoryPlanStore();
  private readonly stepStore = new InMemoryStepStore();
  private readonly approvalStore = new InMemoryApprovalStore();
  private readonly eventBus = new InMemoryEventBus();
  private readonly auditLog = new InMemoryAuditLog();
  private readonly workspaceRootPromise: Promise<string>;
  private readonly disposeWorkspaceOnClose: Promise<boolean>;
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
  private readonly approvalOrchestrator: PersonalAgentOrchestrator;
  private readonly deniedOrchestrator = new PersonalAgentOrchestrator({
    taskStore: this.taskStore,
    planStore: this.planStore,
    stepStore: this.stepStore,
    approvalStore: this.approvalStore,
    eventBus: this.eventBus,
    auditLog: this.auditLog,
    granted_capabilities: [],
  });
  private readonly changeRequests = new Map<string, ApprovalChangeRequest[]>();
  private initialized = false;

  constructor(private readonly options: CommandCenterRuntimeOptions = {}) {
    const workspaceRootState = createWorkspaceRoot(options.workspaceRoot);
    this.workspaceRootPromise = workspaceRootState.then((state) => state.root);
    this.disposeWorkspaceOnClose = workspaceRootState.then((state) => state.disposable);
    this.approvalOrchestrator = new PersonalAgentOrchestrator({
      taskStore: this.taskStore,
      planStore: this.planStore,
      stepStore: this.stepStore,
      approvalStore: this.approvalStore,
      eventBus: this.eventBus,
      auditLog: this.auditLog,
      gateway: options.useDemoApprovalGateway === false ? undefined : createApprovalAwareGateway(),
      granted_capabilities: ['workspace.read', 'workspace.write'],
    });
  }

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const workspaceRoot = await this.workspaceRootPromise;

    if (this.options.seedDemoData !== false) {
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
    }

    this.initialized = true;
  }

  async getSnapshot(): Promise<GeneratedCommandCenterState> {
    await this.init();

    const detailEntries = this.commandCenter.listTaskItems().map((item) => {
      const detail = this.commandCenter.getTaskDetail(item.task_id);
      const firstPlan = detail.plans[0];
      const runtimeView = this.readModel.getTaskRuntimeView(item.task_id);
      const changeRequests = this.changeRequests.get(item.task_id) ?? [];

      return [
        item.task_id,
        {
          task: {
            id: item.task_id,
            title: item.title,
            status: item.status,
            summary:
              changeRequests.length > 0
                ? `승인 전에 확인할 수정 요청 메모가 ${changeRequests.length}건 있습니다.`
                : summarizeTask(item, detail),
          },
          plan: {
            id: firstPlan?.id ?? `plan_missing_${item.task_id}`,
            title: firstPlan?.summary ?? '계획 정보가 없습니다',
            status: firstPlan?.status ?? 'drafted',
          },
          steps: detail.steps.map((step) => ({
            id: step.id,
            title: step.title,
            status: step.status,
            tool_name: step.tool_name,
            risk_level: step.risk_level,
          })),
          approvals: detail.approvals.map((approval) => {
            const latestChangeRequest = [...changeRequests]
              .reverse()
              .find((request) => request.approval_id === approval.id);

            if (!latestChangeRequest) {
              return mapApproval(approval);
            }

            return {
              id: approval.id,
              status: approval.status,
              summary: `${approval.summary} | ${latestChangeRequest.summary}`,
            };
          }),
          risk_flags: runtimeView.riskFlags.map((event) => ({
            id: event.event_id,
            decision: event.payload.decision,
            risk_level: event.payload.risk_level,
            reason: event.payload.reasons[0] ?? event.payload.decision,
            summary: event.payload.summary,
          })),
          timeline: [
            ...changeRequests.map((request, index) => ({
              id: `change_request_${request.approval_id}_${index}`,
              name: 'step.changes_requested',
              timestamp: request.requested_at,
              summary: request.summary,
            })),
            ...detail.timeline.map((event) => ({
              id: event.event_id,
              name: event.event_type,
              timestamp: event.timestamp,
              summary: summarizeTimelineEvent(event),
            })),
          ].sort((left, right) => right.timestamp.localeCompare(left.timestamp)),
          audit_records: [
            ...changeRequests.map((request, index) => ({
              id: `audit_change_request_${request.approval_id}_${index}`,
              action: 'step.changes_requested',
              channel: 'command-center',
              summary: request.summary,
              created_at: request.requested_at,
            })),
            ...detail.audit_records.map(mapAuditRecord),
          ].sort((left, right) => right.created_at.localeCompare(left.created_at)),
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
        summary: this.withLatestChangeRequestSummary(item.task_id, item.approval_id, item.summary),
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

    if (action === 'request_changes') {
      this.appendChangeRequest({
        approval_id: approvalId,
        task_id: approval.task_id,
        summary: '승인 전에 수정 요청이 기록되었습니다. 초안 또는 관련 맥락을 보완한 뒤 다시 검토하세요.',
        requested_at: new Date().toISOString(),
      });
    } else if (action === 'cancel_task') {
      this.approvalOrchestrator.cancelTask({
        task,
        plan,
        reason: 'Canceled from command center approval queue',
      });
    } else {
      const resolution = action === 'approve' ? 'approved' : 'denied';
      const workspaceRoot = await this.workspaceRootPromise;

      await this.approvalOrchestrator.resolveApproval({
        approval_id: approvalId,
        resolution,
        task,
        plan,
        workspaceRoot,
      });
    }

    return this.getSnapshot();
  }

  async submitRemoteCommand(input: {
    text: string;
    actor_id: string;
    channel?: 'telegram' | 'web' | 'cli';
  }): Promise<RemoteCommandReceipt> {
    await this.init();

    const workspaceRoot = await this.workspaceRootPromise;
    const command = parseRemoteCommand({
      text: input.text,
      actor_id: input.actor_id,
      channel: input.channel,
      workspace_root: workspaceRoot,
    });
    const validation = validateRemoteCommand(command);

    if (!validation.ok) {
      return {
        command,
        status: 'rejected',
        reasons: validation.reasons,
        summary: `원격 명령이 거부되었습니다: ${validation.reasons.join(', ')}`,
      };
    }

    if (command.intent === 'get_status') {
      const task = this.taskStore.get(command.args.task_id);
      return {
        command,
        status: task ? 'accepted' : 'rejected',
        reasons: task ? [] : ['task_not_found'],
        task_id: task?.id,
        summary: task
          ? `작업 상태 조회: ${task.title} / ${task.status}`
          : '조회할 작업을 찾을 수 없습니다.',
      };
    }

    if (command.intent === 'approve' || command.intent === 'deny') {
      const approval = this.approvalStore.get(command.args.approval_id);
      if (!approval) {
        return {
          command,
          status: 'rejected',
          reasons: ['approval_not_found'],
          summary: '승인 대상을 찾을 수 없습니다.',
        };
      }

      const task = this.taskStore.get(approval.task_id);
      const plan = task ? this.getPlanByTaskId(task.id) : null;

      if (!task || !plan) {
        return {
          command,
          status: 'rejected',
          reasons: ['approval_context_missing'],
          summary: '승인 처리에 필요한 작업 문맥을 찾을 수 없습니다.',
        };
      }

      await this.approvalOrchestrator.resolveApproval({
        approval_id: approval.id,
        resolution: command.intent === 'approve' ? 'approved' : 'denied',
        task,
        plan,
        workspaceRoot,
      });

      return {
        command,
        status: 'accepted',
        reasons: [],
        task_id: task.id,
        approval_id: approval.id,
        summary: command.intent === 'approve' ? '원격 승인 처리 완료' : '원격 거부 처리 완료',
      };
    }

    if (command.intent === 'cancel') {
      const task = this.taskStore.get(command.args.task_id);
      const plan = task ? this.getPlanByTaskId(task.id) : null;

      if (!task || !plan) {
        return {
          command,
          status: 'rejected',
          reasons: ['task_not_found'],
          summary: '취소할 작업을 찾을 수 없습니다.',
        };
      }

      this.approvalOrchestrator.cancelTask({
        task,
        plan,
        reason: '원격 명령으로 작업 취소',
      });

      return {
        command,
        status: 'accepted',
        reasons: [],
        task_id: task.id,
        summary: '원격 작업 취소 처리 완료',
      };
    }

    const taskRequest = command.args.raw_request ?? command.text;
    const isCodingMode = command.args.task_mode === 'coding';
    const orchestrator = isCodingMode
      ? this.approvalOrchestrator
      : this.completedOrchestrator;

    const result = await orchestrator.run({
      raw_request: taskRequest,
      created_by: input.actor_id,
      workspaceRoot,
    });
    const pendingApproval = this.approvalStore.listPending()
      .find((approval) => approval.task_id === result.task.id);

    return {
      command,
      status: 'accepted',
      reasons: [],
      task_id: result.task.id,
      approval_id: pendingApproval?.id,
      summary: pendingApproval
        ? `원격 작업이 생성되었고 승인 대기 중입니다: ${result.task.title}`
        : `원격 작업이 생성되었습니다: ${result.task.title}`,
    };
  }

  async listRemoteTasks(): Promise<GeneratedTaskItem[]> {
    const snapshot = await this.getSnapshot();
    return snapshot.taskItems;
  }

  async getRemoteTask(taskId: string): Promise<GeneratedTaskDetail | null> {
    const snapshot = await this.getSnapshot();
    return snapshot.taskDetails[taskId] ?? null;
  }

  async dispose(): Promise<void> {
    const workspaceRoot = await this.workspaceRootPromise;
    if (await this.disposeWorkspaceOnClose) {
      await rm(workspaceRoot, { recursive: true, force: true });
    }
  }

  private getPlanByTaskId(taskId: string): Plan | null {
    return this.planStore.list().find((candidate) => candidate.task_id === taskId) ?? null;
  }

  private appendChangeRequest(changeRequest: ApprovalChangeRequest): void {
    const requests = this.changeRequests.get(changeRequest.task_id) ?? [];
    requests.push(changeRequest);
    this.changeRequests.set(changeRequest.task_id, requests);
  }

  private withLatestChangeRequestSummary(taskId: string, approvalId: string, summary: string): string {
    const latestChangeRequest = (this.changeRequests.get(taskId) ?? [])
      .slice()
      .reverse()
      .find((request) => request.approval_id === approvalId);

    if (!latestChangeRequest) {
      return summary;
    }

    return `${summary} | ${latestChangeRequest.summary}`;
  }
}

let runtimePromise: Promise<CommandCenterDemoRuntime> | null = null;
let agentRuntimePromise: Promise<CommandCenterDemoRuntime> | null = null;

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

export async function resetCommandCenterDemoRuntime(): Promise<CommandCenterDemoRuntime> {
  if (runtimePromise !== null) {
    const existingRuntime = await runtimePromise;
    await existingRuntime.dispose();
  }

  runtimePromise = null;
  return getCommandCenterDemoRuntime();
}

export async function getAgentDaemonRuntime(): Promise<CommandCenterDemoRuntime> {
  if (agentRuntimePromise === null) {
    agentRuntimePromise = (async () => {
      const runtime = new CommandCenterDemoRuntime({
        workspaceRoot: process.env.PAOS_WORKSPACE_ROOT ?? process.cwd(),
        seedDemoData: false,
        useDemoApprovalGateway: false,
      });
      await runtime.init();
      return runtime;
    })();
  }

  return agentRuntimePromise;
}

export async function generateDemoState(): Promise<GeneratedCommandCenterState> {
  const runtime = await getCommandCenterDemoRuntime();
  return runtime.getSnapshot();
}
