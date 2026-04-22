import { useMemo, useState } from 'react';
import {
  approvalQueue,
  taskDetails,
  taskItems,
  type ApprovalQueueItem,
  type AuditRecordView,
  type RiskFlagView,
  type StepView,
  type TaskDetailView,
  type TaskItem,
  type TimelineEventView,
} from './data';
import './styles.css';

type ApprovalActionName = 'approve' | 'deny' | 'request_changes' | 'cancel_task';

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

function createTimelineEvent(name: string, summary: string): TimelineEventView {
  return {
    id: `evt_ui_${crypto.randomUUID()}`,
    name,
    timestamp: new Date().toISOString(),
    summary,
  };
}

function createAuditRecord(action: string, channel: string, summary: string): AuditRecordView {
  return {
    id: `audit_ui_${crypto.randomUUID()}`,
    action,
    channel,
    summary,
    created_at: new Date().toISOString(),
  };
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
}: {
  items: ApprovalQueueItem[];
  selectedTaskId: string;
  onSelect: (taskId: string) => void;
  onAction: (item: ApprovalQueueItem, action: ApprovalActionName) => void;
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
                  const typedAction = action as ApprovalActionName;
                  return (
                    <button
                      key={action}
                      type="button"
                      className={`action-button action-${typedAction}`}
                      onClick={() => onAction(item, typedAction)}
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
    <section className="overview-band" aria-label="Task Overview">
      <div>
        <p className="eyebrow">Selected Task</p>
        <h1>{detail.task.title}</h1>
        <p className="overview-copy">{detail.task.summary}</p>
      </div>
      <div className="overview-metrics" role="list" aria-label="Task metrics">
        <div className="metric">
          <span>Status</span>
          <strong>{statusLabels[detail.task.status] ?? detail.task.status}</strong>
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
  const [taskItemsState, setTaskItemsState] = useState(() => sortTaskItems(taskItems));
  const [approvalQueueState, setApprovalQueueState] = useState(() => [...approvalQueue]);
  const [taskDetailsState, setTaskDetailsState] = useState(() => ({ ...taskDetails }));
  const [selectedTaskId, setSelectedTaskId] = useState(() => taskItems[0]?.id ?? '');

  const selectedDetail = useMemo(() => {
    if (selectedTaskId && taskDetailsState[selectedTaskId]) {
      return taskDetailsState[selectedTaskId];
    }

    const fallbackTaskId = taskItemsState[0]?.id;
    return fallbackTaskId ? taskDetailsState[fallbackTaskId] : undefined;
  }, [selectedTaskId, taskDetailsState, taskItemsState]);

  const handleApprovalAction = (item: ApprovalQueueItem, action: ApprovalActionName) => {
    setSelectedTaskId(item.task_id);

    setTaskDetailsState((currentDetails) => {
      const detail = currentDetails[item.task_id];
      if (!detail) {
        return currentDetails;
      }

      const existingApproval = detail.approvals.find((approval) => approval.id === item.id);
      if (!existingApproval) {
        return currentDetails;
      }

      let nextDetail: TaskDetailView = detail;
      let nextTaskStatus = detail.task.status;
      let nextPlanStatus = detail.plan.status;
      let nextTaskSummary = detail.task.summary;
      let shouldRemoveApproval = false;

      if (action === 'approve') {
        nextTaskStatus = 'completed';
        nextPlanStatus = 'completed';
        nextTaskSummary = 'Approval granted and the blocked runtime step was resumed in the demo state.';
        shouldRemoveApproval = true;
        nextDetail = {
          ...detail,
          task: { ...detail.task, status: nextTaskStatus, summary: nextTaskSummary },
          plan: { ...detail.plan, status: nextPlanStatus },
          steps: detail.steps.map((step) =>
            step.id === item.step_id ? { ...step, status: 'completed' } : step,
          ),
          approvals: detail.approvals.map((approval) =>
            approval.id === item.id
              ? { ...approval, status: 'approved', summary: `${approval.summary} 승인됨` }
              : approval,
          ),
          timeline: [
            createTimelineEvent('step.approved', `${item.summary} 승인됨`),
            createTimelineEvent('action.succeeded', 'Approved step resumed successfully in the demo runtime'),
            createTimelineEvent('plan.updated', 'plan status changed to completed'),
            createTimelineEvent('task.updated', 'task status changed to completed'),
            ...detail.timeline,
          ],
          audit_records: [
            createAuditRecord('step.approved', 'command-center', `${item.summary} 승인됨`),
            createAuditRecord('action.succeeded', 'command-center', 'Approved step resumed successfully in the demo runtime'),
            createAuditRecord('task.updated', 'command-center', 'Task moved to completed after approval'),
            ...detail.audit_records,
          ],
        };
      } else if (action === 'deny') {
        nextTaskStatus = 'failed';
        nextPlanStatus = 'failed';
        nextTaskSummary = 'Approval denied and the blocked runtime step stayed blocked.';
        shouldRemoveApproval = true;
        nextDetail = {
          ...detail,
          task: { ...detail.task, status: nextTaskStatus, summary: nextTaskSummary },
          plan: { ...detail.plan, status: nextPlanStatus },
          steps: detail.steps.map((step) =>
            step.id === item.step_id ? { ...step, status: 'blocked' } : step,
          ),
          approvals: detail.approvals.map((approval) =>
            approval.id === item.id
              ? { ...approval, status: 'denied', summary: `${approval.summary} 거절됨` }
              : approval,
          ),
          timeline: [
            createTimelineEvent('step.denied', `${item.summary} 거절됨`),
            createTimelineEvent('plan.updated', 'plan status changed to failed'),
            createTimelineEvent('task.updated', 'task status changed to failed'),
            ...detail.timeline,
          ],
          audit_records: [
            createAuditRecord('step.denied', 'command-center', `${item.summary} 거절됨`),
            createAuditRecord('task.updated', 'command-center', 'Task moved to failed after denial'),
            ...detail.audit_records,
          ],
        };
      } else if (action === 'request_changes') {
        nextTaskSummary = 'Reviewer asked for changes before deciding on this approval.';
        nextDetail = {
          ...detail,
          task: { ...detail.task, summary: nextTaskSummary },
          approvals: detail.approvals.map((approval) =>
            approval.id === item.id
              ? { ...approval, summary: `${approval.summary} 변경 요청됨` }
              : approval,
          ),
          timeline: [
            createTimelineEvent('step.approval_requested', 'Changes requested before approval decision'),
            ...detail.timeline,
          ],
          audit_records: [
            createAuditRecord('step.approval_requested', 'command-center', 'Changes requested before approval decision'),
            ...detail.audit_records,
          ],
        };
      } else if (action === 'cancel_task') {
        nextTaskStatus = 'canceled';
        nextPlanStatus = 'canceled';
        nextTaskSummary = 'Task canceled from the approval queue before any risky action resumed.';
        shouldRemoveApproval = true;
        nextDetail = {
          ...detail,
          task: { ...detail.task, status: nextTaskStatus, summary: nextTaskSummary },
          plan: { ...detail.plan, status: nextPlanStatus },
          steps: detail.steps.map((step) =>
            step.id === item.step_id ? { ...step, status: 'skipped' } : step,
          ),
          approvals: detail.approvals.map((approval) =>
            approval.id === item.id
              ? { ...approval, status: 'denied', summary: 'Task canceled from approval queue' }
              : approval,
          ),
          timeline: [
            createTimelineEvent('task.updated', 'task status changed to canceled'),
            createTimelineEvent('plan.updated', 'plan status changed to canceled'),
            ...detail.timeline,
          ],
          audit_records: [
            createAuditRecord('task.updated', 'command-center', 'Task canceled from approval queue'),
            ...detail.audit_records,
          ],
        };
      }

      const nextPendingApprovalCount = shouldRemoveApproval
        ? Math.max(0, detail.approvals.filter((approval) => approval.status === 'requested').length - 1)
        : nextDetail.approvals.filter((approval) => approval.status === 'requested').length;

      setTaskItemsState((currentItems) =>
        sortTaskItems(
          currentItems.map((task) =>
            task.id === item.task_id
              ? {
                  ...task,
                  status: nextTaskStatus,
                  summary: nextTaskSummary,
                  pending_approval_count: nextPendingApprovalCount,
                  updated_at: new Date().toISOString(),
                }
              : task,
          ),
        ),
      );

      if (shouldRemoveApproval) {
        setApprovalQueueState((currentQueue) => currentQueue.filter((entry) => entry.id !== item.id));
      } else if (action === 'request_changes') {
        setApprovalQueueState((currentQueue) =>
          currentQueue.map((entry) =>
            entry.id === item.id
              ? { ...entry, summary: 'Changes requested before approval decision' }
              : entry,
          ),
        );
      }

      return {
        ...currentDetails,
        [item.task_id]: nextDetail,
      };
    });
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
        <Overview detail={selectedDetail} />

        <div className="layout-grid">
          <div className="sidebar-column">
            <TaskList items={taskItemsState} selectedTaskId={selectedTaskId} onSelect={setSelectedTaskId} />
            <ApprovalQueueList
              items={approvalQueueState}
              selectedTaskId={selectedTaskId}
              onSelect={setSelectedTaskId}
              onAction={handleApprovalAction}
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
