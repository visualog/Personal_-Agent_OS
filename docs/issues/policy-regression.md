# Policy Regression Scenarios

상태: Draft v0.1  
최종 갱신: 2026-04-22

이 문서는 `PAOS-020`의 정책 회귀 시나리오를 Given/When/Then 형식으로 고정한다.

## Scenario 1: 승인 없는 high action 차단

Given:

- high risk action
- 필요한 capability는 이미 부여됨
- approval은 아직 부여되지 않음

When:

- policy engine이 action을 평가함

Then:

- decision은 `require_approval`
- action은 즉시 실행되지 않음
- reason에 `high risk action requires approval`가 남음

자동 테스트 입력/기대 결과:

- input: `risk_level=high`, `approval_granted=false`
- expect: `decision=require_approval`

## Scenario 2: critical action 기본 금지

Given:

- critical risk action

When:

- policy engine이 action을 평가함

Then:

- decision은 `deny`
- deny reason은 `critical_action_disabled`
- 실행은 절대 시작되지 않음

자동 테스트 입력/기대 결과:

- input: `risk_level=critical`
- expect: `decision=deny`, `deny_reasons=["critical_action_disabled"]`

## Scenario 3: 권한 없는 Tool 호출 차단

Given:

- action이 요구하는 capability가 granted set에 없음

When:

- policy engine 또는 tool gateway가 action을 평가함

Then:

- decision은 `deny`
- deny reason은 `missing_capability`
- 실패 원인이 capability 누락으로 드러남

자동 테스트 입력/기대 결과:

- input: `requested_capabilities=["workspace.write"]`, `granted_capabilities=[]`
- expect: `decision=deny`, `deny_reasons=["missing_capability"]`

## Scenario 4: 민감 메모리 장기 저장 차단

Given:

- memory write 요청
- content 안에 `api_key`, token, secret 같은 민감 정보가 포함됨
- retention은 장기 저장 성격

When:

- memory api가 write를 수행함

Then:

- decision은 `blocked`
- reason은 `sensitive_data_detected`
- memory store에는 저장되지 않음
- `memory.written` 이벤트와 audit record는 남음

자동 테스트 입력/기대 결과:

- input: secret 포함 content + `retention=permanent`
- expect: `decision=blocked`, `store.list().length===0`

## Scenario 5: 감사 로그 누락 탐지

Given:

- action 실행에 필요한 audit channel이 비활성화됨

When:

- policy engine이 action을 평가함

Then:

- decision은 `deny`
- deny reason은 `audit_unavailable`
- 실행은 진행되지 않음

자동 테스트 입력/기대 결과:

- input: `audit_available=false`
- expect: `decision=deny`, `deny_reasons=["audit_unavailable"]`

## Scenario 6: 긴급 정지 중 신규 호출 차단

Given:

- runtime control에서 lockdown이 활성화됨

When:

- 새로운 tool execution이 들어옴

Then:

- decision은 `deny`
- deny reason은 `system_lockdown`
- 실행 handler는 호출되지 않음

자동 테스트 입력/기대 결과:

- input: `system_lockdown=true`
- expect: `decision=deny`, `deny_reasons=["system_lockdown"]`

## Scenario 7: revoke된 capability 사용 차단

Given:

- requested capability는 원래 granted되어 있었음
- 하지만 runtime control이 해당 capability를 revoke함

When:

- action을 다시 평가함

Then:

- decision은 `deny`
- deny reason은 `permission_revoked`

자동 테스트 입력/기대 결과:

- input: `requested_capabilities=["workspace.write"]`, `revoked_capabilities=["workspace.write"]`
- expect: `decision=deny`, `deny_reasons=["permission_revoked"]`

## 메모

- 이 문서는 현재 구현된 정책 강제 경로 기준이다.
- 이후 policy layer가 더 복잡해지면 이 시나리오를 contract-first 회귀 기준으로 유지한다.
