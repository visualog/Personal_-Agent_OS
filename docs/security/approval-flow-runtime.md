# Approval Flow Runtime Implementation Contract

상태: Draft v0.1  
최종 갱신: 2026-04-22

이 문서는 Personal Agent OS의 최소 Approval Flow Runtime 구현 계약이다.  
이 단계는 아직 브라우저 preview나 UI stage가 아니며, 런타임 저장소, 상태 전이, 이벤트 발행, Orchestrator 연동만 정의한다.

## 1. 목적

Approval Flow Runtime은 승인 필요한 Step을 안전하게 보류하고, 승인 결과를 다시 Orchestrator에 돌려주는 최소 런타임이다.

책임:

- 승인 요청을 생성하고 저장한다.
- `requested -> approved | denied | expired` 상태 전이를 관리한다.
- 승인 대기 중인 Step과 승인 결과를 `step_id` 기준으로 연결한다.
- Orchestrator가 승인 완료 여부를 확인할 수 있게 조회 API를 제공한다.
- 승인 관련 이벤트를 append-only로 발행한다.

Approval Flow는 승인 UI가 아니다.  
승인 요청을 보여주거나 사용자가 누르는 브라우저/프리뷰 계층은 별도 단계다.

## 2. Approval Store Contract

승인 상태는 `ApprovalStore`가 단일 진실 공급원이다.

최소 인터페이스는 다음과 같다.

```ts
interface ApprovalStore {
  create(input: CreateApprovalInput): Approval;
  resolve(id: string, status: "approved" | "denied" | "expired", resolvedAt?: string): Approval | null;
  get(id: string): Approval | null;
  list(): readonly Approval[];
  listPending(): readonly Approval[];
  clear(): void;
}
```

### `CreateApprovalInput`

- `task_id`: 승인 요청이 속한 Task ID
- `step_id`: 승인 대상 Step ID
- `summary`: 승인 사유를 요약한 문장
- `risk_reasons`: 승인 필요 사유 목록
- `requested_at?`: 요청 시각. 없으면 runtime이 현재 시각을 사용

### `Approval` 필드

최소 필드는 다음을 따른다.

- `id`
- `task_id`
- `step_id`
- `status`
- `summary`
- `risk_reasons`
- `requested_at`
- `resolved_at`

권장 규칙:

- `id`는 전역적으로 유일해야 한다.
- `step_id` 하나에 대해 active approval은 하나만 유지하는 쪽이 안전하다.
- `risk_reasons`는 읽기 전용 복사본으로 다뤄야 한다.
- `get`과 `list`는 내부 객체를 직접 노출하지 말고 복사본을 반환해야 한다.

## 3. 상태 전이

Approval 상태는 다음 네 가지를 사용한다.

- `requested`
- `approved`
- `denied`
- `expired`

전이 규칙:

1. `create`는 항상 `requested` 상태를 만든다.
2. `requested`만 `approved | denied | expired`로 resolve할 수 있다.
3. `approved | denied | expired`는 terminal 상태다.
4. terminal 상태의 approval은 다시 resolve하지 않는다.
5. `expired`는 시간 초과, 상위 흐름 취소, 사용자 응답 누락 같은 비승인 종료를 표현한다.

상태 의미:

- `requested`: 승인 대기 중
- `approved`: 승인이 확정됨
- `denied`: 사용자가 거절함
- `expired`: 정해진 유효 시간 또는 오케스트레이션 윈도우를 넘겨 더 이상 사용할 수 없음

## 4. 런타임 처리 순서

1. Orchestrator가 Step을 판정하고 `require_approval`를 받는다.
2. Orchestrator가 `ApprovalStore.create()`로 승인 요청을 생성한다.
3. Approval Runtime은 `step.approval_requested` 이벤트를 발행한다.
4. 승인 입력이 오면 `resolve()`로 상태를 갱신한다.
5. `approved`이면 `step.approved` 이벤트를 발행한다.
6. `denied`이면 `step.denied` 이벤트를 발행한다.
7. `expired`이면 Step을 재시도 불가 보류 또는 실패로 넘기고, 별도 만료 기록을 남긴다.
8. Orchestrator는 승인 결과를 확인한 뒤에만 다음 실행 단계를 진행한다.

## 5. 이벤트 계약

Approval Flow Runtime은 아래 이벤트를 발행한다.

| 이벤트 | 발행 시점 |
| --- | --- |
| `step.approval_requested` | 승인 요청이 처음 생성되었을 때 |
| `step.approved` | 승인 상태가 `approved`로 바뀌었을 때 |
| `step.denied` | 승인 상태가 `denied`로 바뀌었을 때 |

