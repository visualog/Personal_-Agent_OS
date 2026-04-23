import { useEffect, useMemo, useState } from 'react';
import {
  fallbackCommandCenterState,
  fetchCommandCenterState,
  resetCommandCenterState,
  resolveApprovalAction,
  submitRemoteCommand,
  type ApprovalQueueItem,
  type AuditRecordView,
  type CommandCenterState,
  type RemoteCommandReceipt,
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
  completed: '완료',
  waiting_approval: '승인 대기',
  failed: '실패',
  blocked: '차단됨',
  running: '실행 중',
  partially_approved: '부분 승인',
  canceled: '취소됨',
  skipped: '건너뜀',
  approved: '승인됨',
  denied: '거부됨',
  requested: '요청됨',
};

const riskLevelLabels: Record<string, string> = {
  low: '낮음',
  medium: '보통',
  high: '높음',
  critical: '치명적',
};

const eventLabels: Record<string, string> = {
  'task.created': '작업 생성',
  'task.updated': '작업 상태 변경',
  'plan.drafted': '계획 초안 생성',
  'plan.updated': '계획 상태 변경',
  'step.ready': '단계 준비 완료',
  'step.approval_requested': '승인 요청',
  'step.approved': '승인 완료',
  'step.denied': '승인 거부',
  'step.changes_requested': '수정 요청',
  'policy.evaluated': '정책 평가',
  'risk.flagged': '위험 신호',
  'action.started': '작업 실행 시작',
  'action.succeeded': '작업 실행 성공',
  'action.failed': '작업 실행 실패',
};

const priorityLabels: Record<string, string> = {
  low: '낮음',
  normal: '보통',
  high: '높음',
  urgent: '긴급',
};

const channelLabels: Record<string, string> = {
  audit: '감사',
  'command-center': '명령 센터',
};

