# Task Intake and Planner Runtime Contract

상태: Draft v0.1  
최종 갱신: 2026-04-22

이 문서는 Personal Agent OS의 Task Intake와 Planner 스켈레톤 구현 계약을 정리한다.  
이 단계는 UI, 브라우저 미리보기, 화면 시안이 아니라 실제 런타임 입력/출력, 이벤트, 최소 검증 규칙을 정의하는 문서다.

## 1. 범위

이 문서가 다루는 대상:

- 사용자 요청을 Task로 등록하는 `createTask`
- Task를 실행 가능한 Plan 초안으로 바꾸는 `createPlan`
- `task.created`, `plan.drafted` 이벤트 발행
- Step 선택 규칙
- 현재 구현 한계
- 최소 테스트 시나리오

이 문서가 다루지 않는 대상:

- 화면 구성
- 브라우저 렌더링
- 미리보기 UI
- 에디터 상호작용
- 도구 실행 상세
- 승인 플로우 최종 UI

## 2. 런타임 역할

### Task Intake

Task Intake는 사용자 입력을 표준 Task 형태로 정규화한다.

책임:

- 원문 요청을 받아 핵심 메타데이터를 추출한다.
- Task 생성에 필요한 최소 필드를 채운다.
- 중복 또는 빈 요청을 기본 검증한다.
- `task.created` 이벤트를 발행한다.

### Planner Skeleton

Planner Skeleton은 Task를 실행 가능한 Step 후보로 나누고 Plan 초안을 만든다.

책임:

- Task의 목적을 요약한다.
- 실행 순서가 있는 Step 목록을 만든다.
- 각 Step의 `tool_name`, `risk_level`, `required_capabilities`를 추정한다.
- 필요 시 승인 가능성이 있는 Step을 표시한다.
- `plan.drafted` 이벤트를 발행한다.

## 3. `createTask` 계약

### 입력

`createTask`는 아래 형태의 입력을 받는다.

```json
{
  "raw_request": "프로젝트 상태를 정리해줘",
  "channel": "web",
  "created_by": "user_01",
  "priority": "normal",
  "sensitivity": "internal",
  "trace_id": "trace_01",
  "correlation_id": null
}
```

필드 설명:

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `raw_request` | yes | 사용자의 원문 요청 |
| `channel` | yes | `web | cli | telegram | slack` 중 하나 |
| `created_by` | yes | 요청 주체 |
| `priority` | no | `low | normal | high` |
| `sensitivity` | no | `public | internal | personal | sensitive` |
| `trace_id` | yes | 실행 추적 ID |
| `correlation_id` | no | 기존 요청이나 외부 이벤트 연결 ID |

검증 규칙:

- `raw_request`는 비어 있으면 안 된다.
- `channel`은 허용된 값만 받는다.
- `trace_id`는 항상 존재해야 한다.
- 민감 정보는 원문 그대로 이벤트 payload에 넣지 않는다.

### 출력

`createTask`의 성공 출력은 다음과 같다.

```json
{
  "task_id": "task_01",
  "status": "created",
  "title": "프로젝트 상태 정리",
  "summary": "프로젝트 상태를 정리하는 요청으로 정규화됨",
  "trace_id": "trace_01",
  "event_id": "evt_01"
}
```

필드 설명:

| 필드 | 설명 |
| --- | --- |
| `task_id` | 생성된 Task ID |
| `status` | 기본적으로 `created` |
| `title` | 원문에서 추출한 짧은 제목 |
| `summary` | 사용자/운영자가 읽을 수 있는 정규화 요약 |
| `trace_id` | 입력과 동일한 추적 ID |
| `event_id` | 발행된 `task.created` 이벤트 ID |

### 실패 출력

실패 시에는 표준 오류 객체를 반환한다.

```json
{
  "status": "failed",
  "error_code": "empty_request",
  "retryable": false,
  "summary": "요청 본문이 비어 있어 Task를 만들 수 없음",
  "trace_id": "trace_01"
}
```

공통 실패 코드 예시:

- `empty_request`
- `invalid_channel`
- `invalid_trace`
- `request_too_large`

## 4. `task.created` 이벤트

