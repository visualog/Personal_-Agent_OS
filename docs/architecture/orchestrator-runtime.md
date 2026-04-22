# Runtime Orchestrator Implementation Contract

상태: Draft v0.1  
최종 갱신: 2026-04-22

이 문서는 Personal Agent OS의 Runtime Orchestrator 구현자가 직접 코드로 옮길 수 있도록 정리한 문서다.  
이 단계는 아직 브라우저 preview나 UI stage가 아니며, 실제 런타임 오케스트레이션, 이벤트, 감사, 승인, 실패 처리를 정의한다.

## 1. 목적

Runtime Orchestrator는 Planner가 만든 Step들을 실행 가능한 작업 흐름으로 바꾸고, Tool Runtime과 Approval Flow를 연결하는 중앙 제어 지점이다.

책임:

- Task 또는 Plan 컨텍스트를 받아 실행 순서를 구성한다.
- Step 상태를 관리하고 현재 실행 가능 여부를 판정한다.
- Tool 실행 요청을 Tool Gateway로 전달한다.
- 승인 필요 Step은 실행 전에 대기 상태로 전환한다.
- 실행 결과를 이벤트와 감사 로그로 남긴다.
- 중간 실패, 재시도, 중단, 재계획을 조정한다.

Orchestrator는 직접 Tool을 실행하지 않는다.  
Orchestrator는 실행 조건을 정리하고 실행을 조율하며, 실제 실행은 Tool Runtime/Gateway가 담당한다.

현재 구현 범위:

- `run(...)`은 `createTask -> createPlan -> step 순차 실행`까지 담당한다.
- `resolveApproval(...)`와 `resumeApproval(...)`은 pending approval 하나를 확정하고 같은 Step 하나만 재실행한다.
- 아직 없는 것:
  - 별도 `TaskStore`, `PlanStore`, `StepStore`
  - retry, backoff, replan, cancel
  - multi-step resume와 전체 Plan 재개

## 2. 의존성

Runtime Orchestrator가 의존하는 컴포넌트는 다음과 같다.

| 의존성 | 역할 |
| --- | --- |
| `Task Store` | Task 식별자와 상태를 조회 |
| `Plan Store` | Step 목록, 순서, risk, capability 요구사항 조회 |
| `Policy Engine` | Step 실행 전 allow / require_approval / deny 판정 |
| `Approval Flow` | 사용자 승인 요청 및 승인 결과 수신 |
| `Tool Gateway` | 실제 Tool 실행 요청과 결과 수신 |
| `Event Bus` | 상태 변경 이벤트 발행 |
| `Audit Log` | 정책 판정, 승인, 실행, 실패의 감사 기록 저장 |
| `Memory Store` | 필요 시 실행 컨텍스트 또는 결과 요약 저장 |

필수 전제:

- `trace_id`는 항상 유지되어야 한다.
- `step_id`와 `plan_id`는 실행 흐름 안에서 일관되게 연결되어야 한다.
- 민감한 원문은 이벤트 payload에 그대로 저장하지 않는다.

## 3. 런타임 역할

### Orchestrator

Orchestrator는 상태 머신 역할을 한다.

책임:

- `step.ready` 이후의 실행 가능 Step을 고른다.
- 순차 실행, 조건부 실행, 재시도 가능 여부를 관리한다.
- 정책 결과를 반영해 실행을 시작하거나 보류한다.
- 승인 대기 중인 Step을 `waiting_approval` 상태로 둔다.
- 실패 시 retry, skip, fail-fast, replan 중 하나를 선택할 수 있게 만든다.

### Executor Bridge

Orchestrator는 내부적으로 Executor Bridge를 통해 Tool Gateway와 연결된다.

책임:

- 실행 입력을 표준 action envelope로 바꾼다.
- idempotency 키를 부여하거나 전달한다.
- 실행 결과를 표준 결과 객체로 정규화한다.
- 실행 완료 시 다음 Step으로 진행할지 결정한다.

### Audit Coordinator

Orchestrator는 실행의 각 분기에서 감사 이벤트를 남기는 책임을 가진다.

책임:

- 정책 판정 결과를 기록한다.
- 승인 요청과 승인 응답을 기록한다.
- Tool 시작/성공/실패/중단을 기록한다.
- 재시도 및 재계획 사유를 남긴다.

## 4. 실행 흐름

기본 실행 순서는 다음과 같다.

