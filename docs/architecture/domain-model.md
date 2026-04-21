# Personal Agent OS 도메인 모델

작성 기준: `docs/plans/2026-04-21-personal-agent-os-mvp-issue-plan.md`

이 문서는 MVP 구현자가 바로 코드, DB, API 타입으로 옮길 수 있도록 핵심 엔티티의 필드, 상태, 전이 규칙만 압축해 정리한다.

## 공통 원칙

- 모든 주요 객체는 `id`, `created_at`, `updated_at`을 가진다.
- 상태는 단방향 진행을 기본으로 하며, 실패/거절/취소는 종료 상태다.
- 정책 판정과 승인 결과는 실제 실행보다 먼저 기록된다.
- 민감 정보는 원문 저장보다 마스킹, 해시, 요약 저장을 우선한다.

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