Task Intake는 Task 생성 직후 `task.created` 이벤트를 반드시 발행한다.

### payload

```json
{
  "task_id": "task_01",
  "title": "프로젝트 상태 정리",
  "raw_request_hash": "sha256:...",
  "channel": "web",
  "priority": "normal",
  "sensitivity": "internal"
}
```

### 규칙

- `raw_request` 원문은 이벤트 payload에 넣지 않는다.
- 원문 대신 `raw_request_hash` 또는 redacted summary를 사용한다.
- 이벤트는 append-only로 남긴다.
- `task.created` 이전에 Task가 completed나 planning 상태가 되면 안 된다.

## 5. `createPlan` 계약

### 입력

`createPlan`은 단일 Task를 받아 실행 가능한 Plan 초안을 만든다.

```json
{
  "task_id": "task_01",
  "title": "프로젝트 상태 정리",
  "raw_request": "프로젝트 상태를 정리해줘",
  "available_tools": [
    "workspace.read_file",
    "workspace.write_file",
    "memory.read",
    "memory.write"
  ],
  "trace_id": "trace_01",
  "correlation_id": "evt_01"
}
```

필드 설명:

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `task_id` | yes | 대상 Task ID |
| `title` | yes | Task의 정규화 제목 |
| `raw_request` | yes | 계획 생성을 위한 원문 또는 redacted 원문 |
| `available_tools` | no | 현재 선택 가능한 Tool 이름 목록 |
| `trace_id` | yes | 실행 추적 ID |
| `correlation_id` | no | 연결할 상위 이벤트 또는 요청 ID |

검증 규칙:

- `task_id`는 존재해야 한다.
- `raw_request`가 없으면 요약 기반 계획만 허용한다.
- `available_tools`는 Planner의 선택 폭을 설명하는 힌트이지, 강제 목록이 아니다.
- `trace_id`는 `createTask`와 동일 계열 흐름에서 추적 가능해야 한다.

### 출력

`createPlan`의 성공 출력은 다음과 같다.

```json
{
  "plan_id": "plan_01",
  "task_id": "task_01",
  "status": "drafted",
  "summary": "프로젝트 상태 확인 후 요약 작성",
  "step_count": 3,
  "requires_approval": false,
  "trace_id": "trace_01",
  "event_id": "evt_02"
}
```

필드 설명:

| 필드 | 설명 |
| --- | --- |
| `plan_id` | 생성된 Plan ID |
| `task_id` | 연결된 Task ID |
| `status` | 기본적으로 `drafted` |
| `summary` | Plan 초안 요약 |
| `step_count` | 생성된 Step 수 |
| `requires_approval` | 하나 이상의 Step이 승인 가능 상태인지 여부 |
| `trace_id` | 입력과 동일한 추적 ID |
| `event_id` | 발행된 `plan.drafted` 이벤트 ID |

### 실패 출력

```json
{
  "status": "failed",
  "error_code": "task_not_found",
  "retryable": false,
  "summary": "대상 Task를 찾을 수 없음",
  "trace_id": "trace_01"
}
```

공통 실패 코드 예시:

- `task_not_found`
- `task_not_ready`
- `planning_disabled`
- `no_valid_steps`
- `tool_registry_unavailable`

## 6. `plan.drafted` 이벤트

Planner는 Plan 초안 생성 직후 `plan.drafted` 이벤트를 발행한다.

### payload

```json
{
  "plan_id": "plan_01",
  "task_id": "task_01",
  "step_count": 3,
  "requires_approval": false,
  "risk_summary": {
    "low": 2,
    "medium": 1,
    "high": 0,
    "critical": 0
  }
}
```

### 규칙

- Step 상세 전체는 이벤트에 넣지 않는다.
- 이벤트 payload는 요약, 개수, 위험 분포만 담는다.
- `plan.drafted`는 `task.created` 이후에만 의미가 있다.
- 같은 `task_id`에 대해 재계획하면 새 `plan.drafted` 이벤트를 추가로 남긴다.

## 7. Step 선택 규칙

Planner Skeleton은 아래 순서로 Step을 고른다.