function formatActionLabel(action: string): string {
  const labels: Record<string, string> = {
    approve: '승인',
    deny: '거부',
    request_changes: '수정 요청',
    cancel_task: '작업 취소',
  };

  return labels[action] ?? action.replace('_', ' ');
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
    <section className="panel task-list-panel" aria-label="작업 목록">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">작업</p>
          <h2>명령 센터</h2>
        </div>
        <span className="summary-chip">{items.length}개 작업 보기</span>
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
                <span>{priorityLabels[item.priority] ?? item.priority}</span>
                <span>승인 대기 {item.pending_approval_count}건</span>
                <span>위험 신호 {item.risk_flag_count}건</span>
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
    <section className="panel approval-panel" aria-label="승인 대기열">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">승인</p>
          <h2>승인 대기열</h2>
        </div>
        <span className="summary-chip attention">{items.length}건 대기 중</span>
      </div>
      <div className="approval-list" role="list">
        {items.length === 0 ? (
          <p className="empty-state">현재 런타임 스냅샷에는 승인 대기 항목이 없습니다.</p>
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
                    {riskLevelLabels[item.risk_level] ?? item.risk_level}
                  </span>
                </div>
                <p>{item.summary}</p>
              </button>
              <div className="approval-actions" aria-label="승인 작업">
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
            <span className="meta-chip">{riskLevelLabels[step.risk_level] ?? step.risk_level}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function RiskFlagList({ risks }: { risks: RiskFlagView[] }) {
  if (risks.length === 0) {
    return <p className="empty-state">이 작업에는 기록된 위험 신호가 없습니다.</p>;
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
              {riskLevelLabels[risk.risk_level] ?? risk.risk_level}
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
              <strong>{eventLabels[event.name] ?? event.name}</strong>
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
            <strong>{eventLabels[record.action] ?? record.action}</strong>
            <p>{record.summary}</p>
          </div>
          <div className="data-row-side">
            <span className="meta-chip">{channelLabels[record.channel] ?? record.channel}</span>
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
    return <p className="empty-state">이 작업에는 승인 이력이 없습니다.</p>;
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
    <section className="overview-band" aria-label="작업 개요" data-testid="task-overview">
      <div>
        <p className="eyebrow">선택한 작업</p>
        <h1 data-testid="selected-task-title">{detail.task.title}</h1>
        <p className="overview-copy" data-testid="selected-task-summary">{detail.task.summary}</p>
      </div>
      <div className="overview-metrics" role="list" aria-label="작업 지표">
        <div className="metric">
          <span>상태</span>
          <strong data-testid="selected-task-status">
            {statusLabels[detail.task.status] ?? detail.task.status}
          </strong>
        </div>
        <div className="metric">
          <span>승인</span>
          <strong>{detail.approvals.length}</strong>
        </div>
        <div className="metric">
          <span>위험 신호</span>
          <strong>{detail.risk_flags.length}</strong>
        </div>
        <div className="metric">
          <span>이벤트</span>
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
  const [isResetting, setIsResetting] = useState(false);
  const [remoteCommandText, setRemoteCommandText] = useState('/task 이 저장소에서 인증 흐름을 정리해줘');
  const [isSubmittingRemoteCommand, setIsSubmittingRemoteCommand] = useState(false);
  const [lastRemoteReceipt, setLastRemoteReceipt] = useState<RemoteCommandReceipt | null>(null);
  const [runtimeMode, setRuntimeMode] = useState<'api' | 'snapshot'>('snapshot');
  const [bannerMessage, setBannerMessage] = useState('라이브 API가 아직 연결되지 않아 생성된 런타임 스냅샷을 보여주고 있습니다.');

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
        setBannerMessage('라이브 개발 런타임에 연결되었습니다. 이제 승인 작업이 실제 오케스트레이터 흐름으로 동작합니다.');
      } catch {
        if (!active) {
          return;
        }

        setRuntimeMode('snapshot');
        setBannerMessage('API에 연결할 수 없어 생성된 런타임 스냅샷으로 화면을 표시하고 있습니다.');
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
          ? '오케스트레이터를 통해 승인이 처리되었습니다. 차단된 단계가 정상적으로 다시 실행되었습니다.'
          : action === 'deny'
            ? '오케스트레이터를 통해 거부가 처리되었습니다. 차단된 단계는 그대로 유지됩니다.'
            : action === 'cancel_task'
              ? '오케스트레이터를 통해 작업이 취소되었습니다. 대기 중이던 승인은 만료되고 남은 단계는 건너뜁니다.'
              : '수정 요청이 기록되었습니다. 작업을 수정하고 다시 검토하기 전까지 승인은 계속 대기 상태입니다.',
      );
    } catch (error) {
      setBannerMessage(
        error instanceof Error
          ? `승인 작업 처리에 실패했습니다: ${error.message}`
          : '승인 작업 처리에 실패했습니다.',
      );
    } finally {
      setBusyApprovalId(null);
    }
  };

  const handleResetDemo = async () => {
    setIsResetting(true);

    try {
      const nextState = await resetCommandCenterState();
      setCommandCenterState({
        taskItems: sortTaskItems(nextState.taskItems),
        approvalQueue: nextState.approvalQueue,
        taskDetails: nextState.taskDetails,
      });
      setSelectedTaskId(nextState.taskItems[0]?.id ?? '');
      setRuntimeMode('api');
      setBannerMessage(
        '라이브 개발 런타임을 초기화했습니다. 이제 깨끗한 상태에서 승인, 거부, 수정 요청, 작업 취소를 다시 테스트할 수 있습니다.',
      );
    } catch (error) {
      setBannerMessage(
        error instanceof Error
          ? `데모 초기화에 실패했습니다: ${error.message}`
          : '데모 초기화에 실패했습니다.',
      );
    } finally {
      setIsResetting(false);
    }
  };

  const handleRemoteCommandSubmit = async () => {
    setIsSubmittingRemoteCommand(true);

    try {
      const receipt = await submitRemoteCommand({
        text: remoteCommandText,
        actor_id: 'remote_web_user',
        channel: 'web',
      });
      setLastRemoteReceipt(receipt);

      const nextState = await fetchCommandCenterState();
      setCommandCenterState({
        taskItems: sortTaskItems(nextState.taskItems),
        approvalQueue: nextState.approvalQueue,
        taskDetails: nextState.taskDetails,
      });

      if (receipt.task_id) {
        setSelectedTaskId(receipt.task_id);
      }

      setBannerMessage(receipt.summary);
    } catch (error) {
      setBannerMessage(
        error instanceof Error
          ? `원격 명령 전송에 실패했습니다: ${error.message}`
          : '원격 명령 전송에 실패했습니다.',
      );
    } finally {
      setIsSubmittingRemoteCommand(false);
    }
  };

  if (!selectedDetail) {
    return (
      <div className="app-shell">
        <main className="dashboard">
          <section className="overview-band" aria-label="작업 개요">
            <div>
              <p className="eyebrow">선택한 작업</p>
              <h1>표시할 작업이 없습니다</h1>
              <p className="overview-copy">명령 센터 데모 생성기를 실행해 런타임 상태를 채워주세요.</p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
      <div className="app-shell">
      <main className="dashboard">
        <section className="panel runtime-banner" aria-label="런타임 모드" data-testid="runtime-banner">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">런타임</p>
              <h2>{runtimeMode === 'api' ? '라이브 개발 런타임' : '생성된 스냅샷'}</h2>
            </div>
            <div className="runtime-actions">
              <span className={`summary-chip ${runtimeMode === 'api' ? '' : 'attention'}`}>
                {runtimeMode === 'api' ? '연결됨' : '대체 모드'}
              </span>
              <button
                type="button"
                className="iconless-button"
                onClick={handleResetDemo}
                disabled={runtimeMode !== 'api' || isResetting}
                data-testid="reset-demo-button"
              >
                {isResetting ? '초기화 중...' : '데모 초기화'}
              </button>
            </div>
          </div>
          <div className="section-body">
            <p className="overview-copy" data-testid="runtime-banner-message">{bannerMessage}</p>
          </div>
        </section>

        <section className="panel runtime-banner" aria-label="원격 명령">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">원격 명령</p>
              <h2>모바일/Telegram 명령 시뮬레이션</h2>
            </div>
            <span className="summary-chip">로컬 에이전트 채널</span>
          </div>
          <div className="section-body remote-command-body">
            <p className="overview-copy">
              이후 Telegram이 붙더라도 같은 명령 계약을 사용합니다. 지금은 여기서 원격 명령을 바로 보낼 수 있습니다.
            </p>
            <label className="remote-command-field">
              <span>명령</span>
              <textarea
                value={remoteCommandText}
                onChange={(event) => setRemoteCommandText(event.target.value)}
                rows={3}
                data-testid="remote-command-input"
              />
            </label>
            <div className="remote-command-actions">
              <button
                type="button"
                className="iconless-button"
                onClick={handleRemoteCommandSubmit}
                disabled={runtimeMode !== 'api' || isSubmittingRemoteCommand}
                data-testid="remote-command-submit"
              >
                {isSubmittingRemoteCommand ? '전송 중...' : '원격 명령 보내기'}
              </button>
              <span className="meta-chip">예: `/task 인증 오류를 수정해줘`, `/status task_...`</span>
            </div>
            {lastRemoteReceipt ? (
              <div className="remote-command-receipt" data-testid="remote-command-receipt">
                <strong>{lastRemoteReceipt.status === 'accepted' ? '수락됨' : '거부됨'}</strong>
                <p>{lastRemoteReceipt.summary}</p>
              </div>
            ) : null}
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
            <DetailSection title="계획과 단계">
              <div className="plan-summary">
                <div className="plan-chip">
                  <span>계획</span>
                  <strong>{selectedDetail.plan.title}</strong>
                </div>
                <div className="plan-chip">
                  <span>상태</span>
                  <strong>{statusLabels[selectedDetail.plan.status] ?? selectedDetail.plan.status}</strong>
                </div>
              </div>
              <StepsTable steps={selectedDetail.steps} />
            </DetailSection>

            <DetailSection title="승인 이력">
              <ApprovalList approvals={selectedDetail.approvals} />
            </DetailSection>

            <DetailSection title="위험 신호">
              <RiskFlagList risks={selectedDetail.risk_flags} />
            </DetailSection>

            <DetailSection title="타임라인">
              <TimelineList events={selectedDetail.timeline} />
            </DetailSection>

            <DetailSection title="감사 기록">
              <AuditList records={selectedDetail.audit_records} />
            </DetailSection>
          </div>
        </div>
      </main>
    </div>
  );
}
