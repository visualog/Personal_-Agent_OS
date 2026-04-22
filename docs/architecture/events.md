# Event Contract

상태: Draft v0.1
최종 갱신: 2026-04-22

## 1. 목적

Personal Agent OS의 모든 중요한 상태 변경은 이벤트로 기록한다.

이벤트는 다음 목적을 가진다.

1. 컴포넌트 간 결합도 낮추기
2. Task 실행 흐름 복원
3. 정책 판정과 도구 실행 감사
4. 실패 재현과 회귀 테스트
5. 사용자에게 "왜 이렇게 했는지" 설명

## 2. 이벤트 작성 원칙

- 상태 변경은 이벤트 없이 일어나지 않는다.
- 이벤트는 append-only로 취급한다.
- 민감 값은 payload에 원문으로 저장하지 않는다.
- 모든 이벤트는 `trace_id`를 가져야 한다.
- 사용자가 시작한 하나의 요청은 하나의 `task_id`와 하나 이상의 `trace_id`를 가질 수 있다.
- retry 또는 replan은 기존 이벤트를 수정하지 않고 새 이벤트를 추가한다.

## 3. 공통 이벤트 스키마

| 필드 | 타입 | 필수 | 설명 |
| --- | --- | --- | --- |
| `event_id` | string | yes | 이벤트 고유 ID |
| `event_type` | string | yes | 예: `task.created` |
| `timestamp` | string | yes | ISO 8601 UTC timestamp |
| `actor` | string | yes | `user`, `agent`, `system`, `tool` |
| `task_id` | string | no | 관련 Task ID |
| `trace_id` | string | yes | 실행 흐름 추적 ID |
| `correlation_id` | string | no | 외부 요청 또는 이전 이벤트 연결 ID |
| `payload` | object | yes | 이벤트별 데이터. 민감 값은 redaction 필요 |

예시:

```json
{
  "event_id": "evt_01",
  "event_type": "task.created",
  "timestamp": "2026-04-22T00:00:00.000Z",
  "actor": "user",
  "task_id": "task_01",
  "trace_id": "trace_01",
  "correlation_id": null,
  "payload": {
    "title": "프로젝트 상태 정리",
    "channel": "web",
    "sensitivity": "internal"
  }
}
```

## 4. 필수 이벤트 목록

| 이벤트 | 발행 주체 | 목적 |
| --- | --- | --- |
| `task.created` | Task Intake | 사용자 요청이 Task로 등록됨 |
| `task.updated` | Task Manager | Task 필드 또는 상태 변경 |
| `plan.drafted` | Planner | Plan 초안 생성 |
| `plan.updated` | Planner | Plan 재작성 또는 수정 |
| `step.ready` | Planner | Step이 실행 가능 상태가 됨 |
| `step.approval_requested` | Policy Engine | 사용자 승인 필요 |
| `step.approved` | Approval Flow | 사용자가 Step 실행 승인 |
| `step.denied` | Approval Flow | 사용자가 Step 실행 거절 |
| `action.started` | Executor | Tool action 실행 시작 |
| `action.succeeded` | Executor | Tool action 성공 |
| `action.failed` | Executor | Tool action 실패 |
| `policy.evaluated` | Policy Engine | 정책 판정 완료 |
| `risk.flagged` | Policy Engine | `require_approval` 또는 `deny`로 판정된 위험 신호 기록 |
| `memory.read` | Memory Store | 메모리 조회 |
| `memory.written` | Memory Store | 메모리 저장 |
| `audit.recorded` | Audit Log | 감사 로그 기록 완료 |

## 5. Payload 기준

### `task.created`

```json
{
  "title": "string",
  "raw_request_hash": "string",
  "channel": "web | cli | telegram | slack",
  "priority": "low | normal | high",
  "sensitivity": "public | internal | personal | sensitive"
}
```

수용 기준:

- `raw_request` 원문은 저장 정책에 따라 별도 저장한다.
- 이벤트에는 원문 대신 hash 또는 redacted summary를 우선 사용한다.

### `plan.drafted`

```json
{
  "plan_id": "string",
  "step_count": 3,
  "requires_approval": true,
  "risk_summary": {
    "low": 2,
    "medium": 0,
    "high": 1,
    "critical": 0
  }
}
```

수용 기준:

- Step 상세는 Plan 저장소에서 조회한다.
- 이벤트 payload는 요약과 연결 ID 중심으로 유지한다.

### `policy.evaluated`