1. Orchestrator가 `plan_id` 또는 `task_id`를 기준으로 현재 Plan과 Step을 조회한다.
2. 실행 가능한 Step을 찾고, Step 상태가 `ready`인지 확인한다.
3. Step 메타데이터로 Policy Engine에 판정을 요청한다.
4. Orchestrator는 `action.started`를 먼저 발행한 뒤 Tool Gateway를 호출한다.
5. Gateway 결과가 `deny` 또는 `failed`면 `action.failed`를 기록한다.
6. Gateway 결과가 `require_approval`이면 Approval Flow에 승인 요청을 만들고 `step.approval_requested`를 기록한다.
7. Gateway 결과가 `allow` 경로에서 성공하면 `action.succeeded`를 기록한다.
8. 현재 구현은 Step 상태를 Store에 다시 쓰지 않으므로, `running/succeeded/failed/waiting_approval`는 이벤트로만 관찰된다.
9. 성공 시 다음 Step으로 진행한다.
10. 실패 시 현재 구현은 retry 없이 다음 Step으로 진행하거나 배치를 종료하지 않고, 각 Step 결과를 수집해 반환한다.
11. 모든 변화는 이벤트와 감사 로그에 남긴다.

### 현재 `run(...)`의 정확한 실행 순서

1. 필요하면 workspace read-only tools를 Gateway에 자동 등록한다.
2. `createTask(...)`로 `task.created`를 만든다.
3. `createPlan(...)`로 `plan.drafted`를 만든다.
4. 각 Step마다 `action.started`를 발행한다.
5. Gateway 실행 결과에 따라 아래 셋 중 하나를 발행한다.
   - `action.succeeded`
   - `step.approval_requested`
   - `action.failed`
6. 모든 발행 이벤트는 즉시 AuditLog에도 기록된다.
7. 반환값에는 `task`, `plan`, `approvals`, `steps`, `events`, `auditRecords`가 모두 포함된다.

### Lifecycle 이벤트 구현 후 `run(...)`의 목표 실행 순서

이 절은 `step.ready`, `policy.evaluated`, `plan.updated`, `task.updated`를 실제 발행하도록 붙였을 때 따라야 할 구현 순서를 정의한다.

#### allow 경로

1. 필요하면 workspace read-only tools를 Gateway에 자동 등록한다.
2. `task.created`
3. `plan.drafted`
4. 실행 대상으로 선택된 Step에 대해 `step.ready`
5. 같은 Step에 대해 `policy.evaluated`
6. `decision=allow`이면 `action.started`
7. Tool 실행 후 `action.succeeded`
8. Step 결과를 반영한 `plan.updated`
9. 같은 결과를 Task 상태로 반영한 `task.updated`

#### require_approval 경로

1. `task.created`
2. `plan.drafted`
3. `step.ready`
4. `policy.evaluated` with `decision=require_approval`
5. pending approval이 있으면 재사용하고 없으면 새 approval 생성
6. `step.approval_requested`
7. Step 상태 `waiting_approval`를 반영한 `plan.updated`
8. Task 상태 `waiting_approval`를 반영한 `task.updated`

#### deny / failed 경로

1. `task.created`
2. `plan.drafted`
3. `step.ready`
4. `policy.evaluated`
5. `decision=deny` 또는 실행 실패 결과에 대해 `action.failed`
6. 실패 결과를 반영한 `plan.updated`
7. 실패 결과를 반영한 `task.updated`

### 현재 `resolveApproval(...)`의 정확한 실행 순서

1. `approval_id`를 `ApprovalStore.resolve(...)`로 확정한다.
2. approval이 없으면 `not_found`
3. approval이 이미 종료 상태면 `already_resolved`
4. approval은 있지만 현재 Plan에서 `step_id`를 못 찾으면 `step_not_found`
5. `resolution !== approved`이면 `step.denied`를 발행하고 종료한다.
6. `resolution === approved`이면 `step.approved`를 발행한다.
7. 같은 `step_id` 하나만 `approval_granted=true`로 재실행한다.
8. 재실행 결과에 따라 다시
   - `action.succeeded`
   - `step.approval_requested`
   - `action.failed`
   중 하나를 발행한다.

### Lifecycle 이벤트 구현 후 `resolveApproval(...)`의 목표 실행 순서

#### approved