1. 사용자 요청의 목적을 한 줄로 요약한다.
2. 요약을 읽기, 추론, 쓰기, 정리 같은 실행 의도 단위로 나눈다.
3. 각 의도에 맞는 최소 Tool 후보를 배정한다.
4. 직접 실행보다 먼저 확인이 필요한 작업은 앞 단계로 분리한다.
5. 외부 영향이 있는 작업은 승인 가능 Step으로 분리한다.
6. 각 Step에 선행 조건이 있으면 `depends_on`을 설정한다.

선택 규칙:

- 하나의 Step은 가능한 한 하나의 핵심 tool action만 가져야 한다.
- 읽기 Step은 쓰기 Step보다 먼저 배치한다.
- 불확실한 추론은 별도 Step으로 나누지 말고 Plan summary에 남긴다.
- 사용자의 요청 범위를 벗어나는 Tool은 선택하지 않는다.
- 실행 가능성이 낮거나 Tool 매핑이 없는 항목은 Step으로 만들지 않는다.
- 승인 필요 작업은 `risk_level`과 `requires_approval` 표시를 통해 분리한다.

권장 Step 필드:

- `id`
- `title`
- `status`
- `tool_name`
- `required_capabilities`
- `risk_level`
- `approval_required`
- `depends_on`

## 8. 현재 한계

이 스켈레톤은 의도적으로 아직 단순하다.

- 자연어 이해는 규칙 기반 또는 경량 추출 수준으로 시작한다.
- Tool 선택은 완전 자동 최적화가 아니라 휴리스틱 기반이다.
- 멀티 에이전트 조정은 포함하지 않는다.
- 복잡한 재계획 정책은 아직 없다.
- 승인 요구 판단은 보수적으로 단순화한다.
- Plan 품질 평가는 별도 레이어로 두지 않는다.
- UI 렌더링과 브라우저 미리보기는 이 단계의 범위가 아니다.

구현상 예상되는 제한:

- `available_tools`가 비어도 계획은 생성할 수 있어야 한다.
- `createPlan`은 실제 실행을 시작하지 않는다.
- `plan.drafted` 발행만으로 Step 실행 상태가 바뀌지 않는다.
- 동일 요청의 중복 입력 제거는 후속 레이어에서 보완한다.

## 9. 테스트 시나리오

### `createTask` 테스트

- 정상 요청은 `task_id`, `status=created`, `event_id`를 반환해야 한다.
- 빈 요청은 `empty_request`로 실패해야 한다.
- 허용되지 않은 `channel`은 차단해야 한다.
- `trace_id`가 없으면 생성하면 안 된다.
- 원문 요청은 이벤트 payload에 그대로 남지 않아야 한다.

### `task.created` 테스트

- Task 생성 직후 이벤트가 1회 발행되어야 한다.
- 이벤트 payload에는 `raw_request_hash`가 있어야 한다.
- 이벤트는 Task 상태보다 먼저 기록되면 안 된다.

### `createPlan` 테스트

- 유효한 Task는 `plan_id`, `status=drafted`, `step_count`를 반환해야 한다.
- 존재하지 않는 Task는 `task_not_found`로 실패해야 한다.
- 유효한 Step이 하나도 없으면 `no_valid_steps`로 실패해야 한다.
- `available_tools`가 일부만 있어도 요약 Plan은 생성될 수 있어야 한다.

### `plan.drafted` 테스트

- Plan 초안 생성 직후 이벤트가 1회 발행되어야 한다.
- `step_count`와 `risk_summary`는 Plan 내용과 일치해야 한다.
- Step 상세 전체가 이벤트에 포함되지 않아야 한다.

### Step 선택 테스트

- 읽기 Step은 쓰기 Step보다 먼저 배치돼야 한다.
- 승인 필요 작업은 별도 Step으로 구분돼야 한다.
- 의존성이 있는 Step은 `depends_on`을 가져야 한다.
- Tool이 매핑되지 않는 항목은 Step으로 강제 생성되지 않아야 한다.

### 경계 테스트

- 동일 `task_id`에 대해 재계획하면 새 `plan.drafted` 이벤트가 남아야 한다.
- `createPlan`은 실행 상태를 변경하지 않아야 한다.
- 이 문서의 계약은 UI 없이도 검증 가능해야 한다.

