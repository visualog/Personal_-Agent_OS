# Personal Agent OS MVP Backlog

기준 문서: [Personal Agent OS MVP Issue Plan](../plans/2026-04-21-personal-agent-os-mvp-issue-plan.md)

이 문서는 GitHub Issue로 바로 옮길 수 있는 MVP 백로그다.  
각 항목은 `PAOS-###` 형식의 제목, 라벨, 마일스톤, 의존성, 작업 레인, 범위, 체크리스트, 수용 기준을 포함한다.

## 사용 원칙

- 제목은 `PAOS-###: ...` 형식을 유지한다.
- `Labels`는 GitHub issue label 값으로 그대로 사용한다.
- `Milestone`은 계획 문서의 마일스톤을 따른다.
- `Lane`은 병렬 작업 배분 기준을 따른다.
- `Dependencies`는 선행 이슈만 적는다.
- `Checklist`는 구현자가 작업 전개에 바로 쓸 수 있는 단위로 적는다.
- `Acceptance Criteria`는 완료 판정 기준이다.

---

## Epic 1. Project Foundation

### PAOS-001: 프로젝트 골격과 문서 구조 수립

- Labels: `type:foundation`, `area:repo`, `priority:P0`
- Milestone: `M0 Foundation`
- Lane: `Lane A - Foundation`
- Parallel: 가능
- Dependencies: 없음

#### Scope

- repo 기본 구조를 만든다.
- `docs/`, `apps/`, `packages/`, `tests/` 구조를 정의한다.
- README에 MVP 목적과 실행 원칙을 적는다.

#### Checklist

- [ ] 최상위 README에 MVP 목적과 작업 원칙이 정리된다.
- [ ] `docs/architecture`, `docs/security`, `docs/issues`, `docs/plans` 구조가 준비된다.
- [ ] `apps/`, `packages/`, `tests/` 기본 디렉터리 기준이 문서화된다.
- [ ] 로컬 개발 시작 명령이 README 또는 문서 인덱스에 적힌다.

#### Acceptance Criteria

- 최상위 README가 존재한다.
- 문서 구조가 계획과 일치한다.
- 새 기여자가 프로젝트 구조를 읽고 다음 작업 위치를 바로 찾을 수 있다.

### PAOS-002: 공통 용어집 작성

- Labels: `type:docs`, `area:domain`, `priority:P0`
- Milestone: `M0 Foundation`
- Lane: `Lane A - Foundation`
- Parallel: 가능
- Dependencies: 없음

#### Scope

- Task, Plan, Step, Action, Tool, Capability, Policy, Approval, Memory, Audit의 의미를 정의한다.

#### Checklist

- [ ] 각 용어를 한 문장으로 정의한다.
- [ ] 각 용어에 짧은 예시를 붙인다.
- [ ] 용어 간 혼동이 생기지 않도록 참조 관계를 정리한다.

#### Acceptance Criteria

- 각 용어가 한 문장 정의와 예시를 가진다.
- 동일 용어가 아키텍처, API, DB 문서에서 같은 의미로 사용된다.
- 새 문서를 읽을 때 용어 해석이 흔들리지 않는다.

### PAOS-003: 공통 도메인 타입 정의

- Labels: `type:architecture`, `area:domain`, `priority:P0`
- Milestone: `M0 Foundation`
- Lane: `Lane A - Foundation`
- Parallel: `PAOS-002` 이후 가능
- Dependencies: `PAOS-002`

#### Scope

- Task, Plan, Step, Tool, PolicyDecision, Approval, MemoryEntry, AuditRecord 타입을 정의한다.
- 상태 전이표를 문서화한다.

#### Checklist

- [ ] 핵심 객체의 필수 필드를 정리한다.
- [ ] optional 필드를 구분한다.
- [ ] 상태값과 허용 전이를 표로 만든다.
- [ ] 이후 API/DB 구현자가 그대로 참고할 수 있게 예시를 둔다.

#### Acceptance Criteria

- 모든 핵심 객체가 필수 필드와 optional 필드를 가진다.
- 각 객체의 상태값과 허용 전이가 정의된다.
- 이후 API/DB 구현자가 타입을 그대로 참고할 수 있다.

### PAOS-004: 이벤트 스키마 정의

- Labels: `type:architecture`, `area:eventing`, `priority:P0`
- Milestone: `M0 Foundation`
- Lane: `Lane A - Foundation`
- Parallel: `PAOS-003` 이후 가능
- Dependencies: `PAOS-003`

#### Scope

- 공통 이벤트 필드를 정의한다.
- MVP 필수 이벤트 목록과 payload를 정의한다.

