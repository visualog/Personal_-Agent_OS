# Runtime Control

상태: Draft v0.1  
최종 갱신: 2026-04-22

이 문서는 Personal Agent OS의 긴급 정지(kill switch)와 capability 권한 회수 런타임 계약을 정의한다.

## 1. 목적

Runtime Control은 코어 런타임 바깥에서 즉시 실행 중단 정책을 걸 수 있게 하는 최소 안전장치다.

현재 구현 범위:

- system-wide lockdown on/off
- capability revoke/restore
- 관련 이벤트 발행
- 관련 audit record 기록
- Tool Gateway / Policy Engine 차단 연동

## 2. Lockdown 규칙

- lockdown이 활성화되면 신규 Tool 호출은 정책 단계에서 거절된다.
- 이미 시작된 handler를 강제로 중단하지는 않는다.
- 즉, 현재 단계는 `새 호출 차단` 중심이고 `실행 중 강제 취소`는 아직 없다.

deny reason:

- `system_lockdown`

## 3. Capability Revocation 규칙

- 특정 capability가 revoke되면, 해당 capability를 요구하는 Tool 호출은 거절된다.
- granted capability가 있어도 revoke가 우선한다.
- capability restore 이후에는 다시 기존 정책 흐름으로 돌아간다.

deny reason:

- `permission_revoked`

## 4. 이벤트

### `safety.lockdown_enabled`

- payload:
  - `reason`
  - `active: true`

### `safety.lockdown_disabled`

- payload:
  - `reason`
  - `active: false`

### `capability.revoked`

- payload:
  - `capability`
  - `reason`
  - `active: true`

### `capability.restored`

- payload:
  - `capability`
  - `reason`
  - `active: false`

## 5. 현재 구현 한계

- running action 강제 취소 없음
- 예약 작업/cron/heartbeat 연동 없음
- revoke 범위는 현재 전역 in-memory state
- 세션/사용자 단위 revoke 분리 없음

## 6. 수용 기준

- lockdown이 켜지면 새 Tool 호출은 거절된다.
- revoke된 capability를 요구하는 Tool 호출은 거절된다.
- lockdown/revoke/restore는 이벤트와 audit에 남는다.
- 중복 enable/revoke 호출은 중복 이벤트를 만들지 않는다.
