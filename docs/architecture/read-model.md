# Runtime Read Model

상태: Draft v0.1  
최종 갱신: 2026-04-22

이 문서는 Personal Agent OS 코어 런타임의 조회 전용 read model 계약을 정의한다.

## 1. 목적

현재 코어는 아래 데이터를 각각 따로 보관한다.

- `TaskStore`
- `PlanStore`
- `StepStore`
- `ApprovalStore`
- `EventBus`

실행은 가능하지만, 외부에서 task 기준으로 현재 상태를 한 번에 읽으려면 여러 저장소를 직접 조합해야 한다.  
`Runtime Read Model`은 이 조합을 하나의 조회 API로 모아준다.

## 2. 책임

- `task_id` 기준으로 최신 Task snapshot 조회
- 관련 Plan 목록 조회
- 관련 Step 목록 조회
- 승인 요청/승인 완료/거절 이력 조회
- pending approval 조회
- `risk.flagged` 이력 조회
- task timeline 조회

중요한 제약:

- read model은 새로운 상태를 계산하지 않는다.
- write path를 갖지 않는다.
- 상태의 진실원본은 여전히 event stream + stores다.
- read model은 현재 저장된 snapshot과 event를 읽기 편한 shape로 재구성만 한다.

## 3. 최소 API

```ts
getTask(taskId: string): Task | null
listTasks(): readonly Task[]
listPlansByTask(taskId: string): readonly Plan[]
listStepsByTask(taskId: string): readonly Step[]
listApprovalsByTask(taskId: string): readonly Approval[]
listPendingApprovals(taskId?: string): readonly Approval[]
listEventsByTask(taskId: string, eventType?: EventType): readonly Event[]
listRiskFlagsByTask(taskId: string): readonly RiskFlaggedEvent[]
getTaskRuntimeView(taskId: string): TaskRuntimeView
```

## 4. `TaskRuntimeView`

`getTaskRuntimeView(taskId)`는 아래 shape를 반환한다.

```ts
{
  task: Task | null
  plans: readonly Plan[]
  steps: readonly Step[]
  approvals: readonly Approval[]
  pendingApprovals: readonly Approval[]
  riskFlags: readonly RiskFlaggedEvent[]
  timeline: readonly Event[]
}
```

의도:

- Command Center나 CLI가 task 단위 상태를 바로 그릴 수 있어야 한다.
- 승인 대기 여부를 추가 계산 없이 확인할 수 있어야 한다.
- 정책 위험 이력을 timeline과 별도로 바로 필터링할 수 있어야 한다.

## 5. 정렬 규칙

- `listTasks()`는 시간순 정렬
- `listPlansByTask()`는 시간순 정렬
- `listApprovalsByTask()`와 `listPendingApprovals()`는 `requested_at` 기준 정렬
- `timeline`은 이벤트 `timestamp` 기준 정렬
- `steps`는 현재 구현에서 안정적인 ID 기준 정렬

## 6. 수용 기준

- low-risk read-only task는 `riskFlags.length === 0`
- approval-required task는 `pendingApprovals.length > 0`
- 승인 완료 후에는 `pendingApprovals.length === 0`
- 승인 완료 후에도 기존 `riskFlags` 이력은 유지된다
- timeline에는 `task.updated`, `plan.updated`, `policy.evaluated`, `risk.flagged`, `step.approval_requested`, `step.approved` 같은 이벤트가 task 기준으로 조회된다
