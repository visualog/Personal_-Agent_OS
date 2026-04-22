# Personal Agent OS 도메인 모델

작성 기준: `docs/plans/2026-04-21-personal-agent-os-mvp-issue-plan.md`

이 문서는 MVP 구현자가 바로 코드, DB, API 타입으로 옮길 수 있도록 핵심 엔티티의 필드, 상태, 전이 규칙만 압축해 정리한다.

## 공통 원칙

- 모든 주요 객체는 `id`, `created_at`, `updated_at`을 가진다.
- 상태는 단방향 진행을 기본으로 하며, 실패/거절/취소는 종료 상태다.
- 정책 판정과 승인 결과는 실제 실행보다 먼저 기록된다.
- 민감 정보는 원문 저장보다 마스킹, 해시, 요약 저장을 우선한다.
- 현재 런타임은 `Task`, `Plan`, `Step`의 상태를 별도 Store에 다시 쓰지 않는다. 지금 시점의 상태는 생성 시점 필드와 append-only 이벤트, `ApprovalStore` 조합으로 해석한다.
- 아래 전이 규칙은 두 층으로 읽어야 한다.
  - `도메인 목표 상태`: 앞으로 Store에 반영될 정규 상태 머신
  - `현재 런타임 관찰 상태`: `PersonalAgentOrchestrator`가 실제로 만드는 객체와 이벤트 기준 해석

## Task

사용자 요청 1건의 최상위 작업 단위다.

필드:

- `id`
- `title`
- `raw_request`
- `status`
- `priority`
- `sensitivity`
- `created_by`
- `created_at`
- `updated_at`

상태:

- `created`
- `planning`
- `waiting_approval`
- `running`
- `completed`
- `failed`
- `canceled`

전이 규칙:

- `created -> planning`: Planner가 실행 가능한 계획을 만들기 시작할 때
- `planning -> waiting_approval`: 계획 내 승인 필요한 Step이 생겼을 때
- `planning -> running`: 승인 없이 실행 가능한 Step만 남았을 때
- `waiting_approval -> running`: 필요한 승인들이 충족됐을 때
- `running -> completed`: 모든 Step이 완료됐을 때
- `running -> failed`: 복구 불가 오류가 났을 때
- `created|planning|waiting_approval|running -> canceled`: 사용자가 중단했을 때

현재 런타임 관찰 상태:

- `createTask(...)` 직후 `task.status`는 항상 `created`다.
- `run(...)`은 `task.created` 이벤트와 이후 실행 이벤트를 남기지만, `task.status`를 `running`, `waiting_approval`, `completed`, `failed`로 다시 저장하지는 않는다.
- 따라서 현재 구현에서 Task 레벨 상태는 아래처럼 해석한다.
  - 마지막 실행 결과에 `requires_approval`가 하나 이상 있으면 운영상 `waiting_approval`
  - 모든 Step 결과가 `succeeded`면 운영상 `completed`
  - 하나 이상 `denied | failed`가 있고 복구 흐름이 없으면 운영상 `failed`
  - `resolveApproval(... approved)` 이후 보류 Step이 재실행되면 운영상 `running -> completed|failed`
- 바로 분리 가능한 후속 이슈:
  - `TaskStore` 추가
  - `task.updated` 발행 및 영속 상태 반영
  - Task 최종 상태 계산기를 이벤트 해석이 아닌 저장 로직으로 이동

## Plan

Task를 실행 가능한 Step 묶음으로 분해한 실행 계획이다.

필드:

- `id`
- `task_id`
- `summary`
- `steps`
- `status`
- `created_at`
- `updated_at`

상태:

- `drafted`
- `approved`
- `partially_approved`
- `running`
- `completed`
- `failed`
- `canceled`

전이 규칙:

- `drafted -> approved`: 전체 계획이 승인 가능 상태일 때
- `drafted -> partially_approved`: 일부 Step만 승인된 상태일 때
- `approved|partially_approved -> running`: 첫 Step 실행이 시작될 때
- `running -> completed`: 모든 Step이 종료됐을 때
- `running -> failed`: 실행 중 치명 오류가 났을 때
- `drafted|approved|partially_approved|running -> canceled`: Task가 취소될 때

현재 런타임 관찰 상태:

- `createPlan(...)` 직후 `plan.status`는 항상 `drafted`다.
- 현재 Planner는 승인 요구를 사전에 계산하지 않고 `plan.drafted.payload.requires_approval`도 항상 `false`로 시작한다.
- 승인 필요 여부는 Plan 생성 후 Step 실행 시점의 `ToolGateway.execute(...)` 결과로 드러난다.
- 현재 구현은 `plan.updated`를 발행하지 않으며, `plan.status`도 `drafted`에서 바꾸지 않는다.
- 따라서 운영상 Plan 상태는 다음처럼 해석한다.
  - 첫 `action.started` 이후 `running`
  - 어떤 Step이 `step.approval_requested`를 만들면 부분적으로 `partially_approved` 성격을 가짐
  - 모든 Step이 `action.succeeded`면 `completed`
  - 하나라도 `action.failed`로 끝나고 후속 재개가 없으면 `failed`