1. `approval_id`를 resolve한다
2. approval이 없으면 `not_found`
3. approval이 이미 종료 상태면 `already_resolved`
4. 현재 Plan에 step이 없으면 `step_not_found`
5. `step.approved`
6. 같은 Step에 대해 다시 `step.ready`
7. `approval_granted=true` 컨텍스트로 `policy.evaluated`
8. `decision=allow`이면 `action.started`
9. 결과로 `action.succeeded` 또는 `action.failed`
10. Step 결과를 반영한 `plan.updated`
11. Task 결과를 반영한 `task.updated`

#### denied | expired

1. `approval_id`를 resolve한다
2. `step.denied`
3. 같은 Step을 `blocked` terminal 상태로 간주한다
4. `plan.updated`
5. `task.updated`
6. Tool 실행은 일어나지 않는다

### 상태 전이 원칙

- 현재 구현은 상태 필드보다 이벤트 스트림이 진실원본에 가깝다.
- 한 번의 실행 시도는 하나의 `action_id`와 연결된다.
- 승인 후 재개는 기존 Step을 교체하지 않고 같은 Step 정의를 다시 실행한다.
- `resumeApproval(...)`는 현재 `resolveApproval(...)`의 별칭이다.

## 5. 발행 이벤트

Runtime Orchestrator는 아래 이벤트를 발행하거나 연쇄적으로 보장한다.

| 이벤트 | 발행 시점 |
| --- | --- |
| `step.ready` | 실행 또는 재실행 직전, 대상으로 선택된 Step이 ready가 될 때 |
| `policy.evaluated` | 실행 직전 정책 판정이 확정될 때 |
| `step.approval_requested` | 승인 필요 Step이 보류될 때 |
| `step.approved` | 승인이 들어왔을 때 |
| `step.denied` | 승인이 거절되었을 때 |
| `action.started` | Tool 실행 직전에 |
| `action.succeeded` | Tool 실행이 정상 완료되었을 때 |
| `action.failed` | Tool 실행이 실패했을 때 |
| `plan.updated` | Step 결과를 Plan 상태에 투영했을 때 |
| `task.updated` | 같은 결과를 Task 상태에 투영했을 때 |
| `audit.recorded` | 감사 기록이 저장되었을 때 |

### 이벤트 규칙

- 이벤트는 append-only로 다뤄야 한다.
- 동일 상태를 반복 저장하는 중복 이벤트는 피해야 한다.
- 원문 입력은 가능한 한 hash 또는 redacted summary로 대체한다.
- 이벤트 순서는 실행 순서와 추적 가능해야 한다.
- 현재 구현은 approval 재요청 시 같은 `task_id/step_id`의 pending approval이 있으면 새 `step.approval_requested`와 함께 기존 approval id를 재사용할 수 있다.
- lifecycle 이벤트 구현 후에는 한 Step 시도에서 `step.ready -> policy.evaluated -> action.* | step.approval_requested -> plan.updated -> task.updated` 순서를 유지해야 한다.

## 6. 감사 동작

Orchestrator의 감사는 단순 로그가 아니라 재현 가능한 실행 기록이다.

감사 대상:

- 입력된 `plan_id`, `step_id`, `tool_name`
- 정책 판정 결과
- 승인 요청과 응답
- 실행 시작 시각과 종료 시각
- 재시도 횟수와 재시도 사유
- 실패 코드와 복구 가능성
- 최종 결과 요약

감사 규칙:

- 정책이 `deny`인 경우에도 감사 기록은 남겨야 한다.
- 승인 요청이 생성되면 감사에 반드시 기록해야 한다.
- Tool 실행 결과는 성공/실패와 무관하게 기록되어야 한다.
- 민감 데이터는 마스킹하거나 참조 ID로 대체한다.
- 감사 로그는 사용자 UI와 분리된 운영 기록으로 유지한다.

감사 이벤트 예시:

```json
{
  "audit_id": "aud_01",
  "trace_id": "trace_01",
  "plan_id": "plan_01",
  "step_id": "step_01",
  "action": "policy.deny",
  "summary": "workspace scope outside allowed range",
  "actor": "system"
}
```

## 7. Tool 실행 동작

Orchestrator는 Tool 실행을 직접 수행하지 않고, Tool Gateway를 호출하기 전에 필요한 실행 정보만 정리한다.

실행 입력에 포함해야 할 값:

- `action_id`
- `step_id`
- `tool_name`
- `input`
- `trace_id`
- `correlation_id`
- `idempotency_key`
- `timeout_ms`

실행 규칙:

