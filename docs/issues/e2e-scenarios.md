# E2E Scenarios

상태: Draft v0.1  
최종 갱신: 2026-04-22

이 문서는 `PAOS-021`의 대표 E2E 시나리오를 현재 구현 기준으로 fixture-like 형태로 정리한다.

## Scenario A: 프로젝트 상태 정리

요청:

- "이 프로젝트 현재 상태를 정리하고 다음 작업을 제안해줘"

현재 구현 fixture:

1. Task가 생성된다.
2. Planner가 workspace list/read step을 만든다.
3. low-risk workspace read가 허용된다.
4. action이 성공한다.
5. `task.updated`, `plan.updated`, `action.succeeded`가 남는다.
6. Audit Log에서 요청부터 실행까지 추적 가능하다.

검증 포인트:

- task completed
- plan completed
- 모든 step succeeded
- risk.flagged 없음
- audit에 action.succeeded 존재

## Scenario B: 이메일 초안 작성

요청:

- "어제 논의한 내용을 바탕으로 답장 초안을 만들어줘. 보내지는 마."

현재 구현 fixture:

- 실제 Gmail connector는 아직 없으므로, approval-required write action으로 등가 검증한다.

흐름:

1. Task가 생성된다.
2. 첫 step은 low-risk read로 통과한다.
3. 다음 step은 medium-risk write로 `require_approval` 판정된다.
4. `step.approval_requested`와 `risk.flagged`가 남는다.
5. 승인 후 같은 step이 재실행되어 성공한다.
6. Audit Log에 approval과 resumed success가 모두 남는다.

검증 포인트:

- 초기 task status는 waiting_approval
- approval 1건 생성
- 승인 후 task completed
- audit에 `step.approved`, `action.succeeded` 존재

## Scenario C: 위험 작업 차단

요청:

- "오래된 파일을 정리해서 삭제해줘"

현재 구현 fixture:

- 실제 delete tool/planner는 아직 없으므로, system lockdown 하에서 dangerous request를 차단하는 흐름으로 등가 검증한다.

흐름:

1. Runtime Control이 lockdown을 활성화한다.
2. 새 tool 호출은 policy 단계에서 deny된다.
3. `risk.flagged`와 `action.failed`가 남는다.
4. Audit Log에 lockdown과 deny 흔적이 남는다.

검증 포인트:

- denied execution 존재
- `safety.lockdown_enabled` 이벤트 존재
- `risk.flagged` decision=`deny`
- audit에 lockdown 관련 summary 존재

## 메모

- 이 문서는 현재 구현 가능한 코어 시나리오를 기준으로 썼다.
- 실제 Gmail draft tool, delete candidate generation/delete split planner가 들어오면 Scenario B/C는 그 흐름으로 교체한다.
