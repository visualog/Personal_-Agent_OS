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
};

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

function ApprovalQueueList({ items }: { items: ApprovalQueueItem[] }) {
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
        {items.map((item) => (
          <article key={item.id} className="approval-item">
            <div className="approval-header">
              <strong>{item.title}</strong>
              <span className={`risk-pill risk-${item.risk_level}`}>
                {item.risk_level.toUpperCase()}
              </span>
            </div>
            <p>{item.summary}</p>
            <div className="approval-actions" aria-label="Approval actions">
              {item.actions.map((action) => (
                <span key={action} className="action-tag">
                  {action.replace('_', ' ')}
                </span>
              ))}
            </div>
          </article>
        ))}
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
  const [selectedTaskId, setSelectedTaskId] = useState('task_b');

  const selectedDetail = useMemo(() => {
    return taskDetails[selectedTaskId] ?? taskDetails.task_a;
  }, [selectedTaskId]);

  return (
    <div className="app-shell">
      <main className="dashboard">
        <Overview detail={selectedDetail} />

        <div className="layout-grid">
          <div className="sidebar-column">
            <TaskList items={taskItems} selectedTaskId={selectedTaskId} onSelect={setSelectedTaskId} />
            <ApprovalQueueList items={approvalQueue} />
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