#### Checklist

- [ ] 공통 이벤트 필드(`event_id`, `event_type`, `timestamp`, `actor`, `trace_id`)를 정의한다.
- [ ] Task, Plan, Step, Policy, Approval, Tool, Memory, Audit 이벤트를 정리한다.
- [ ] 각 이벤트 payload의 최소 필드를 적는다.

#### Acceptance Criteria

- 모든 이벤트가 `event_id`, `event_type`, `timestamp`, `actor`, `trace_id`를 가진다.
- Task, Plan, Step, Policy, Approval, Tool, Memory, Audit 이벤트가 정의된다.
- 이벤트 계약이 후속 구현의 기준 문서로 사용할 수 있다.

### PAOS-005: 감사 로그 스키마 정의

- Labels: `type:security`, `area:audit`, `priority:P0`
- Milestone: `M0 Foundation`
- Lane: `Lane A - Foundation`
- Parallel: `PAOS-004`와 병렬 가능
- Dependencies: `PAOS-003`

#### Scope

- AuditRecord 스키마를 정의한다.
- 민감 값 마스킹/해시 규칙을 정의한다.
- trace 조회 기준을 정한다.

#### Checklist

- [ ] 감사 대상 이벤트 범위를 정한다.
- [ ] 민감 정보 마스킹 규칙을 적는다.
- [ ] trace 복원에 필요한 최소 필드를 정한다.
- [ ] 사용자용 설명과 개발자용 디버깅 정보를 분리한다.

#### Acceptance Criteria

- 정책 판정, 승인, 도구 실행, 메모리 접근 이벤트가 감사 대상에 포함된다.
- 원문 민감 정보가 로그에 저장되지 않는 규칙이 있다.
- 하나의 Task를 trace로 복원할 수 있는 필드가 있다.

---

## Epic 2. Policy and Permission System

### PAOS-006: 위험 등급과 정책 규칙 정의

- Labels: `type:security`, `area:policy`, `priority:P0`
- Milestone: `M1 Trust Core`
- Lane: `Lane B - Trust Core`
- Parallel: 가능
- Dependencies: `PAOS-003`

#### Scope

- `low`, `medium`, `high`, `critical` 위험 등급을 정의한다.
- 각 위험 등급의 기본 실행 정책을 정의한다.

#### Checklist

- [ ] 위험 등급별 예시 작업을 정리한다.
- [ ] 각 등급의 기본 정책을 문서화한다.
- [ ] 승인 필요/차단/허용 기준을 분리한다.

#### Acceptance Criteria

- 모든 Tool Action은 위험 등급을 가져야 한다.
- high 이상은 승인 또는 차단 정책을 가진다.
- critical은 MVP에서 기본 금지로 정의된다.

### PAOS-007: capability 기반 권한 모델 정의

- Labels: `type:security`, `area:permissions`, `priority:P0`
- Milestone: `M1 Trust Core`
- Lane: `Lane B - Trust Core`
- Parallel: `PAOS-006`과 병렬 가능
- Dependencies: `PAOS-003`

#### Scope

- capability 목록을 정의한다.
- Tool별 required capability를 표현하는 방식을 정한다.

#### Checklist

- [ ] 최소 capability 집합을 나열한다.
- [ ] 권한 판정이 Tool 이름이 아니라 capability 단위로 이루어지게 정의한다.
- [ ] 새 Tool 추가 시 capability 선언이 필수임을 명시한다.

#### Acceptance Criteria

- 최소 capability가 `filesystem.read`, `filesystem.write`, `network.read`, `network.write`, `email.read`, `email.draft`, `email.send`, `calendar.read`, `calendar.write`, `secret.read`, `process.execute`를 포함한다.
- 권한은 Tool 이름이 아니라 capability 단위로 판정된다.
- 새 Tool 추가 시 capability 선언이 필수다.

### PAOS-008: 승인 게이트 정책 정의

- Labels: `type:security`, `area:approval`, `priority:P0`
- Milestone: `M1 Trust Core`
- Lane: `Lane B - Trust Core`
- Parallel: 가능
- Dependencies: `PAOS-006`, `PAOS-007`

#### Scope

- 승인 요청 생성 조건을 정의한다.
- 승인 요청에 표시할 필드를 정의한다.
- 승인 만료와 거절 후 처리 방식을 정한다.

#### Checklist

- [ ] 승인 요청이 생성되는 조건을 정의한다.
- [ ] 승인 카드에 표시할 필드를 정한다.
- [ ] 만료, 거절, 수정 요청 처리 규칙을 정한다.

#### Acceptance Criteria

