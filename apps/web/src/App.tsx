import { useEffect, useMemo, useState } from 'react';
import {
  fallbackCommandCenterState,
  fetchCommandCenterState,
  resolveApprovalAction,
  type ApprovalQueueItem,
  type AuditRecordView,
  type CommandCenterState,
  type RiskFlagView,
  type RuntimeApprovalAction,
  type StepView,
  type TaskDetailView,
  type TaskItem,
  type TimelineEventView,
} from './data';
import './styles.css';

type DetailSectionProps = {
  title: string;
  children: React.ReactNode;
};

const statusLabels: Record<string, string> = {
  completed: 'Completed',
  waiting_approval: 'Waiting Approval',
  failed: 'Failed',
  blocked: 'Blocked',
  running: 'Running',
  partially_approved: 'Partially Approved',
  canceled: 'Canceled',
  approved: 'Approved',
  denied: 'Denied',
  requested: 'Requested',
};

function formatActionLabel(action: string): string {
  return action.replace('_', ' ');
}

function sortTaskItems(items: TaskItem[]): TaskItem[] {
  return [...items].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
}

function DetailSection({ title, children }: DetailSectionProps) {
  return (
    <section className="detail-section" aria-label={title}>
      <div className="section-heading">
        <h3>{title}</h3>
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}

function TaskList({
  items,
  selectedTaskId,
  onSelect,
}: {
  items: TaskItem[];
  selectedTaskId: string;
  onSelect: (taskId: string) => void;
}) {
  return (
    <section className="panel task-list-panel" aria-label="Tasks">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Tasks</p>
          <h2>Command Center</h2>
        </div>
        <span className="summary-chip">{items.length} active views</span>
      </div>
      <div className="task-list" role="list">
        {items.map((item) => {
          const isSelected = item.id === selectedTaskId;
          return (
            <button
              key={item.id}
              className={`task-row${isSelected ? ' selected' : ''}`}
              type="button"
              data-testid={`task-row-${item.id}`}
              onClick={() => onSelect(item.id)}
            >
              <div className="task-row-top">
                <strong>{item.title}</strong>
                <span className={`status-pill status-${item.status}`}>
                  {statusLabels[item.status] ?? item.status}
                </span>
              </div>
              <p>{item.summary}</p>
              <div className="task-row-meta">
                <span>{item.priority.toUpperCase()}</span>
                <span>{item.pending_approval_count} pending approvals</span>
                <span>{item.risk_flag_count} risk flags</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ApprovalQueueList({
  items,
  selectedTaskId,
  onSelect,
  onAction,
  busyApprovalId,
}: {
  items: ApprovalQueueItem[];
  selectedTaskId: string;
  onSelect: (taskId: string) => void;
  onAction: (item: ApprovalQueueItem, action: RuntimeApprovalAction) => void;
  busyApprovalId: string | null;
}) {
  return (
    <section className="panel approval-panel" aria-label="Approval Queue">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Approvals</p>
          <h2>Approval Queue</h2>
        </div>
        <span className="summary-chip attention">{items.length} waiting</span>
      </div>
      <div className="approval-list" role="list">
        {items.length === 0 ? (
          <p className="empty-state">No pending approvals in the current runtime snapshot.</p>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className={`approval-item${selectedTaskId === item.task_id ? ' selected' : ''}`}
              data-testid={`approval-item-${item.id}`}
            >
              <button
                type="button"
                className="approval-select"
                onClick={() => onSelect(item.task_id)}
              >
                <div className="approval-header">
                  <strong>{item.title}</strong>
                  <span className={`risk-pill risk-${item.risk_level}`}>
                    {item.risk_level.toUpperCase()}
                  </span>
                </div>
                <p>{item.summary}</p>
              </button>
              <div className="approval-actions" aria-label="Approval actions">
                {item.actions.map((action) => {
                  const typedAction = action as RuntimeApprovalAction;
                  return (
                    <button
                      key={action}
                      type="button"
                      className={`action-button action-${typedAction}`}
                      data-testid={`approval-action-${typedAction}-${item.id}`}
                      data-action={typedAction}
                      onClick={() => onAction(item, typedAction)}
                      disabled={busyApprovalId === item.id}
                    >
                      {formatActionLabel(action)}
                    </button>
                  );
                })}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function StepsTable({ steps }: { steps: StepView[] }) {
  return (
    <div className="data-list" role="list">
      {steps.map((step) => (
        <article key={step.id} className="data-row">
          <div className="data-row-main">
            <strong>{step.title}</strong>
            <p>{step.tool_name}</p>
          </div>
          <div className="data-row-side">
            <span className={`status-pill status-${step.status}`}>
              {statusLabels[step.status] ?? step.status}
            </span>
            <span className="meta-chip">{step.risk_level}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function RiskFlagList({ risks }: { risks: RiskFlagView[] }) {
  if (risks.length === 0) {
    return <p className="empty-state">No risk telemetry recorded for this task.</p>;
  }

  return (
    <div className="data-list" role="list">
      {risks.map((risk) => (
        <article key={risk.id} className="data-row">
          <div className="data-row-main">
            <strong>{risk.reason}</strong>
            <p>{risk.summary}</p>
          </div>
          <div className="data-row-side">
            <span className={`risk-pill risk-${risk.risk_level}`}>
              {risk.risk_level.toUpperCase()}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

function TimelineList({ events }: { events: TimelineEventView[] }) {
  return (
    <ol className="timeline-list">
      {events.map((event) => (
        <li key={event.id} className="timeline-item">
          <div className="timeline-marker" />
          <div className="timeline-content">
            <div className="timeline-top">
              <strong>{event.name}</strong>
              <span>{event.timestamp}</span>
            </div>
            <p>{event.summary}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function AuditList({ records }: { records: AuditRecordView[] }) {
  return (
    <div className="data-list" role="list">
      {records.map((record) => (
        <article key={record.id} className="data-row">
          <div className="data-row-main">
            <strong>{record.action}</strong>
            <p>{record.summary}</p>
          </div>
          <div className="data-row-side">
            <span className="meta-chip">{record.channel}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function ApprovalList({
  approvals,
}: {
  approvals: TaskDetailView['approvals'];
}) {
  if (approvals.length === 0) {
    return <p className="empty-state">No approval history recorded for this task.</p>;
  }

  return (
    <div className="data-list" role="list">
      {approvals.map((approval) => (
        <article key={approval.id} className="data-row">
          <div className="data-row-main">
            <strong>{approval.summary}</strong>
            <p>{approval.id}</p>
          </div>
          <div className="data-row-side">
            <span className={`status-pill status-${approval.status}`}>
              {statusLabels[approval.status] ?? approval.status}
            </span>
          </div>
        </article>
      ))}
    </div>
  );
}

function Overview({ detail }: { detail: TaskDetailView }) {
  return (
    <section className="overview-band" aria-label="Task Overview" data-testid="task-overview">
      <div>
        <p className="eyebrow">Selected Task</p>
        <h1 data-testid="selected-task-title">{detail.task.title}</h1>
        <p className="overview-copy" data-testid="selected-task-summary">{detail.task.summary}</p>
      </div>
      <div className="overview-metrics" role="list" aria-label="Task metrics">
        <div className="metric">
          <span>Status</span>
          <strong data-testid="selected-task-status">
            {statusLabels[detail.task.status] ?? detail.task.status}
          </strong>
        </div>
        <div className="metric">
          <span>Approvals</span>
          <strong>{detail.approvals.length}</strong>
        </div>
        <div className="metric">
          <span>Risk Flags</span>
          <strong>{detail.risk_flags.length}</strong>
        </div>
        <div className="metric">
          <span>Events</span>
          <strong>{detail.timeline.length}</strong>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [commandCenterState, setCommandCenterState] = useState<CommandCenterState>({
    taskItems: sortTaskItems(fallbackCommandCenterState.taskItems),
    approvalQueue: [...fallbackCommandCenterState.approvalQueue],
    taskDetails: { ...fallbackCommandCenterState.taskDetails },
  });
  const [selectedTaskId, setSelectedTaskId] = useState(() => fallbackCommandCenterState.taskItems[0]?.id ?? '');
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<'api' | 'snapshot'>('snapshot');
  const [bannerMessage, setBannerMessage] = useState('Live API not connected yet. Showing generated runtime snapshot.');

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const state = await fetchCommandCenterState();
        if (!active) {
          return;
        }

        setCommandCenterState({
          taskItems: sortTaskItems(state.taskItems),
          approvalQueue: state.approvalQueue,
          taskDetails: state.taskDetails,
        });
        setSelectedTaskId((current) => current || state.taskItems[0]?.id || '');
        setRuntimeMode('api');
        setBannerMessage('Live dev runtime connected. Approval actions now use the orchestrator flow.');
      } catch {
        if (!active) {
          return;
        }

        setRuntimeMode('snapshot');
        setBannerMessage('API unavailable, so the screen is using the generated runtime snapshot.');
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  const selectedDetail = useMemo(() => {
    if (selectedTaskId && commandCenterState.taskDetails[selectedTaskId]) {
      return commandCenterState.taskDetails[selectedTaskId];
    }

    const fallbackTaskId = commandCenterState.taskItems[0]?.id;
    return fallbackTaskId ? commandCenterState.taskDetails[fallbackTaskId] : undefined;
  }, [selectedTaskId, commandCenterState]);

  const handleApprovalAction = async (item: ApprovalQueueItem, action: RuntimeApprovalAction) => {
    setSelectedTaskId(item.task_id);
    setBusyApprovalId(item.id);

    try {
      const nextState = await resolveApprovalAction(item.id, action);
      setCommandCenterState({
        taskItems: sortTaskItems(nextState.taskItems),
        approvalQueue: nextState.approvalQueue,
        taskDetails: nextState.taskDetails,
      });
      setRuntimeMode('api');
      setBannerMessage(
        action === 'approve'
          ? 'Approval resolved through the orchestrator. The blocked step resumed successfully.'
          : action === 'deny'
            ? 'Approval resolved through the orchestrator. The blocked step stayed closed.'
            : action === 'cancel_task'
              ? 'Task canceled through the orchestrator. Pending approval expired and remaining steps were skipped.'
              : 'Change request recorded. The approval is still pending until the task is revised and reviewed again.',
      );
    } catch (error) {
      setBannerMessage(
        error instanceof Error
          ? `Approval action failed: ${error.message}`
          : 'Approval action failed.',
      );
    } finally {
      setBusyApprovalId(null);
    }
  };

  if (!selectedDetail) {
    return (
      <div className="app-shell">
        <main className="dashboard">
          <section className="overview-band" aria-label="Task Overview">
            <div>
              <p className="eyebrow">Selected Task</p>
              <h1>No tasks available</h1>
              <p className="overview-copy">Run the command center demo generator to populate runtime state.</p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
      <div className="app-shell">
      <main className="dashboard">
        <section className="panel runtime-banner" aria-label="Runtime mode" data-testid="runtime-banner">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Runtime</p>
              <h2>{runtimeMode === 'api' ? 'Live Dev Runtime' : 'Generated Snapshot'}</h2>
            </div>
            <span className={`summary-chip ${runtimeMode === 'api' ? '' : 'attention'}`}>
              {runtimeMode === 'api' ? 'Connected' : 'Fallback'}
            </span>
          </div>
          <div className="section-body">
            <p className="overview-copy" data-testid="runtime-banner-message">{bannerMessage}</p>
          </div>
        </section>

        <Overview detail={selectedDetail} />

        <div className="layout-grid">
          <div className="sidebar-column">
            <TaskList
              items={commandCenterState.taskItems}
              selectedTaskId={selectedTaskId}
              onSelect={setSelectedTaskId}
            />
            <ApprovalQueueList
              items={commandCenterState.approvalQueue}
              selectedTaskId={selectedTaskId}
              onSelect={setSelectedTaskId}
              onAction={handleApprovalAction}
              busyApprovalId={busyApprovalId}
            />
          </div>

          <div className="content-column">
            <DetailSection title="Plan and Steps">
              <div className="plan-summary">
                <div className="plan-chip">
                  <span>Plan</span>
                  <strong>{selectedDetail.plan.title}</strong>
                </div>
                <div className="plan-chip">
                  <span>State</span>
                  <strong>{statusLabels[selectedDetail.plan.status] ?? selectedDetail.plan.status}</strong>
                </div>
              </div>
              <StepsTable steps={selectedDetail.steps} />
            </DetailSection>

            <DetailSection title="Approvals">
              <ApprovalList approvals={selectedDetail.approvals} />
            </DetailSection>

            <DetailSection title="Risk Flags">
              <RiskFlagList risks={selectedDetail.risk_flags} />
            </DetailSection>

            <DetailSection title="Timeline">
              <TimelineList events={selectedDetail.timeline} />
            </DetailSection>

            <DetailSection title="Audit Records">
              <AuditList records={selectedDetail.audit_records} />
            </DetailSection>
          </div>
        </div>
      </main>
    </div>
  );
}
