# Policy and Permissions

작성일: 2026-04-22  
상태: Draft v0.1  
기준 문서: `docs/plans/2026-04-21-personal-agent-os-mvp-issue-plan.md`

## 0. 목적

이 문서는 Personal Agent OS MVP에서 정책 엔진, 권한 모델, 승인 게이트, 차단 사유를 구현하는 기준 문서다.

목표는 다음과 같다.

- 모든 실제 도구 실행이 정책 판정과 권한 검사를 통과하도록 한다.
- 위험도가 높은 동작은 기본 차단 또는 승인 요구로 처리한다.
- 거절 사유를 사람이 읽을 수 있는 형태와 디버깅 가능한 형태로 남긴다.
- 사용자 승인 없이 시스템이 임의로 권한 범위를 넓히지 못하게 한다.

## 1. 적용 범위

이 문서는 다음 경로에 적용된다.

- Task Intake가 생성한 Task의 실행 단계
- Planner가 생성한 Step의 tool execution
- Tool Gateway / Executor가 수행하는 실제 도구 호출
- Approval Flow가 관리하는 승인 요청과 결과
- Audit Log에 기록되는 정책 판정 결과

## 2. 기본 원칙

1. 기본 모드는 읽기 중심이다.
2. 쓰기, 삭제, 외부 전송, 배포, 권한 변경, 결제는 기본적으로 금지 또는 승인 대상이다.
3. 정책 판정은 도구 실행 전에 완료되어야 한다.
4. capability가 없으면 호출할 수 없다.
5. risk level이 낮아도 scope를 벗어나면 거절한다.
6. 사용자 승인보다 시스템 정책이 우선한다.
7. 모든 거절은 설명 가능해야 한다.

## 3. Capability 모델

capability는 "이 도구가 무엇을 할 수 있는가"를 나타내는 정적 권한 단위다. 도구 등록 시 capability를 명시하고, Step은 필요한 capability를 요청한다.

### 3.1 Capability 분류

- `workspace.read`
- `workspace.write`
- `filesystem.read`
- `filesystem.write`
- `memory.read`
- `memory.write`
- `approval.request`
- `audit.read`
- `audit.write`
- `external.network.read`
- `external.network.write`
- `external.send`
- `identity.read`
- `identity.write`
- `settings.write`
- `deployment.write`
- `payments.write`
- `browser.automation`
- `admin.override`

### 3.2 capability 해석 규칙

- 하나의 tool은 하나 이상의 capability를 가진다.
- Step은 실제 필요한 최소 capability만 요청한다.
- capability가 모호하면 더 작은 단위로 쪼갠다.
- `write`가 포함되면 기본적으로 `read`보다 높은 위험도로 본다.
- `external.send`, `deployment.write`, `payments.write`, `admin.override`는 항상 고위험 이상으로 분류한다.

## 4. Risk Level 정의

Risk level은 정책 판단의 기본 축이다. 도구와 Step 모두 risk level을 가질 수 있으며, 최종 판정은 더 높은 값을 따른다.

### 4.1 low

허용 조건:

- 로컬 또는 승인된 workspace의 읽기
- 제한된 메타데이터 조회
- 내부 상태 조회
- 비파괴적 요약, 분류, 계산

예:

- 파일 목록 읽기
- 문서 요약
- task 상태 조회

### 4.2 medium

허용 조건:

- 제한된 쓰기
- 초안 생성
- 내부 데이터 업데이트
- 승인 가능한 범위의 변경 제안

예:

- 이메일 초안 작성
- 메모리 후보 저장
- 사용자 승인 전 draft 생성

### 4.3 high

허용 조건:

- 외부 시스템에 영향을 줄 수 있는 쓰기
- 사용자 데이터의 구조적 변경
- 민감한 컨텍스트를 다루는 도구 호출

예:

- 파일 수정
- 권한 설정 변경
- 외부 서비스에 제출 직전 상태 만들기

### 4.4 critical

기본 규칙:

- 기본 금지다.
- 명시적으로 허용된 MVP 예외가 없으면 실행하지 않는다.

예:

- 삭제
- 실제 전송
- 결제
- 배포
- 관리자 권한 상승

## 5. Approval Gates

정책 엔진은 Step별로 `allow`, `require_approval`, `deny` 중 하나를 반환한다.

### 5.1 allow

다음이 모두 충족될 때 허용한다.

- capability가 존재한다.
- tool의 sandbox 조건이 충족된다.
- risk level이 허용 임계값 이하이다.
- scope가 사용자 요청과 일치한다.
- deny rule에 걸리지 않는다.

### 5.2 require_approval

다음 중 하나라도 해당하면 승인 요구로 보낸다.

- medium 이상의 쓰기 작업
- high risk이지만 MVP에서 제한적으로 운영 가능한 작업
- scope가 넓지만 사용자가 명시적으로 요청한 경우
- 사용자 데이터 외부 전송 직전 단계
- 작업이 되돌리기 어렵지 않지만 확인이 필요한 경우

승인 요청에는 반드시 포함되어야 한다.