- 승인 요청에는 작업 요약, 영향 범위, 위험 사유, 실행 전 예상 결과가 포함된다.
- 거절 시 Step은 실행되지 않는다.
- 승인 없는 high action은 실행될 수 없다는 정책이 명시된다.

### PAOS-009: 긴급 정지와 권한 회수 정책 정의

- Labels: `type:security`, `area:safety`, `priority:P1`
- Milestone: `M1 Trust Core`
- Lane: `Lane B - Trust Core`
- Parallel: 가능
- Dependencies: `PAOS-006`

#### Scope

- kill switch 동작을 정의한다.
- 실행 중 작업, 예약 작업, 세션 권한 회수 방식을 정한다.

#### Checklist

- [ ] 긴급 정지 시 신규 Tool 호출 차단 규칙을 정한다.
- [ ] 진행 중 실행의 취소 가능/불가능 상태를 구분한다.
- [ ] 권한 회수 이벤트의 감사 로그 기록 방식을 정한다.

#### Acceptance Criteria

- 긴급 정지 시 새 Tool 호출이 거부된다.
- 진행 중인 실행의 취소 가능/불가능 상태가 명확히 구분된다.
- 권한 회수 이벤트가 감사 로그에 남는다.

### PAOS-016: 메모리 분류 정책 정의

- Labels: `type:security`, `area:memory`, `priority:P0`
- Milestone: `M1 Trust Core`
- Lane: `Lane B - Trust Core`
- Parallel: 가능
- Dependencies: `PAOS-006`

#### Scope

- `ephemeral`, `project`, `personal`, `sensitive`, `blocked` memory class를 정의한다.
- 저장 허용/금지/만료 기준을 정한다.

#### Checklist

- [ ] 메모리 분류별 저장 기준을 적는다.
- [ ] 장기 저장 금지 조건을 정의한다.
- [ ] memory write의 감사 로그 요건을 정한다.

#### Acceptance Criteria

- sensitive와 blocked는 기본적으로 장기 저장되지 않는다.
- 사용자의 명시 승인 없이 개인 식별 정보가 장기 메모리에 들어가지 않는다.
- memory write는 감사 로그 대상이다.

---

## Epic 3. Task and Planning Runtime

### PAOS-010: Task Intake API 설계

- Labels: `type:api`, `area:task`, `priority:P0`
- Milestone: `M2 Runtime Skeleton`
- Lane: `Lane C - Runtime Contracts`
- Parallel: 가능
- Dependencies: `PAOS-003`, `PAOS-004`

#### Scope

- `POST /tasks`, `GET /tasks`, `GET /tasks/:id`, `PATCH /tasks/:id` API를 설계한다.

#### Checklist

- [ ] Task 생성 입력과 출력 형식을 정의한다.
- [ ] list/detail/update 시나리오를 문서화한다.
- [ ] `task.created` 이벤트 발행 시점을 정한다.
- [ ] raw request와 structured task의 보존 방식을 정의한다.

#### Acceptance Criteria

- Task 생성 시 `task.created` 이벤트가 발행된다.
- raw request와 structured task가 모두 보존된다.
- Task 상태 전이가 타입 정의와 일치한다.

### PAOS-011: Planner v1 계약 설계

- Labels: `type:architecture`, `area:planner`, `priority:P0`
- Milestone: `M2 Runtime Skeleton`
- Lane: `Lane C - Runtime Contracts`
- Parallel: 가능
- Dependencies: `PAOS-003`, `PAOS-006`, `PAOS-007`

#### Scope

- Task를 Plan/Step 목록으로 변환하는 Planner 인터페이스를 정의한다.
- Step별 tool, capability, risk hint, dependency 표현을 정의한다.

#### Checklist

- [ ] Planner input/output 계약을 정의한다.
- [ ] Step의 순서와 병렬 가능 여부를 표현한다.
- [ ] 모호한 요청 시 clarification 필요 상태를 정의한다.

#### Acceptance Criteria

- Planner output이 Policy Engine input으로 바로 전달 가능하다.
- Step은 실행 순서와 병렬 실행 가능 여부를 표현한다.
- Planner는 사용자가 모호하게 요청한 경우 clarification 필요 상태를 만들 수 있다.

### PAOS-012: Plan and Step 상태 전이 정의

- Labels: `type:architecture`, `area:planner`, `priority:P0`
- Milestone: `M2 Runtime Skeleton`
- Lane: `Lane C - Runtime Contracts`
- Parallel: `PAOS-011`과 병렬 가능
- Dependencies: `PAOS-003`

#### Scope

