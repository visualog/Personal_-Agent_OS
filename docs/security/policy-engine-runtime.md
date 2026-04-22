# Policy Engine Runtime

작성일: 2026-04-22  
상태: Draft v0.1  
기준 문서: `docs/security/policy-and-permissions.md`

## 0. 목적

이 문서는 최소 정책 엔진 런타임의 구현 기준이다. 런타임은 tool execution 직전에 `evaluatePolicy`를 호출해, 실제 실행 여부와 승인 필요 여부를 결정한다.

핵심 목표는 다음과 같다.

- 실행 전에 모든 정책 판단을 끝낸다.
- 허용, 승인 필요, 차단을 한 함수로 일관되게 처리한다.
- 차단 사유를 사람이 읽을 수 있게 남기고, 감사 로그로도 집계 가능하게 한다.
- 승인된 step만 실제 실행되도록 보장한다.

## 1. `evaluatePolicy` API

최소 형태의 입력과 출력은 다음을 따른다.

```ts
evaluatePolicy(action: PolicyAction): PolicyEvaluationResult
```

`PolicyAction`은 순수 데이터이며 `evaluatePolicy`는 부작용 없이 판정 결과만 반환한다. 이벤트 발행과 감사 로그 기록은 호출자가 `PolicyEvaluationResult`를 받아 별도 단계에서 수행한다.

## 2. `PolicyAction` 필드

`PolicyAction`은 정책 판단의 최소 단위다. 현재 구현체는 다음 필드를 지원한다.

- `id`: action 식별자
- `step_id`: 이 action을 만든 Step ID
- `tool_name`: 실행하려는 Tool 이름
- `requested_capabilities`: Step/Tool이 요구하는 capability 목록
- `granted_capabilities`: 현재 세션 또는 Tool Gateway가 허용한 capability 목록
- `risk_level`: `low | medium | high | critical`
- `scope_allowed`: 사용자 요청 범위 안인지 여부
- `approval_granted`: 승인 완료 여부
- `audit_available`: 감사 로그를 남길 수 있는지 여부
- `tool_registered`: Tool Registry에 등록된 도구인지 여부
- `sandbox_matched`: sandbox 조건을 만족하는지 여부

권장 규칙:

- `requested_capabilities`는 `granted_capabilities`의 부분집합이어야 한다.
- `scope_allowed`가 `false`이면 risk level과 무관하게 차단한다.
- `audit_available`이 `false`이면 실행하지 않는다.
- `tool_registered`와 `sandbox_matched`는 기본적으로 `true`여야 한다.

## 3. 결정 규칙

정책 엔진은 아래 순서대로 판단한다.

1. 요청 capability 중 허용되지 않은 값이 있으면 `deny`.
2. `tool_registered === false`이면 `deny`.
3. `sandbox_matched === false`이면 `deny`.
4. `audit_available === false`이면 `deny`.
5. `scope_allowed === false`이면 `deny`.
6. `critical` action은 MVP에서 `deny`.
7. `high` action은 `approval_granted === true`가 아니면 `require_approval`.
8. `medium` action이 쓰기/전송/배포/결제/관리/브라우저 capability를 요구하면 승인 전까지 `require_approval`.
9. 나머지 조건이 모두 충족되면 `allow`.

추가 규칙:

- `requested_capabilities`는 `granted_capabilities`의 부분집합이어야 한다.
- `write` 계열은 같은 대상의 `read`보다 항상 더 높게 평가한다.
- `riskHint`가 낮아도 action이 파괴적이면 낮게 내려가지 않는다.
- `approval.status`가 `rejected` 또는 `expired`면 재사용하지 않는다.

## 4. 차단 사유

`denyReason`은 다음 표준 코드만 사용한다.

- `missing_capability`
- `scope_outside_request`
- `risk_exceeds_policy`
- `critical_action_disabled`
- `approval_required_not_granted`
- `approval_expired`
- `sandbox_mismatch`
- `tool_not_registered`
- `input_schema_invalid`
- `output_schema_unusable`
- `policy_conflict`
- `audit_unavailable`
- `permission_revoked`
- `system_lockdown`