- 바로 분리 가능한 후속 이슈:
  - `PlanStore` 추가
  - `plan.updated` 이벤트 명세 고정
  - `requires_approval`와 `risk_summary`를 Planner 예측값과 런타임 실측값으로 분리

## Step

Plan 안의 개별 실행 단위다. 하나의 Step은 보통 하나의 tool action을 중심으로 한다.

필드:

- `id`
- `plan_id`
- `title`
- `status`
- `tool_name`
- `required_capabilities`
- `risk_level`
- `approval_id`
- `depends_on`

상태:

- `ready`
- `waiting_approval`
- `running`
- `completed`
- `failed`
- `skipped`
- `blocked`

전이 규칙:

- `ready -> waiting_approval`: 정책상 승인 필요로 판정됐을 때
- `ready -> running`: 정책상 허용됐을 때
- `waiting_approval -> running`: 연결된 Approval이 승인됐을 때
- `running -> completed`: Step 실행이 끝났을 때
- `running -> failed`: Step 실행이 실패했을 때
- `ready|waiting_approval|running -> skipped`: 선행 Step 실패, 재계획, 또는 사용자 수정으로 건너뛸 때
- `ready|waiting_approval -> blocked`: 의존 Step이 실패했거나 정책상 영구 차단될 때

현재 런타임 관찰 상태:

- Planner가 만든 모든 `step.status`는 최초에 `ready`다.
- 현재 오케스트레이터는 `step.status` 필드를 직접 갱신하지 않는다. Step의 실제 진행은 실행 결과와 이벤트로 해석한다.
- 현재 구현의 정확한 런타임 분기는 아래와 같다.

| 입력 상태 | Orchestrator 동작 | 관찰 가능한 결과 |
| --- | --- | --- |
| `ready` + Gateway `succeeded` | `action.started` 후 `action.succeeded` 발행 | 운영상 `completed` |
| `ready` + Gateway `requires_approval` | `action.started` 후 `step.approval_requested` 발행, `ApprovalStore.create(...)` 또는 기존 pending approval 재사용 | 운영상 `waiting_approval` |
| `ready` + Gateway `denied` | `action.started` 후 `action.failed(error_code=denied)` 발행 | 운영상 `failed` 또는 `blocked` 후보 |
| `ready` + Gateway `failed` | `action.started` 후 `action.failed(error_code=tool_failed)` 발행 | 운영상 `failed` |
| `waiting_approval` + `resolveApproval(approved)` | `step.approved` 발행 후 같은 Step만 `approval_granted=true`로 재실행 | 운영상 `running -> completed|failed|waiting_approval` |
| `waiting_approval` + `resolveApproval(denied|expired)` | `step.denied` 발행, Tool 실행 없음 | 운영상 종료, 최소 `blocked` 또는 `failed` 후보 |

구현 제약:

- 현재 런타임은 `skipped`, `blocked`를 실제 필드값으로 쓰지 않는다.
- `step.ready` 이벤트도 정의만 있고 아직 발행하지 않는다.
- 승인 후 재개는 같은 `step_id` 하나만 다시 실행한다. Plan 전체를 다시 돌리지 않는다.
- 승인 후 재실행에서도 Gateway가 다시 `requires_approval`를 반환할 수 있다. 이 경우 같은 `task_id/step_id`의 기존 pending approval이 있으면 재사용하고, 없으면 새 approval을 만든다.

바로 분리 가능한 후속 이슈:

- `StepStore` 추가 및 `status`, `approval_id` 반영
- `step.ready`와 `plan.updated` 실제 발행
- `blocked`와 `skipped` 판정 규칙 구현
- approval 재개 전 `approval.step_id -> plan.step_id` orphan 검증 강화

## Tool

시스템이 실행할 수 있는 도구 정의다. 실제 실행은 Gateway를 통해서만 이루어진다.

필드:

- `name`
- `description`
- `input_schema`
- `output_schema`
- `capabilities`
- `default_risk`
- `requires_approval`
- `sandbox`

권장 상태:

- Tool 자체는 실행 상태를 갖지 않으며, 등록 상태만 관리한다.
- 구현 시 `enabled | disabled | deprecated` 같은 등록 상태를 선택적으로 둘 수 있다.

전이 규칙:

- `enabled -> disabled`: 운영 중 비활성화할 때
- `disabled -> enabled`: 다시 허용할 때
- `enabled|disabled -> deprecated`: 대체 도구가 생겼을 때