- Plan과 Step 상태 전이를 표로 정의한다.
- 실패, 차단, 승인 대기, 취소 상태를 포함한다.

#### Checklist

- [ ] Plan 상태 전이를 정리한다.
- [ ] Step 상태 전이를 정리한다.
- [ ] 실패와 취소의 차이를 정의한다.
- [ ] 재계획 조건을 정한다.

#### Acceptance Criteria

- 상태 전이가 단방향/양방향인지 명확하다.
- 취소와 실패의 차이가 정의된다.
- 재계획 조건이 정의된다.

---

## Epic 4. Tool Runtime

### PAOS-013: Tool Registry 스키마 정의

- Labels: `type:architecture`, `area:tools`, `priority:P0`
- Milestone: `M2 Runtime Skeleton`
- Lane: `Lane C - Runtime Contracts`
- Parallel: 가능
- Dependencies: `PAOS-007`

#### Scope

- Tool metadata, input schema, output schema, capability, risk, sandbox policy를 정의한다.

#### Checklist

- [ ] Tool 메타데이터 필드를 정의한다.
- [ ] input/output schema 요구사항을 정한다.
- [ ] capability와 default risk 필드를 필수화한다.

#### Acceptance Criteria

- Tool은 capability와 default risk를 필수로 선언한다.
- Tool input은 검증 가능한 schema를 가진다.
- Tool Registry는 Planner와 Policy Engine이 모두 참조할 수 있다.

### PAOS-014: Tool Gateway 실행 계약 정의

- Labels: `type:architecture`, `area:tools`, `priority:P0`
- Milestone: `M2 Runtime Skeleton`
- Lane: `Lane C - Runtime Contracts`
- Parallel: 가능
- Dependencies: `PAOS-006`, `PAOS-007`, `PAOS-013`

#### Scope

- 모든 Tool 호출이 Policy Engine을 통과하는 실행 계약을 정의한다.
- 실행 전/후 이벤트와 에러 코드를 정의한다.

#### Checklist

- [ ] 직접 실행 우회 경로를 금지한다.
- [ ] 정책 실패와 Tool 실패를 구분한다.
- [ ] timeout, retry, idempotency key 정책을 정의한다.

#### Acceptance Criteria

- Tool 직접 실행 우회 경로가 없어야 한다.
- 정책 실패와 Tool 실패가 다른 에러 코드로 구분된다.
- timeout, retry, idempotency key 정책이 정의된다.

### PAOS-015: MVP Tool 3종 정의

- Labels: `type:architecture`, `area:tools`, `priority:P1`
- Milestone: `M2 Runtime Skeleton`
- Lane: `Lane C - Runtime Contracts`
- Parallel: 가능
- Dependencies: `PAOS-013`

#### Scope

- `workspace.read_file`
- `workspace.list_files`
- `memory.write_candidate`

#### Checklist

- [ ] 세 Tool의 input/output schema를 정의한다.
- [ ] 세 Tool의 capability와 risk를 정의한다.
- [ ] 시나리오 A 수행에 충분한지 확인한다.

#### Acceptance Criteria

- 세 Tool 모두 input/output schema가 있다.
- 세 Tool 모두 capability와 risk가 정의된다.
- MVP 시나리오 A를 수행하는 데 충분하다.

### PAOS-017: Memory API 계약 설계

- Labels: `type:api`, `area:memory`, `priority:P1`
- Milestone: `M2 Runtime Skeleton`
- Lane: `Lane C - Runtime Contracts`
- Parallel: 가능
- Dependencies: `PAOS-016`

#### Scope

- `POST /memory`
- `GET /memory/search`
- `DELETE /memory/:id`

#### Checklist

- [ ] memory write 전 classification 절차를 정의한다.
- [ ] memory search 입력에 purpose와 task context를 포함한다.
- [ ] 사용자 삭제 경로를 정의한다.

#### Acceptance Criteria

- memory write 전에 classification이 필요하다.
- memory search는 purpose와 task context를 함께 받는다.
- 사용자가 memory를 삭제할 수 있다.

---

## Epic 5. Command Center UX

### PAOS-018: Command Center 정보 구조 설계

- Labels: `type:design`, `area:ui`, `priority:P1`
- Milestone: `M3 Command Center`
- Lane: `Lane D - UX and Explanation`
- Parallel: 가능
- Dependencies: `PAOS-010`, `PAOS-011`, `PAOS-005`

#### Scope

- Task list, Task detail, Approval queue, Audit detail 화면 구조를 정의한다.

#### Checklist