- `allow` 판정이 오기 전에는 실행 요청을 보내지 않는다.
- 승인 필요한 Step은 승인 완료 전까지 실행하지 않는다.
- 동일 `idempotency_key`는 중복 실행을 막아야 한다.
- 결과 payload가 클 경우 artifact reference로 분리한다.
- 실행 중 timeout이 나면 중단 결과로 표준화한다.

현재 구현 기준 보정:

- 현재 Orchestrator는 정책 판정을 Gateway 내부 결과로 받기 때문에 `action.started`가 정책 결과보다 먼저 발행된다.
- 따라서 감사 해석 시 `action.started -> step.approval_requested` 조합은 "실행 시작 후 승인 요구가 발견되었다"가 아니라 "Gateway 호출 결과 승인 필요로 판정되었다"로 읽어야 한다.
- lifecycle 이벤트 구현 시 이 부분은 바뀌어야 하며, `policy.evaluated`가 `action.started`보다 먼저 와야 한다.
- `decision=require_approval` 또는 `decision=deny`인 경우에는 `action.started`를 발행하지 않는 것을 기준 계약으로 둔다.
- `approval_granted=true`는 승인 재개 실행에서만 전달된다.
- 일반 `run(...)` 경로에서는 항상 `approval_granted=false`다.

Tool 실행 결과 분류:

- `succeeded`
- `failed`
- `timeout`
- `canceled`
- `waiting_approval`

## 8. 실패 및 승인 처리

### 승인 관련 분기

- `require_approval`이면 `step.approval_requested`를 발행한다.
- 승인 전에는 `running`으로 가지 않는다.
- 사용자가 승인하면 `step.approved`를 기록하고 실행을 재개한다.
- 사용자가 거절하면 `step.denied`를 기록하고 Step을 종료한다.

현재 구현에서의 정확한 결과:

- `require_approval`
  - `ApprovalStore.findPendingByStep(...)`로 기존 pending approval 조회
  - 없으면 새 approval 생성
  - `step.approval_requested` 발행
  - `OrchestratorStepResult.execution.status = "requires_approval"`
- `approved`
  - approval 상태를 `approved`로 바꾼다
  - `step.approved` 발행
  - 같은 Step 하나만 재실행
- `denied | expired`
  - approval 상태를 terminal로 바꾼다
  - `step.denied` 발행
  - Tool 실행 없이 종료

Lifecycle 이벤트 구현 후 추가 규칙:

- `step.approval_requested` 뒤에는 반드시 `plan.updated`, `task.updated`가 이어진다.
- `step.approved` 뒤에는 같은 Step에 대한 `step.ready`, `policy.evaluated`가 다시 나온다.
- `step.denied` 뒤에는 같은 approval에 연결된 Tool 실행이 나오면 안 된다.
- `plan.updated`와 `task.updated`는 같은 Step 시도의 최종 결과를 반영해야 하며, resume 전 상태를 다시 덮어쓰면 안 된다.

### 실패 분기

| 실패 유형 | Orchestrator 처리 |
| --- | --- |
| `policy_denied` | 현재 구현상 `action.failed(error_code=denied)` 기록 |
| `approval_missing` | pending approval이 없으면 새 approval 생성, 있으면 재사용 |
| `approval_denied` | `step.denied` 기록 후 Tool 실행 없이 종료 |
| `tool_timeout` | 아직 별도 분류 없음, Gateway가 `failed`로 돌려주면 일반 실패로 처리 |
| `tool_crash` | `action.failed(error_code=tool_failed)` |
| `transient_io` | retry 미구현, 일반 실패 처리 |
| `result_invalid` | Gateway가 `failed`로 정규화하면 일반 실패 처리 |
| `plan_inconsistent` | `step_not_found` 반환 후 실행 중단 |

### Retry 규칙

- 현재 배치에는 retry가 없다.
- `execution.payload.retryable`는 기록되지만, Orchestrator가 자동 재시도하지는 않는다.
- retry/backoff는 별도 이슈로 분리한다.

### 승인 재시도 규칙

- 승인 요청이 만료되면 다시 요청할 수 있다.
- 승인 상태가 오래 유지되면 Orchestrator는 Step을 보류 상태로 되돌릴 수 있다.
- 승인 이후 정책이 바뀌면 다시 policy.evaluated를 수행해야 한다.

현재 구현 기준 보정:

- `expired`는 `resolveApproval(...)` 입력으로만 지원되며 자동 만료 스케줄러는 없다.
- approval이 terminal state가 되면 같은 approval id로 재개할 수 없다.
- 재실행 후에도 다시 `requires_approval`가 나올 수 있다.

