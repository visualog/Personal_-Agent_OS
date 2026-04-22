# Command Center Model

상태: Draft v0.1  
최종 갱신: 2026-04-22

이 문서는 `PAOS-018`, `PAOS-019`를 구현 전 단계에서 바로 코드와 UI로 옮길 수 있도록 정리한 Command Center 정보 구조다.

## 1. 목적

Command Center는 아래 네 화면/영역의 기반 데이터를 제공해야 한다.

- Task List
- Task Detail
- Approval Queue
- Audit Detail

현재 구현은 세 레이어로 나뉜다.

- `packages/core/src/command-center.ts`: UI 바로 아래의 in-memory view model
- `scripts/generate-command-center-demo.ts`: 코어 런타임으로 demo snapshot을 생성하는 build/dev 연결 레이어
- `scripts/command-center-demo-runtime.ts`: dev preview에서 live state와 approval resolution을 제공하는 thin runtime API 레이어
- `apps/web`: Command Center 구조를 검증하기 위한 첫 번째 웹 프로토타입

## 2. Task List

각 row/item이 가져야 하는 최소 필드:

- `task_id`
- `title`
- `status`
- `priority`
- `sensitivity`
- `pending_approval_count`
- `risk_flag_count`
- `updated_at`

의도:

- 현재 실행 중인 작업이 보이도록 한다.
- 승인 대기 작업이 리스트 단계에서 바로 드러나도록 한다.
- 위험 신호가 있는 작업을 task list에서 바로 구분할 수 있게 한다.

## 3. Approval Queue

각 approval card가 가져야 하는 최소 필드:

- `approval_id`
- `task_id`
- `step_id`
- `title`
- `summary`
- `risk_reasons`
- `actions`

현재 action set:

- `approve`
- `deny`
- `request_changes`
- `cancel_task`

문구 원칙:

- 모호한 문구를 쓰지 않는다.
- “승인 필요”처럼 즉시 행동을 이해할 수 있는 문장이어야 한다.
- risk reason은 숨기지 않고 직접 보여준다.

## 4. Task Detail

task detail은 아래를 한 번에 연결해서 보여줘야 한다.

- `task`
- `plans`
- `steps`
- `approvals`
- `risk_flags`
- `timeline`
- `audit_records`

의도:

- 사용자가 task 하나를 열면 plan/step/audit이 끊기지 않고 보여야 한다.
- 승인 대기 원인과 정책 판정이 한 흐름에서 보여야 한다.
- 이벤트 timeline과 audit detail이 서로 참조 가능해야 한다.

## 5. 현재 구현 상태

현재 제공되는 in-memory surface:

- `listTaskItems()`
- `listApprovalQueue()`
- `getTaskDetail(taskId)`

현재 웹 프로토타입은 위 모델을 기준으로 구성된 `Task List + Approval Queue + Task Detail + Timeline + Audit Records` 화면을 제공한다.

다만 이 단계의 웹 UI는 live runtime state를 직접 구독하는 브라우저 런타임은 아니고, `dev:web`/`build:web` 전에 코어 런타임이 생성한 snapshot을 읽는다.

로컬 `dev:web` 환경에서는 추가로 다음 API를 제공한다.

- `GET /api/command-center/state`
- `POST /api/command-center/reset`
- `POST /api/command-center/approvals/:id`

현재 실제로 orchestrator approval flow와 연결된 액션:

- `approve`
- `deny`
- `request_changes`
- `cancel_task`

현재 제한:

- `request_changes`는 dev runtime의 review-note layer에서 동작하며, approval 상태는 `requested`로 유지된다.
- `cancel_task`는 pending approval을 `expired`로 닫고 task/plan을 `canceled`로 전환한다.
- `tests/ui/command-center-ui.test.ts`는 위 4개 action의 브라우저 회귀 경로를 검증한다.
- UI 회귀 테스트는 dev preview를 새로 띄우지 않고, 실행 중인 preview에 `reset` API를 호출해 상태를 초기화한다.

## 6. 수용 기준

- task list에서 pending approval count가 보인다.
- approval queue에서 `approve`, `deny`, `request_changes`, `cancel_task` 액션이 드러난다.
- task detail에서 plan, step, approval, risk flag, timeline, audit record를 함께 조회할 수 있다.