## PolicyDecision

Tool 또는 Step 실행 전 정책 엔진이 내리는 판정 결과다.

필드:

- `id`
- `action_id`
- `decision`
- `risk_level`
- `reasons`
- `evaluated_rules`
- `created_at`

상태/값:

- `decision`: `allow | require_approval | deny`

전이 규칙:

- `allow`: 바로 실행 가능
- `require_approval`: Approval 생성 후 재평가 필요
- `deny`: 실행 불가, 재시도 전 정책 또는 입력 변경 필요

운영 규칙:

- 같은 `action_id`에 대해 정책이 다시 계산되면 새 `PolicyDecision`을 추가 기록한다.
- 실행 결과보다 정책 결과가 먼저 생성되어야 한다.
- 현재 최소 구현에서는 `policy.evaluated` 이벤트를 별도로 발행하지 않고, `ToolExecutionResult.policy`와 이후 분기 이벤트에 판정 결과가 간접 반영된다.

## Approval

승인 필요 작업에 대해 사용자가 내리는 허가 또는 거절 기록이다.

필드:

- `id`
- `task_id`
- `step_id`
- `status`
- `summary`
- `risk_reasons`
- `requested_at`
- `resolved_at`

상태:

- `requested`
- `approved`
- `denied`
- `expired`

전이 규칙:

- `requested -> approved`: 사용자가 허가했을 때
- `requested -> denied`: 사용자가 거절했을 때
- `requested -> expired`: 제한 시간 내 응답이 없었을 때
- `approved|denied|expired`는 종료 상태이며 되돌리지 않는다

현재 런타임 관찰 상태:

- `requires_approval`가 처음 발생하면 `InMemoryApprovalStore.create(...)`가 `requested` approval을 만든다.
- 같은 `task_id/step_id`에 이미 pending approval이 있으면 오케스트레이터는 새 approval을 만들지 않고 기존 approval을 재사용한다.
- `resolveApproval(...)`는 `requested` 상태에서만 성공한다.
- 이미 종료된 approval에 다시 resolve를 시도하면 `already_resolved`
- 없는 approval id면 `not_found`
- approval은 찾았지만 현재 Plan에 같은 `step_id`가 없으면 `step_not_found`

이슈 분해 단위:

- approval 만료 스케줄러 추가
- terminal approval 이후 재요청 시 새 approval ID 발급 정책 고정
- task 단위 approval 집계와 UI/CLI 질의 API 분리

## MemoryEntry

작업 맥락, 선호, 프로젝트 상태를 저장하는 메모리 항목이다.

필드:

- `id`
- `task_id`
- `scope`
- `status`
- `content`
- `source`
- `retention_policy`
- `created_at`
- `updated_at`

상태:

- `proposed`
- `stored`
- `blocked`
- `expired`
- `deleted`

전이 규칙:

- `proposed -> stored`: 명시적 정책과 분류를 통과했을 때
- `proposed -> blocked`: 민감 정보, 범위 외 정보, 저장 금지 정보일 때
- `stored -> expired`: 보관 기간이 끝났을 때
- `stored -> deleted`: 사용자가 삭제하거나 정책상 제거할 때

운영 규칙:

- `scope`는 `ephemeral | project | personal | sensitive | blocked` 중 하나로 둔다.
- `sensitive`와 `blocked`는 장기 보관 기본 대상이 아니다.

## AuditRecord

모든 중요한 요청, 정책 판정, 승인, 도구 실행, 메모리 접근을 추적하는 불변 로그다.

필드:

- `id`
- `trace_id`
- `task_id`
- `event_type`
- `actor`
- `target`
- `summary`
- `payload_redacted`
- `created_at`

상태:

- AuditRecord는 상태 전이를 갖지 않는다.
- 대신 append-only로 기록되며 수정하지 않는다.

운영 규칙:

- 하나의 `trace_id`로 Task, Plan, Step, PolicyDecision, Approval, Tool 실행을 연결할 수 있어야 한다.
- 원문 비밀값은 저장하지 않고 마스킹 또는 해시로 대체한다.
- 사용자용 요약과 디버깅용 상세를 분리해 기록한다.

## 상태 전이 요약

- `Task`: `created -> planning -> waiting_approval -> running -> completed|failed`, 필요 시 `canceled`
- `Plan`: `drafted -> approved|partially_approved -> running -> completed|failed`, 필요 시 `canceled`
- `Step`: `ready -> waiting_approval -> running -> completed|failed`, 보조 상태로 `skipped|blocked`
- `Approval`: `requested -> approved|denied|expired`
- `MemoryEntry`: `proposed -> stored|blocked`, 이후 `expired|deleted`
- `AuditRecord`: 전이 없음, append-only