표현 규칙:

- 짧은 코드와 사람이 읽는 문장을 함께 남긴다.
- 문장은 무엇이 부족한지와 다음 행동이 무엇인지 드러내야 한다.
- 같은 실패라도 원인이 다르면 코드도 달라야 한다.

예:

- `missing_capability`: `filesystem.write` capability가 없어 파일 수정이 차단됨
- `scope_outside_request`: 요청 범위를 벗어난 삭제 작업이어서 차단됨
- `critical_action_disabled`: `external.send`는 MVP 정책상 금지됨

## 5. 승인 동작

승인이 필요한 경우 런타임은 실행을 멈추고 `require_approval`를 반환한다.

승인 판단 기준:

- `medium` 이상의 쓰기 작업은 기본적으로 승인 대상이다.
- `high` risk 작업은 승인 없이는 실행하지 않는다.
- `critical` action은 원칙적으로 차단하며, 문서에 별도 예외가 없으면 승인으로도 풀지 않는다.

승인 요청에는 다음이 포함되어야 한다.

- 작업 이름
- 영향 받는 대상
- 예상 변경
- risk level
- 거절 시 실행이 중단된다는 사실

승인 완료 후에도 다음 검사를 다시 수행해야 한다.

- approval이 현재 step과 정확히 매칭되는지
- 만료되지 않았는지
- scope나 context가 바뀌지 않았는지

## 6. 이벤트와 감사 로그

정책 런타임은 매 판정마다 이벤트를 남긴다. 로그가 없으면 `deny`한다.

`PolicyEvaluationResult`는 이벤트와 감사 로그 작성에 필요한 정보를 제공한다. 호출자는 최소한 아래 필드를 `policy.evaluated` 이벤트 또는 `AuditRecord`에 반영한다.

- `trace_id`
- `task_id`
- `step_id`
- `tool_name`
- `requested_capabilities`
- `granted_capabilities`
- `risk_level`
- `decision`
- `deny_reason`
- `approval_id`
- `policy_version`
- `created_at`

이벤트 기대 동작:

- `allow`도 기록한다.
- `require_approval`도 기록한다.
- `deny`는 반드시 reason code를 포함한다.
- 승인 요청과 승인 결과는 같은 `trace_id` 계열로 이어져야 한다.

## 7. 런타임 처리 순서

1. Executor가 `PolicyAction`과 context를 전달한다.
2. Policy Engine이 tool registry와 capability를 확인한다.
3. scope, risk, approval 상태를 평가한다.
4. 결정을 반환하고 audit 이벤트를 생성한다.
5. `allow`일 때만 tool execution을 시작한다.
6. `require_approval`일 때는 실행을 멈추고 승인 큐로 보낸다.
7. `deny`일 때는 실행하지 않고 사유를 반환한다.

## 8. 최소 테스트 시나리오

다음 시나리오는 반드시 통과해야 한다.

1. `workspace.read` action이 들어오면 `allow`가 반환된다.
2. 요청 capability가 허용 capability에 없으면 `deny`와 `missing_capability`가 반환된다.
3. `scope_allowed`가 `false`이면 `deny`와 `scope_outside_request`가 반환된다.
4. `critical` action은 `deny`와 `critical_action_disabled`가 반환된다.
5. `high` action은 승인 전 `require_approval`, 승인 후 `allow`가 반환된다.
6. `medium` action이 쓰기 capability를 요구하면 승인 전 `require_approval`가 반환된다.
7. `tool_registered`가 `false`이면 `deny`와 `tool_not_registered`가 반환된다.
8. `audit_available`이 `false`이면 실행 전에 `deny`와 `audit_unavailable`가 반환된다.
9. `allow` 판정에도 capability, scope, audit 기록이 모두 남는다.

## 9. 구현 메모

- 정책 엔진은 부작용이 없어야 한다.
- 승인 상태 조회와 audit 기록은 정책 판단의 일부로 취급한다.
- `message`는 로그와 UI 모두에서 재사용할 수 있게 간결하게 유지한다.
- 최종 실행 여부는 policy decision 외의 후속 단계에서 다시 덮어쓰지 않는다.