```json
{
  "policy_decision_id": "string",
  "step_id": "string",
  "tool_name": "workspace.read_file",
  "decision": "allow | require_approval | deny",
  "risk_level": "low | medium | high | critical",
  "required_capabilities": ["filesystem.read"],
  "reasons": ["workspace_scope_allowed"],
  "deny_reasons": []
}
```

수용 기준:

- 모든 Tool 실행 전 반드시 발행한다.
- `decision=deny`인 경우 Executor는 실행하지 않는다.

### `risk.flagged`

```json
{
  "policy_decision_id": "string",
  "step_id": "string",
  "tool_name": "workspace.read_file",
  "decision": "require_approval | deny",
  "risk_level": "low | medium | high | critical",
  "required_capabilities": ["workspace.write"],
  "reasons": ["medium risk capability requires approval"],
  "deny_reasons": [],
  "summary": "workspace.read_file requires approval"
}
```

수용 기준:

- `policy.evaluated` 직후에만 발행한다.
- `decision=allow`인 경우에는 발행하지 않는다.
- `policy_decision_id`로 같은 정책 판정과 연결 가능해야 한다.
- 사용자 승인 대기와 정책 거절은 모두 별도 risk signal로 필터링 가능해야 한다.

### `step.approval_requested`

```json
{
  "approval_id": "string",
  "step_id": "string",
  "summary": "string",
  "risk_reasons": ["external_write"],
  "expires_at": "2026-04-22T00:10:00.000Z"
}
```

수용 기준:

- 승인 요청은 사용자에게 보여줄 수 있는 문장으로 설명 가능해야 한다.
- 승인 요청에는 실행 결과의 영향 범위가 포함되어야 한다.

### `action.started`

```json
{
  "action_id": "string",
  "step_id": "string",
  "tool_name": "workspace.read_file",
  "idempotency_key": "string",
  "timeout_ms": 30000
}
```

수용 기준:

- `policy.evaluated` 없이 발행되면 안 된다.
- 동일 `idempotency_key`의 중복 실행 정책이 정의되어야 한다.

### `action.succeeded`

```json
{
  "action_id": "string",
  "step_id": "string",
  "tool_name": "workspace.read_file",
  "output_ref": "artifact_01",
  "summary": "파일 3개를 읽음"
}
```

수용 기준:

- 큰 output은 이벤트에 직접 넣지 않고 artifact reference로 연결한다.
- 사용자에게 보여줄 summary가 있어야 한다.

### `action.failed`

```json
{
  "action_id": "string",
  "step_id": "string",
  "tool_name": "workspace.read_file",
  "error_code": "permission_denied",
  "retryable": false,
  "summary": "workspace 밖 파일 접근이 차단됨"
}
```

수용 기준:

- 정책 실패와 도구 실패는 error code로 구분한다.
- retry 가능 여부를 명시한다.

### `memory.written`

```json
{
  "memory_id": "string",
  "memory_class": "ephemeral | project | personal | sensitive | blocked",
  "source_task_id": "string",
  "retention": "session | project | 30d | permanent",
  "redacted": true
}
```

수용 기준:

- `sensitive`와 `blocked`는 기본적으로 장기 저장되지 않는다.
- 저장 이유와 출처 Task를 추적할 수 있어야 한다.

## 6. 이벤트 순서 예시

이 절은 두 층으로 읽는다.

- `현재 구현`: 지금 코드베이스에서 이미 관찰되는 순서
- `Lifecycle 이벤트 구현 후`: `step.ready`, `policy.evaluated`, `task.updated`, `plan.updated`를 실제 발행하도록 붙였을 때의 목표 순서

구현자는 새 이벤트를 추가할 때 기존 이벤트 의미를 바꾸지 말고, 기존 순서 사이에 끼워 넣는 방식으로 확장해야 한다.

### 읽기 중심 작업

현재 구현:

1. `task.created`
2. `plan.drafted`
3. `action.started`
4. `action.succeeded`

Lifecycle 이벤트 구현 후:

1. `task.created`
2. `plan.drafted`
3. `step.ready`
4. `policy.evaluated` with `decision=allow`
5. `action.started`
6. `action.succeeded`
7. `plan.updated` with the step marked `completed`
8. `task.updated` with `status=completed`

### 승인 필요 작업

현재 구현:

1. `task.created`
2. `plan.drafted`
3. `action.started`
4. `step.approval_requested`

Lifecycle 이벤트 구현 후:

1. `task.created`
2. `plan.drafted`
3. `step.ready`
4. `policy.evaluated` with `decision=require_approval`
5. `step.approval_requested`
6. `plan.updated` with the step marked `waiting_approval`
7. `task.updated` with `status=waiting_approval`

### 승인 후 재개

현재 구현:

1. `step.approved`
2. `action.started`
3. `action.succeeded` or `step.approval_requested` or `action.failed`

Lifecycle 이벤트 구현 후:

1. `step.approved`
2. `step.ready`
3. `policy.evaluated` with `decision=allow`
4. `action.started`
5. `action.succeeded`
6. `plan.updated` with the resumed step marked `completed`
7. `task.updated` with `status=completed`

### 승인 거절

현재 구현:

1. `step.denied`

Lifecycle 이벤트 구현 후:

1. `step.denied`
2. `plan.updated` with the step marked `blocked`
3. `task.updated` with `status=failed`

## 7. 구현 규칙: lifecycle 이벤트를 붙일 때의 위치

`step.ready`, `policy.evaluated`, `plan.updated`, `task.updated`는 아래 위치에 고정한다.

### `step.ready`

- 발행 시점: Orchestrator가 실제 실행 대상으로 고른 직후
- 한 Step을 다시 실행할 때도 다시 발행한다
- approval resume에서는 `step.approved` 뒤, `policy.evaluated` 앞에 와야 한다

최소 payload:

```json
{
  "plan_id": "string",
  "step_id": "string",
  "tool_name": "string",
  "sequence": 0,
  "status": "ready"
}
```

### `policy.evaluated`

- 발행 시점: Gateway 호출 전에 정책 판정이 정해진 직후
- `action.started`보다 먼저 와야 한다
- `decision=deny` 또는 `decision=require_approval`인 경우에도 반드시 남긴다

최소 payload:

```json
{
  "policy_decision_id": "string",
  "step_id": "string",
  "tool_name": "string",
  "decision": "allow | require_approval | deny",
  "risk_level": "low | medium | high | critical",
  "required_capabilities": ["string"],
  "reasons": ["string"]
}
```

### `plan.updated`

- 발행 시점: Step 결과가 Plan 상태를 바꾼 직후
- `plan.drafted`를 대체하지 않는다
- 한 번의 Step 시도마다 최대 한 번만 발행한다

대표 상태 변화:

- `drafted -> partially_approved`
- `drafted -> completed`
- `partially_approved -> completed`
- `drafted -> failed`

### `task.updated`

- 발행 시점: 같은 Step 결과를 Task 상태로 투영한 직후
- 항상 같은 시도의 `plan.updated` 뒤에 온다

대표 상태 변화:

- `created -> waiting_approval`
- `created -> completed`
- `waiting_approval -> completed`
- `waiting_approval -> failed`

## 8. 순서 불변식

Lifecycle 이벤트 구현 후에는 아래 불변식을 지켜야 한다.

1. `task.created`는 같은 trace 안에서 항상 최초다.
2. `plan.drafted`는 첫 `step.ready`보다 먼저 온다.
3. `policy.evaluated`는 같은 Step의 `action.started`보다 먼저 온다.
4. `decision=require_approval`이면 같은 시도에서 `action.started`를 발행하지 않는다.
5. `step.approval_requested` 뒤에는 반드시 `plan.updated`, `task.updated`가 따라온다.
6. `step.denied` 뒤에는 Tool 실행 이벤트가 오지 않는다.
7. `action.succeeded` 또는 `action.failed` 뒤에는 해당 Step 결과를 반영한 `plan.updated`, `task.updated`가 따라온다.
2. `plan.drafted`
3. `policy.evaluated` with `decision=require_approval`
4. `step.approval_requested`
5. `step.approved`
6. `action.started`
7. `action.succeeded`
8. `audit.recorded`

### 차단 작업

1. `task.created`
2. `plan.drafted`
3. `policy.evaluated` with `decision=deny`
4. `risk.flagged`
5. `action.failed` with `error_code=policy_denied`
6. `audit.recorded`

## 7. Redaction 규칙

이벤트 payload에 직접 저장하지 않는 값:

- 비밀번호
- API key
- OAuth token
- 개인식별번호
- 이메일 본문 원문
- 파일 본문 원문
- 결제 정보
- private key

대신 저장할 값:

- hash
- redacted summary
- artifact reference
- byte length
- MIME type
- source label

## 8. Open Decisions

1. 이벤트 저장소를 SQLite 단일 테이블로 시작할지, append-only log 파일을 병행할지 결정해야 한다.
2. artifact reference의 저장 위치와 만료 정책을 정해야 한다.
3. `trace_id`와 `correlation_id`를 외부 채널 메시지와 어떻게 매핑할지 정해야 한다.
4. 감사 로그 무결성 검증을 MVP에 포함할지, M2 이후로 미룰지 결정해야 한다.