- [ ] 현재 실행 중인 작업이 보이도록 구조를 정한다.
- [ ] 승인 대기 작업이 별도 영역에 보이도록 한다.
- [ ] Task detail에서 Plan, Step, Audit을 연결한다.

#### Acceptance Criteria

- 사용자가 현재 실행 중인 작업을 한눈에 볼 수 있다.
- 승인 대기 작업이 별도 영역으로 보인다.
- Task detail에서 Plan, Step, Audit을 연결해서 볼 수 있다.

### PAOS-019: 승인 카드 UX 문구와 액션 정의

- Labels: `type:design`, `area:approval`, `priority:P1`
- Milestone: `M3 Command Center`
- Lane: `Lane D - UX and Explanation`
- Parallel: 가능
- Dependencies: `PAOS-008`

#### Scope

- 승인 카드에 보여줄 필드와 버튼을 정의한다.

#### Checklist

- [ ] 승인 카드 필드를 정한다.
- [ ] 승인/거절/수정 요청/작업 취소 액션을 정한다.
- [ ] 모호한 승인 문구를 제거한다.

#### Acceptance Criteria

- 승인 카드에는 요청 작업, 영향 범위, 위험 사유, 실행 후 변경 내용이 표시된다.
- 액션은 `approve`, `deny`, `request_changes`, `cancel_task`를 포함한다.
- 모호한 승인 문구를 사용하지 않는다.

---

## Epic 6. Evaluation and Tests

### PAOS-020: 정책 회귀 테스트 시나리오 정의

- Labels: `type:test`, `area:policy`, `priority:P0`
- Milestone: `M4 Evaluation`
- Lane: `Lane E - Evaluation`
- Parallel: 가능
- Dependencies: `PAOS-006`, `PAOS-007`, `PAOS-008`

#### Scope

- 승인 없는 high action 차단
- critical action 기본 금지
- 권한 없는 Tool 호출 차단
- 민감 메모리 장기 저장 차단
- 감사 로그 누락 탐지

#### Checklist

- [ ] 각 정책 회귀 시나리오를 Given/When/Then으로 쓴다.
- [ ] 실패 시 어떤 정책이 깨졌는지 드러나도록 한다.
- [ ] 자동 테스트로 옮길 수 있는 입력/기대 결과를 적는다.

#### Acceptance Criteria

- 각 시나리오가 Given/When/Then 형태로 정의된다.
- 실패 시 어떤 정책이 깨졌는지 알 수 있다.
- 이후 자동 테스트로 옮길 수 있는 입력/기대 결과가 있다.

### PAOS-021: 대표 E2E 시나리오 정의

- Labels: `type:test`, `area:e2e`, `priority:P1`
- Milestone: `M4 Evaluation`
- Lane: `Lane E - Evaluation`
- Parallel: 가능
- Dependencies: `PAOS-010`, `PAOS-011`, `PAOS-014`, `PAOS-016`

#### Scope

- Scenario A, B, C를 E2E 테스트 케이스로 작성한다.

#### Checklist

- [ ] Scenario A 흐름을 정의한다.
- [ ] Scenario B 흐름을 정의한다.
- [ ] Scenario C 흐름을 정의한다.
- [ ] fixture 형태로 구현 가능한 입력과 기대 결과를 적는다.

#### Acceptance Criteria

- 요청부터 Audit Log까지 전체 흐름이 검증된다.
- 승인 없는 고위험 action은 실행되지 않는다.
- 각 시나리오가 fixture 형태로 구현 가능하다.

---

## Lane Summary

### Lane A - Foundation

- PAOS-001
- PAOS-002
- PAOS-003
- PAOS-004
- PAOS-005

### Lane B - Trust Core

- PAOS-006
- PAOS-007
- PAOS-008
- PAOS-009
- PAOS-016

### Lane C - Runtime Contracts

- PAOS-010
- PAOS-011
- PAOS-012
- PAOS-013
- PAOS-014
- PAOS-015
- PAOS-017

### Lane D - UX and Explanation

- PAOS-018
- PAOS-019

### Lane E - Evaluation

- PAOS-020
- PAOS-021

---

## Milestone Summary

### M0 Foundation

- PAOS-001
- PAOS-002
- PAOS-003
- PAOS-004
- PAOS-005

### M1 Trust Core

- PAOS-006
- PAOS-007
- PAOS-008
- PAOS-009
- PAOS-016

### M2 Runtime Skeleton

- PAOS-010
- PAOS-011
- PAOS-012
- PAOS-013
- PAOS-014
- PAOS-015
- PAOS-017

### M3 Command Center

- PAOS-018
- PAOS-019

### M4 Evaluation

- PAOS-020
- PAOS-021