### 이벤트 공통 필드

모든 이벤트는 최소한 다음 값을 포함해야 한다.

- `trace_id`
- `task_id`
- `step_id`
- `approval_id`
- `approval_status`
- `summary`
- `risk_reasons`
- `created_at`

### 이벤트별 규칙

- `step.approval_requested`는 승인 흐름의 시작점이다.
- `step.approved`는 실행 재개 가능 신호다.
- `step.denied`는 해당 Step 종료 신호다.
- `expired`는 위 표의 세 이벤트 중 하나로 가장하지 말고, 별도 만료 처리 기록으로 남긴다.
- 같은 approval에 대해 동일 이벤트를 중복 발행하지 않는다.

## 6. Orchestrator Interaction

Approval Flow Runtime은 Orchestrator의 하위 협력자다.

Orchestrator 책임:

- `require_approval` 판정 후 승인 요청 생성을 트리거한다.
- 승인 대기 중인 Step을 `waiting_approval` 상태로 둔다.
- `approval_id`와 `step_id`를 묶어서 추적한다.
- 승인 완료 전에는 Tool 실행을 시작하지 않는다.
- 승인 결과를 받아 Step 상태를 다시 결정한다.

Approval Flow 책임:

- 승인 요청 저장
- 승인 결과 저장
- 승인 상태 조회 제공
- 승인 관련 이벤트 발행

재조회 규칙:

- Orchestrator는 실행 재개 직전에 `ApprovalStore.get()`으로 최종 상태를 다시 확인해야 한다.
- 승인 상태가 `requested`가 아닌데도 재개하려 하면 안 된다.
- `expired` 상태는 승인 실패와 동일하게 취급하지 말고, 새 요청이 필요한지 Orchestrator가 다시 판단해야 한다.

## 7. 이벤트와 감사

Approval 관련 모든 변화는 감사 가능한 형태로 남겨야 한다.

감사 대상:

- 승인 요청 생성 시각
- 승인 대상 `task_id` / `step_id`
- 승인 상태 변화
- 승인 사유 요약
- 만료 시각과 만료 사유

감사 규칙:

- 원문 입력은 가능한 경우 요약 또는 redacted value로 대체한다.
- 승인 요청 자체와 승인 결과는 같은 `trace_id` 계열로 추적 가능해야 한다.
- UI가 없어도 감사 로그는 독립적으로 남아야 한다.

## 8. 만료 처리

`expired`는 승인 창이 더 이상 유효하지 않다는 뜻이다.

만료가 발생하는 조건 예:

- 승인 기한 초과
- 상위 Task 중단
- Step이 다른 경로로 완료됨
- 동일 Step에 대해 새 승인 요청이 생성됨

만료 처리 규칙:

- 만료된 approval은 재사용하지 않는다.
- 만료 이벤트는 승인 성공 이벤트로 대체하지 않는다.
- 만료 후 실행 재개가 필요하면 새 approval을 생성한다.

## 9. 최소 테스트 시나리오

다음 시나리오는 반드시 통과해야 한다.

1. `create()` 호출 시 `requested` 상태 approval이 생성된다.
2. `listPending()`은 `requested`만 반환한다.
3. `resolve(id, "approved")`는 `requested` approval만 승인 처리한다.
4. `resolve(id, "denied")`는 `requested` approval만 거절 처리한다.
5. `resolve(id, "expired")`는 `requested` approval만 만료 처리한다.
6. terminal 상태 approval은 다시 resolve되지 않아야 한다.
7. `get()`은 내부 저장 객체를 직접 노출하지 않아야 한다.
8. `step.approval_requested`는 승인 생성과 함께 발행되어야 한다.
9. `step.approved`는 승인 후 재개 직전에 발행되어야 한다.
10. `step.denied`는 승인 거절 직후 발행되어야 한다.
11. Orchestrator는 승인 재개 전에 반드시 최신 approval 상태를 재조회해야 한다.
12. UI/브라우저 preview 없이도 approval lifecycle이 끝까지 동작해야 한다.

## 10. 구현 메모

- Approval Store는 작고 예측 가능하게 유지한다.
- 승인 상태 전이는 side effect를 최소화한 채로 관리한다.
- approval summary는 사람과 로그 모두를 위한 짧은 문장으로 유지한다.
- 이 문서에서 정의한 범위는 런타임까지이며, 브라우저 preview나 사용자 승인 UI는 포함하지 않는다.
