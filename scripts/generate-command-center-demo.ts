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
} from '../packages/core/src/index.js';

type GeneratedTaskItem = {
  id: string;
  title: string;
  status: string;
  summary: string;
  priority: string;
  pending_approval_count: number;
  risk_flag_count: number;
  updated_at: string;
};

type GeneratedApprovalQueueItem = {
  id: string;
  task_id: string;
  step_id: string;
  title: string;
  summary: string;
  risk_level: string;
  actions: readonly string[];
};

type GeneratedTaskDetail = {
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

function summarizeTask(
  item: CommandCenterTaskListItem,
  detail: CommandCenterTaskDetail,
): string {
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

async function generateDemoState(): Promise<{
  taskItems: GeneratedTaskItem[];
  approvalQueue: GeneratedApprovalQueueItem[];
  taskDetails: Record<string, GeneratedTaskDetail>;
}> {
  const workspaceRoot = await createTempWorkspace();

  try {
    const taskStore = new InMemoryTaskStore();
    const planStore = new InMemoryPlanStore();
    const stepStore = new InMemoryStepStore();
    const approvalStore = new InMemoryApprovalStore();
    const eventBus = new InMemoryEventBus();
    const auditLog = new InMemoryAuditLog();

    const completedOrchestrator = new PersonalAgentOrchestrator({
      taskStore,
      planStore,
      stepStore,
      approvalStore,
      eventBus,
      auditLog,
      granted_capabilities: ['workspace.read'],
    });

    const approvalOrchestrator = new PersonalAgentOrchestrator({
      taskStore,
      planStore,
      stepStore,
      approvalStore,
      eventBus,
      auditLog,
      gateway: createApprovalAwareGateway(),
      granted_capabilities: ['workspace.read', 'workspace.write'],
    });

    const deniedOrchestrator = new PersonalAgentOrchestrator({
      taskStore,
      planStore,
      stepStore,
      approvalStore,
      eventBus,
      auditLog,
      granted_capabilities: [],
    });

    await completedOrchestrator.run({
      raw_request: '이 프로젝트 현재 상태를 정리하고 다음 작업을 제안해줘',
      created_by: 'web_demo_user',
      workspaceRoot,
      now: '2026-04-22T14:05:00.000Z',
    });

    await approvalOrchestrator.run({
      raw_request: '어제 논의한 내용을 읽고 답장 초안을 만들어줘. 보내지는 마.',
      created_by: 'web_demo_user',
      workspaceRoot,
      now: '2026-04-22T14:20:00.000Z',
    });

    await deniedOrchestrator.run({
      raw_request: '오래된 파일을 정리해서 삭제해줘',
      created_by: 'web_demo_user',
      workspaceRoot,
      now: '2026-04-22T14:30:00.000Z',
    });

    const commandCenter = new InMemoryCommandCenter({
      taskStore,
      planStore,
      stepStore,
      approvalStore,
      eventBus,
      auditLog,
    });
    const readModel = new InMemoryRuntimeReadModel({
      taskStore,
      planStore,
      stepStore,
      approvalStore,
      eventBus,
    });

    const detailEntries = commandCenter.listTaskItems().map((item) => {
      const detail = commandCenter.getTaskDetail(item.task_id);
      const task = detail.task;
      const firstPlan = detail.plans[0];
      const runtimeView = readModel.getTaskRuntimeView(item.task_id);

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

    const detailMap = Object.fromEntries(detailEntries);
    const taskItems = commandCenter.listTaskItems().map((item) => ({
      id: item.task_id,
      title: item.title,
      status: item.status,
      summary: summarizeTask(item, commandCenter.getTaskDetail(item.task_id)),
      priority: item.priority,
      pending_approval_count: item.pending_approval_count,
      risk_flag_count: item.risk_flag_count,
      updated_at: item.updated_at,
    }));

    const approvalQueue = commandCenter.listApprovalQueue().map((item) => ({
      id: item.approval_id,
      task_id: item.task_id,
      step_id: item.step_id,
      title: item.title,
      summary: item.summary,
      risk_level: findRiskLevelForApproval(item, commandCenter.getTaskDetail(item.task_id)),
      actions: item.actions,
    }));

    return {
      taskItems,
      approvalQueue,
      taskDetails: detailMap,
    };
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const outputPath = path.join(
    process.cwd(),
    'apps',
    'web',
    'src',
    'generated',
    'demo-state.ts',
  );
  const state = await generateDemoState();
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `export const generatedCommandCenterData = ${JSON.stringify(state, null, 2)} as const;\n`,
    'utf8',
  );
}

await main();