- 요청 작업
- 영향 범위
- 변경 대상
- 예상 결과
- risk level
- 거절 시 중단됨을 명시한 문구

### 5.3 deny

다음의 경우 즉시 차단한다.

- capability가 없음
- scope 밖 요청
- critical action인데 MVP에서 허용되지 않음
- 사용자 승인으로도 허용하지 않는 금지 항목
- 정책 위반이 복수로 중첩됨
- audit 대상인데 기록 경로가 없음

## 6. 승인 게이트 규칙

### 6.1 승인 필수 조건

승인이 필요할 때는 실행 전에 다음 상태가 되어야 한다.

- Approval record 생성
- 사용자에게 요약 설명 노출
- 승인 상태가 `approved`로 변함
- 승인된 Step과 요청한 Step이 정확히 매칭됨

### 6.2 승인 만료

- 승인 요청은 시간 제한을 가진다.
- 만료된 승인은 재사용하지 않는다.
- 변경된 plan이나 context에는 이전 승인을 그대로 적용하지 않는다.

### 6.3 부분 승인

- Plan의 일부 Step만 승인될 수 있다.
- 승인되지 않은 Step은 `blocked` 또는 `skipped`로 종료한다.
- 부분 승인 사유는 Audit Log에 남긴다.

## 7. Deny Reasons

거절 사유는 사람이 읽을 수 있어야 하고, 기계적으로 집계할 수 있어야 한다.

### 7.1 표준 deny reason 코드

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

### 7.2 설명 규칙

각 거절 기록은 다음을 포함해야 한다.

- 어떤 rule이 적용됐는지
- 무엇이 부족했는지
- 사용자가 무엇을 바꿔야 하는지

예:

- "filesystem.write capability가 없어 파일 수정이 차단됨"
- "이 요청은 delete action을 포함하므로 MVP에서 금지됨"
- "승인이 없어서 external.send 실행을 막음"

## 8. Tool Gateway 판정 흐름

1. Step이 tool_name, input, capability, risk hint를 제출한다.
2. Gateway가 tool registry에서 등록 정보를 조회한다.
3. Policy Engine이 capability와 risk level을 계산한다.
4. deny rule을 먼저 검사한다.
5. 승인 필요 여부를 판정한다.
6. 허용되면 tool 실행을 시작한다.
7. 결과와 판정 근거를 Audit Log에 남긴다.

## 9. 기본 정책 매트릭스

| 동작 | 기본 risk | 기본 판정 | 비고 |
| --- | --- | --- | --- |
| workspace read | low | allow | 허용 workspace만 |
| filesystem read | low | allow | 읽기 전용 |
| memory read | low | allow | purpose 필요 |
| draft 생성 | medium | allow 또는 approval | 외부 전송 없음 |
| workspace write | high | approval | 되돌림 가능성 고려 |
| memory write | medium | approval | 분류 필수 |
| external send | critical | deny | MVP 금지 |
| delete | critical | deny | MVP 금지 |
| deployment write | critical | deny | MVP 금지 |
| payments write | critical | deny | MVP 금지 |
| admin override | critical | deny | MVP 금지 |

## 10. 긴급 정지와 권한 회수

긴급 정지 상태에서는 다음이 가능해야 한다.

- 신규 action 실행 차단
- 진행 중인 작업 중단 시도
- 승인 큐 보류
- 특정 capability 회수

회수되면 해당 capability를 요구하는 Step은 즉시 `blocked`가 된다.

## 11. 감사 로그 요구사항

정책 판정은 반드시 감사 로그에 남아야 한다.

필수 필드:

- `trace_id`
- `task_id`
- `step_id`
- `tool_name`
- `requested_capabilities`
- `resolved_capabilities`
- `risk_level`
- `decision`
- `deny_reason`
- `approval_id`
- `policy_version`
- `created_at`

## 12. 수용 기준

다음 테스트가 통과해야 이 문서의 정책 구현이 완료된 것으로 본다.

### 12.1 Given / When / Then

1. Given workspace read Step, When policy evaluates it, Then `allow`가 반환된다.
2. Given tool이 `filesystem.write` capability를 요청하지만 등록되어 있지 않으면, Then `deny`와 `missing_capability`가 반환된다.
3. Given `external.send` action, When policy evaluates it, Then `deny`와 `critical_action_disabled`가 반환된다.
4. Given `memory.write` Step, When approval is missing, Then `require_approval`가 반환된다.
5. Given 승인 만료된 approval, When Step executes, Then `deny`와 `approval_expired`가 반환된다.
6. Given scope 밖 파일 삭제 요청, When policy evaluates it, Then `deny`와 `scope_outside_request`가 반환된다.
7. Given audit store unavailable, When action would execute, Then `deny`와 `audit_unavailable`가 반환된다.
8. Given partial approval, When only one Step is approved, Then 나머지 Step은 실행되지 않는다.

### 12.2 검증 포인트

- 모든 deny는 reason code를 가진다.
- 승인 없는 high/critical action은 실행되지 않는다.
- `allow` 판정에도 capability와 scope 검사가 모두 수행된다.
- 감사 로그에 정책 판정 근거가 남는다.

