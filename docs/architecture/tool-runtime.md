# Tool Registry and Tool Gateway

상태: Draft v0.1  
최종 갱신: 2026-04-22

이 문서는 Personal Agent OS 구현자가 Tool 등록과 실행 경로를 바로 코드로 옮길 수 있도록 정리한 문서다.  
이 단계는 UI 미리보기나 화면 설계가 아니라, 실제 런타임 계약과 실패 처리를 정의하는 문서다.

## 1. 역할 분리

### Tool Registry

등록된 Tool의 메타데이터와 스키마를 보관한다.

책임:

- Tool 이름과 버전을 유일하게 관리한다.
- 입력/출력 스키마를 검증 가능한 형태로 제공한다.
- capability, risk, approval 요구사항, sandbox 조건을 노출한다.
- `enabled | disabled | deprecated` 같은 등록 상태를 관리한다.
- 정책 엔진과 Gateway가 동일한 ToolDefinition을 참조하도록 한다.

### Tool Gateway

실제 Tool 실행의 유일한 진입점이다.

책임:

- Step 또는 Action 요청을 받고 ToolDefinition을 조회한다.
- 입력을 schema로 검증한다.
- Policy Engine에 사전 판정을 요청한다.
- 승인 필요 여부를 반영해 실행을 차단하거나 진행한다.
- 실행 결과, 실패, timeout, retry 정보를 표준 형식으로 반환한다.
- 직접 실행 우회 경로를 막는다.

## 2. ToolDefinition 필드

필수 필드:

| 필드 | 설명 |
| --- | --- |
| `name` | Tool 고유 이름. 예: `workspace.read_file` |
| `version` | Tool 계약 버전. 호환성 판단에 사용 |
| `description` | 사람이 읽을 수 있는 간단한 설명 |
| `input_schema` | 실행 입력 JSON Schema |
| `output_schema` | 성공 결과 JSON Schema |
| `capabilities` | 필요한 capability 목록 |
| `default_risk` | `low | medium | high | critical` |
| `requires_approval` | 기본 승인 필요 여부 |
| `sandbox` | 실행 환경 제약 정보 |
| `timeout_ms` | 기본 timeout |
| `idempotency_supported` | 중복 실행 제어 가능 여부 |
| `status` | `enabled | disabled | deprecated` |
| `owner` | 유지보수 주체 |
| `created_at` | 등록 시각 |
| `updated_at` | 수정 시각 |

권장 규칙:

- `name + version` 조합은 고정된 실행 계약으로 본다.
- `disabled` Tool은 조회 가능하지만 실행할 수 없다.
- `deprecated` Tool은 새 계획 생성에 사용하지 않는다.
- `requires_approval=true`라도 정책이 더 강하게 `deny`할 수 있다.

## 3. Gateway 실행 흐름

1. Executor 또는 Planner가 `tool_name`, `input`, `trace_id`, `step_id`를 넘긴다.
2. Gateway가 Registry에서 ToolDefinition을 조회한다.
3. `status`가 `enabled`인지 확인한다.
4. `input_schema`로 입력을 검증한다.
5. capability, workspace scope, risk를 기준으로 Policy Engine에 `PolicyDecision`을 요청한다.
6. `deny`면 실행하지 않고 종료한다.
7. `require_approval`면 Approval 존재 여부를 확인하고 없으면 대기 상태로 돌린다.
8. `allow`이면 sandbox와 timeout 조건을 적용해 Tool을 실행한다.
9. 실행 결과를 `success | failure | timeout | canceled` 중 하나로 표준화한다.
10. 결과 요약과 artifact reference를 반환하고 이벤트를 남긴다.

실행 중 재시도 규칙:

- 동일 `idempotency_key`가 있으면 중복 실행을 막는다.
- retry 가능 실패만 재시도한다.
- policy 재판정이 필요하면 새 `PolicyDecision`을 기록한다.

## 4. Policy Interaction

Tool Gateway는 정책 우회가 아니라 정책 실행의 하위 단계다.

판정 순서:

1. Registry 조회
2. 입력 검증
3. 정적 위험 평가
4. Policy Engine 판정
5. 승인 상태 확인
6. 최종 실행 허가