## 9. 구현 시 주의점

- Orchestrator는 UI 레이어가 아니다. 브라우저 preview, 버튼, 화면 전환 같은 책임을 가지지 않는다.
- Orchestrator는 직접 프롬프트를 생성하지 않는다. 프롬프트 조립은 상위 Plan 또는 Executor 계층의 책임이다.
- Orchestrator는 Tool 결과를 임의로 수정하지 않는다. 결과는 정규화만 한다.
- Orchestrator는 상태 전이를 이벤트보다 먼저 조용히 바꾸지 말고, 추적 가능한 순서를 지켜야 한다.
- 작업 흐름 중단 시에도 마지막 확정 상태와 감사 기록은 남겨야 한다.

## 10. 테스트 시나리오

### 기본 실행

- `ready` Step이 `allow` 판정을 받으면 `step.ready`, `policy.evaluated`, `action.started`, `action.succeeded`, `plan.updated`, `task.updated`가 순서대로 발생해야 한다.
- 성공한 Step 이후 다음 Step이 자동으로 `ready` 또는 `running`으로 넘어가야 한다.

### 승인 필요

- `require_approval` Step은 승인 없이 실행되면 안 된다.
- 승인 요청 이벤트가 남고 이후 `plan.updated`, `task.updated`를 통해 Step 상태가 `waiting_approval`이어야 한다.
- 승인 후에만 `action.started`가 발생해야 한다.

현재 구현 기준 수정:

- `action.started`는 approval 전에도 먼저 발생한다.
- 따라서 테스트는 `action.started` 부재가 아니라 `approval_granted=false`에서 실행 성공이 나오지 않는 점을 검증해야 한다.
- 승인 후 재개에서는 새 `action.started`가 한 번 더 발생해야 한다.

### 정책 거절

- `deny` 판정이면 Tool Gateway를 호출하지 않아야 한다.
- `policy.evaluated(decision=deny)`가 먼저 남아야 한다.
- 감사 로그에 거절 사유가 남아야 한다.
- 이후 `plan.updated`, `task.updated`가 실패 상태를 반영해야 한다.

현재 구현 기준 수정:

- Gateway 호출 자체는 이미 일어난 뒤 결과가 `denied`로 돌아온다.
- 테스트는 "Gateway 미호출"이 아니라 `action.failed(error_code=denied)`와 후속 성공 이벤트 부재를 검증한다.

### 승인 재개

- 승인된 approval은 `step.approved` 이후 같은 Step 하나만 재실행해야 한다.
- 거절되거나 만료된 approval은 `step.denied`만 남기고 Tool 실행을 만들지 않아야 한다.
- unknown approval은 `not_found`
- terminal approval 재처리는 `already_resolved`
- approval은 있는데 Step이 현재 Plan에 없으면 `step_not_found`

### 실패 및 재시도

- 일시적 I/O 실패는 retryable로 분류되어야 한다.
- retry 횟수 초과 시 최종 실패로 마감되어야 한다.
- retry 때마다 별도 감사 기록이 생성되어야 한다.

### 중복 실행 방지

- 동일 `idempotency_key`로 요청이 두 번 들어와도 Tool은 한 번만 실행되어야 한다.
- 중복 요청은 기존 실행 참조를 반환하거나 차단해야 한다.

### 감사 일관성

- lifecycle 이벤트 구현 후에는 `policy.evaluated` 없이 `action.started`가 발생하면 안 된다.
- `action.failed`에도 종료 시각과 실패 코드가 기록되어야 한다.
- 승인 거절과 정책 거절은 서로 다른 감사 액션으로 남아야 한다.

### 상태 복원

- Orchestrator 재시작 후에도 진행 중인 `step_id`를 복원할 수 있어야 한다.
- 이미 `succeeded`인 Step은 재실행되지 않아야 한다.
- 중간 상태가 모호하면 안전한 쪽으로 보류하고 재조회해야 한다.

## 11. 현재 단계의 한계

- 이 문서는 런타임 계약 문서이며, 브라우저 preview나 UI stage가 아니다.
- 화면 배치, 디자인 시스템, 시각적 컴포넌트는 아직 범위 밖이다.
- 실제 구현에서는 이 문서의 상태 이름과 이벤트 이름을 기준으로 맞추되, 저장소의 기존 도메인 모델과 충돌하지 않게 조정해야 한다.