정책이 보는 핵심 값:

- `tool_name`
- `capabilities`
- `default_risk`
- `sandbox`
- `workspace scope`
- `approval` 상태
- `trace` 컨텍스트

규칙:

- 정책 결과는 실행보다 먼저 생성된다.
- `allow`가 아니면 Gateway는 실행을 시작하지 않는다.
- 승인은 정책을 대체하지 못한다. 승인 후에도 `deny`면 실행 불가다.

## 5. Statuses and Results

### Registry status

- `enabled`: 실행 허용
- `disabled`: 운영상 중지, 실행 차단
- `deprecated`: 신규 사용 금지, 기존 참조는 유지 가능

### Execution status

- `pending`: 입력 검증 또는 정책 판정 대기
- `authorized`: 정책과 승인 통과
- `running`: 실제 Tool 실행 중
- `succeeded`: 정상 종료
- `failed`: 복구 가능한/불가능한 실패
- `timeout`: timeout 초과
- `canceled`: 사용자 또는 상위 흐름 중단

### Result envelope

```json
{
  "action_id": "act_01",
  "tool_name": "workspace.read_file",
  "status": "succeeded",
  "output_ref": "artifact_01",
  "summary": "파일 3개를 읽음",
  "retryable": false,
  "error_code": null
}
```

수용 기준:

- 큰 결과는 직접 payload에 넣지 말고 `output_ref`로 분리한다.
- 실패 시 `error_code`와 `retryable`을 항상 포함한다.
- 성공 시 사용자 표시용 summary를 최소 1개 제공한다.

## 6. Failure Modes

| 실패 유형 | 설명 | Gateway 처리 |
| --- | --- | --- |
| `tool_not_found` | Registry에 Tool이 없음 | 즉시 종료, `failed` |
| `tool_disabled` | 등록은 됐지만 비활성화됨 | 실행 차단 |
| `schema_invalid` | 입력이 schema와 불일치 | 실행 차단 |
| `policy_denied` | 정책이 거부함 | 실행 차단, 감사 기록 |
| `approval_missing` | 승인 필요한데 승인 없음 | `pending` 또는 `waiting_approval` |
| `sandbox_violation` | 허용된 실행 범위를 벗어남 | `failed` |
| `timeout` | timeout 초과 | 중단 후 `timeout` |
| `tool_crash` | Tool 프로세스 오류 | `failed`, 재시도 여부 판단 |
| `transient_io` | 네트워크/임시 I/O 오류 | retry 후보 |
| `result_invalid` | Tool 결과가 output schema 위반 | `failed` |

공통 규칙:

- 정책 실패와 실행 실패는 다른 error code를 쓴다.
- retry 가능 실패만 자동 재시도한다.
- 실패 기록은 지우지 않고 누적한다.

## 7. Test Scenarios

### Registry tests

- 유효한 ToolDefinition 등록 시 조회 가능해야 한다.
- 같은 `name + version` 중복 등록은 거부해야 한다.
- `disabled` Tool은 조회되지만 실행 대상에서 제외돼야 한다.
- `deprecated` Tool은 새 Step 생성 시 추천 목록에서 빠져야 한다.

### Gateway tests

- schema가 맞지 않으면 Policy 호출 전에 차단해야 한다.
- `allow` 판정 후에만 실제 실행을 시작해야 한다.
- `require_approval`인데 승인 없으면 실행하지 않아야 한다.
- `deny`면 어떤 sandbox도 열지 않아야 한다.
- timeout 초과 시 실행이 중단되고 `timeout` 결과가 남아야 한다.

### Policy interaction tests

- capability가 부족하면 `deny`가 나와야 한다.
- workspace scope 밖 입력은 차단돼야 한다.
- `requires_approval=true` Tool은 승인 없이 `running`으로 가지 않아야 한다.
- 동일 요청에 대해 재판정이 발생하면 새 `PolicyDecision`이 추가돼야 한다.

### Result tests

- 성공 결과는 schema를 만족해야 한다.
- 큰 output은 artifact reference로 분리돼야 한다.
- 실패 결과는 `error_code`, `retryable`, `summary`를 포함해야 한다.
- 동일 `idempotency_key`는 중복 실행되지 않아야 한다.

