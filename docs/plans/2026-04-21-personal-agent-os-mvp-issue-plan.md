# Personal Agent OS MVP Issue Plan

작성일: 2026-04-21
상태: Draft v0.1

## 0. 목적

이 문서는 Personal Agent OS의 첫 구현 작업을 GitHub Issue로 바로 분해하기 위한 기준 문서다.

Personal Agent OS는 사용자의 요청을 받아 계획을 세우고, 제한된 도구를 실행하며, 위험한 행동은 승인받고, 모든 행동을 추적 가능한 로그로 남기는 로컬 우선 개인 AI 에이전트 시스템이다.

이 MVP는 "무엇이든 하는 AI"가 아니라 "자율성을 점진적으로 얻는 신뢰 가능한 에이전트 런타임"을 목표로 한다.

## 1. MVP 원칙

1. 기본 동작은 읽기 중심이다.
2. 쓰기, 외부 전송, 삭제, 결제, 배포, 권한 변경은 기본적으로 승인 또는 금지 대상이다.
3. 모든 실제 행동은 Tool Gateway와 Policy Engine을 통과해야 한다.
4. 사용자는 현재 작업, 실행 계획, 승인 대기, 실패 원인, 감사 로그를 볼 수 있어야 한다.
5. 장기 메모리는 자동 저장이 아니라 명시적 정책과 분류를 거쳐 저장한다.
6. 에이전트의 판단보다 시스템 권한이 우선한다.

## 2. MVP 범위

### 포함

- 로컬 실행 가능한 백엔드 골격
- Task, Plan, Step, Action, Approval, Memory, Audit 공통 모델
- 내부 이벤트 버스와 이벤트 저장
- 사용자 요청을 Task로 등록하는 Intake
- Task를 Step으로 분해하는 Planner v1
- Tool Registry와 Tool Gateway
- Policy Engine과 위험도 판정
- 승인/거절 플로우
- 감사 로그와 trace 조회
- 단기/장기 메모리 저장 정책
- Command Center 웹 UI 초안
- 대표 시나리오 E2E 테스트

### 제외

- 완전 자율 장기 실행 에이전트
- 금융 거래, 결제, 이메일 자동 발송
- 브라우저 전체 자동 조작
- 모든 SaaS 커넥터 동시 지원
- 복잡한 멀티에이전트 조직 구조
- 고급 RAG 또는 지식 그래프
- 모바일 앱

## 3. 대표 MVP 시나리오

### Scenario A: 프로젝트 상태 정리

사용자가 "이 프로젝트 현재 상태를 정리하고 다음 작업을 제안해줘"라고 요청한다.

기대 흐름:

1. 요청이 Task로 등록된다.
2. Planner가 파일 읽기, 요약, 다음 액션 생성 Step을 만든다.
3. Policy Engine은 workspace read를 low risk로 판정한다.
4. Executor가 허용된 파일만 읽는다.
5. 결과와 근거 파일이 Audit Log에 남는다.

### Scenario B: 이메일 초안 작성

사용자가 "어제 논의한 내용을 바탕으로 답장 초안을 만들어줘. 보내지는 마."라고 요청한다.

기대 흐름:

1. Gmail read는 허용된다.
2. Gmail draft create는 medium risk로 기록된다.
3. 실제 send는 scope 밖이며 차단된다.
4. 초안 내용과 사용한 근거가 Audit Log에 남는다.

### Scenario C: 위험 작업 차단

사용자가 "오래된 파일을 정리해서 삭제해줘"라고 요청한다.

기대 흐름:

1. 파일 검색과 후보 목록 생성은 허용된다.
2. 삭제 Step은 critical risk로 판정된다.
3. MVP에서는 삭제 실행이 금지된다.
4. 사용자는 삭제 후보 목록만 받는다.
5. 차단 사유가 Audit Log에 남는다.

## 4. 핵심 컴포넌트

### Task Intake

책임:

- 사용자 자연어 요청을 구조화된 Task로 변환한다.
- 우선순위, 기한, 민감도, 요청 채널을 기록한다.
- `task.created` 이벤트를 발행한다.

### Planner

책임:

- Task를 실행 가능한 Plan과 Step으로 분해한다.
- 각 Step에 필요한 tool, capability, risk hint를 붙인다.
- 실패 또는 거절 시 재계획한다.

### Policy Engine

책임:

- Tool 호출 전 위험도와 권한을 판정한다.
- 승인 필요, 차단, 허용 결정을 내린다.
- 결정 이유를 Audit Log에 남긴다.

### Tool Registry

책임:

- 시스템에서 사용할 수 있는 도구와 capability를 등록한다.
- 각 도구의 입력 스키마, 출력 스키마, 위험도, 권한을 정의한다.

### Tool Gateway / Executor

책임:

- 모든 실제 도구 실행을 단일 관문으로 처리한다.
- 실행 전 Policy Engine을 호출한다.
- timeout, retry, idempotency, error capture를 처리한다.

### Approval Flow

책임:

- 승인 요청을 생성한다.
- 사용자의 승인, 거절, 수정 요청을 기록한다.
- 승인 없는 high/critical action 실행을 막는다.

### Memory Store

책임:

- 작업 맥락, 사용자 선호, 프로젝트 상태를 저장한다.
- memory entry를 `ephemeral`, `project`, `personal`, `sensitive`, `blocked`로 분류한다.
- 민감 정보가 장기 메모리에 저장되지 않도록 한다.

### Audit Log

책임:

- 요청, 계획, 정책 판정, 승인, 도구 실행, 메모리 접근을 trace 단위로 기록한다.
- 사용자용 설명과 개발자용 디버깅 정보를 모두 제공한다.

### Command Center UI

책임:

- Task 목록, Plan/Step 상태, 승인 대기, 실행 결과, Audit Log를 보여준다.
- 사용자가 작업을 중지하거나 승인/거절할 수 있게 한다.

## 5. 공통 도메인 모델 초안

### Task

필드:

- `id`
- `title`
- `raw_request`
- `status`: `created | planning | waiting_approval | running | completed | failed | canceled`
- `priority`: `low | normal | high`
- `sensitivity`: `public | internal | personal | sensitive`
- `created_by`
- `created_at`
- `updated_at`

### Plan

필드:

- `id`
- `task_id`
- `status`: `drafted | approved | partially_approved | running | completed | failed | canceled`
- `summary`
- `steps`
- `created_at`
- `updated_at`

### Step

필드:

- `id`
- `plan_id`
- `title`
- `status`: `ready | waiting_approval | running | completed | failed | skipped | blocked`
- `tool_name`
- `required_capabilities`
- `risk_level`
- `approval_id`
- `depends_on`

### Tool

필드:

- `name`
- `description`
- `input_schema`
- `output_schema`
- `capabilities`
- `default_risk`
- `requires_approval`
- `sandbox`

### PolicyDecision

필드:

- `id`
- `action_id`
- `decision`: `allow | require_approval | deny`
- `risk_level`
- `reasons`
- `evaluated_rules`
- `created_at`

### Approval

필드:

- `id`
- `task_id`
- `step_id`
- `status`: `requested | approved | denied | expired`
- `summary`
- `risk_reasons`
- `requested_at`
- `resolved_at`

### AuditRecord

필드:

- `id`
- `trace_id`
- `task_id`
- `event_type`
- `actor`
- `target`
- `summary`
- `payload_redacted`
- `created_at`

## 6. 이벤트 계약 초안

공통 필드:

- `event_id`
- `event_type`
- `timestamp`
- `actor`: `user | agent | system`
- `task_id`
- `trace_id`
- `correlation_id`
- `payload`

필수 이벤트:

- `task.created`
- `task.updated`
- `plan.drafted`
- `plan.updated`
- `step.ready`
- `step.approval_requested`
- `step.approved`
- `step.denied`
- `action.started`
- `action.succeeded`
- `action.failed`
- `policy.evaluated`
- `risk.flagged`
- `memory.read`
- `memory.written`
- `audit.recorded`

## 7. 위험도 정책

### low

예:

- 허용된 workspace 내 파일 읽기
- 로컬 요약 생성
- Task 상태 조회

정책:

- 자동 실행 가능
- Audit Log 필수

### medium

예:

- 로컬 초안 파일 생성
- 메모리 저장
- 캘린더 후보 생성

정책:

- 자동 실행 가능하되 정책 판정 기록 필수
- sensitive context 포함 시 승인 필요

### high

예:

- 외부 시스템 수정
- 이메일 초안 생성
- 캘린더 이벤트 생성
- workspace 내 파일 수정

정책:

- 기본 승인 필요
- 실행 전 변경 요약 또는 diff 필요

### critical

예:

- 삭제
- 외부 발송
- 결제
- 배포
- 권한 변경
- 비밀정보 접근 또는 전송

정책:

- MVP에서는 기본 금지
- 실험 플래그와 별도 다중 승인 없이는 실행 불가

## 8. GitHub Issue Backlog

### Epic 1: Project Foundation

#### PAOS-001: 프로젝트 골격과 문서 구조 수립

Labels: `type:foundation`, `area:repo`, `priority:P0`
Milestone: `M0 Foundation`
Parallel: 가능
Dependencies: 없음

Scope:

- repo 기본 구조를 만든다.
- `docs/`, `apps/`, `packages/`, `tests/` 구조를 정의한다.
- README에 MVP 목적과 실행 원칙을 적는다.

Acceptance Criteria:

- 최상위 README가 존재한다.
- 문서 구조가 `docs/plans`, `docs/architecture`, `docs/security`, `docs/issues`로 나뉜다.
- 로컬 개발을 시작하기 위한 기본 명령이 문서화된다.

#### PAOS-002: 공통 용어집 작성

Labels: `type:docs`, `area:domain`, `priority:P0`
Milestone: `M0 Foundation`
Parallel: 가능
Dependencies: 없음

Scope:

- Task, Plan, Step, Action, Tool, Capability, Policy, Approval, Memory, Audit의 의미를 정의한다.

Acceptance Criteria:

- 각 용어가 한 문장 정의와 예시를 가진다.
- 동일 용어가 아키텍처, API, DB 문서에서 같은 의미로 사용된다.

#### PAOS-003: 공통 도메인 타입 정의

Labels: `type:architecture`, `area:domain`, `priority:P0`
Milestone: `M0 Foundation`
Parallel: PAOS-002 이후 가능
Dependencies: PAOS-002

Scope:

- Task, Plan, Step, Tool, PolicyDecision, Approval, MemoryEntry, AuditRecord 타입을 정의한다.
- 상태 전이표를 문서화한다.

Acceptance Criteria:

- 모든 핵심 객체가 필수 필드와 optional 필드를 가진다.
- 각 객체의 상태값과 허용 전이가 정의된다.
- 이후 API/DB 구현자가 타입을 그대로 참고할 수 있다.

### Epic 2: Event and Audit Foundation

#### PAOS-004: 이벤트 스키마 정의

Labels: `type:architecture`, `area:eventing`, `priority:P0`
Milestone: `M0 Foundation`
Parallel: PAOS-003 이후 가능
Dependencies: PAOS-003

Scope:

- 공통 이벤트 필드를 정의한다.
- MVP 필수 이벤트 목록과 payload를 정의한다.

Acceptance Criteria:

- 모든 이벤트가 `event_id`, `event_type`, `timestamp`, `actor`, `trace_id`를 가진다.
- Task, Plan, Step, Policy, Approval, Tool, Memory, Audit 이벤트가 정의된다.

#### PAOS-005: 감사 로그 스키마 정의

Labels: `type:security`, `area:audit`, `priority:P0`
Milestone: `M0 Foundation`
Parallel: PAOS-004와 병렬 가능
Dependencies: PAOS-003

Scope:

- AuditRecord 스키마를 정의한다.
- 민감 값 마스킹/해시 규칙을 정의한다.
- trace 조회 기준을 정한다.

Acceptance Criteria:

- 정책 판정, 승인, 도구 실행, 메모리 접근 이벤트가 감사 대상에 포함된다.
- 원문 민감 정보가 로그에 저장되지 않는 규칙이 있다.
- 하나의 Task를 trace로 복원할 수 있는 필드가 있다.

### Epic 3: Policy and Permission System

#### PAOS-006: 위험 등급과 정책 규칙 정의

Labels: `type:security`, `area:policy`, `priority:P0`
Milestone: `M1 Trust Core`
Parallel: 가능
Dependencies: PAOS-003

Scope:

- `low`, `medium`, `high`, `critical` 위험 등급을 정의한다.
- 각 위험 등급의 기본 실행 정책을 정의한다.

Acceptance Criteria:

- 모든 Tool Action은 위험 등급을 가져야 한다.
- high 이상은 승인 또는 차단 정책을 가진다.
- critical은 MVP에서 기본 금지로 정의된다.

#### PAOS-007: capability 기반 권한 모델 정의

Labels: `type:security`, `area:permissions`, `priority:P0`
Milestone: `M1 Trust Core`
Parallel: PAOS-006과 병렬 가능
Dependencies: PAOS-003

Scope:

- capability 목록을 정의한다.
- Tool별 required capability를 표현하는 방식을 정한다.

Acceptance Criteria:

- 최소 capability가 `filesystem.read`, `filesystem.write`, `network.read`, `network.write`, `email.read`, `email.draft`, `email.send`, `calendar.read`, `calendar.write`, `secret.read`, `process.execute`를 포함한다.
- 권한은 Tool 이름이 아니라 capability 단위로 판정된다.
- 새 Tool 추가 시 capability 선언이 필수다.

#### PAOS-008: 승인 게이트 정책 정의

Labels: `type:security`, `area:approval`, `priority:P0`
Milestone: `M1 Trust Core`
Parallel: 가능
Dependencies: PAOS-006, PAOS-007

Scope:

- 승인 요청 생성 조건을 정의한다.
- 승인 요청에 표시할 필드를 정의한다.
- 승인 만료와 거절 후 처리 방식을 정한다.

Acceptance Criteria:

- 승인 요청에는 작업 요약, 영향 범위, 위험 사유, 실행 전 예상 결과가 포함된다.
- 거절 시 Step은 실행되지 않는다.
- 승인 없는 high action은 실행될 수 없다는 정책이 명시된다.

#### PAOS-009: 긴급 정지와 권한 회수 정책 정의

Labels: `type:security`, `area:safety`, `priority:P1`
Milestone: `M1 Trust Core`
Parallel: 가능
Dependencies: PAOS-006

Scope:

- kill switch 동작을 정의한다.
- 실행 중 작업, 예약 작업, 세션 권한 회수 방식을 정한다.

Acceptance Criteria:

- 긴급 정지 시 새 Tool 호출이 거부된다.
- 진행 중인 실행의 취소 가능/불가능 상태가 명확히 구분된다.
- 권한 회수 이벤트가 감사 로그에 남는다.

### Epic 4: Task and Planning Runtime

#### PAOS-010: Task Intake API 설계

Labels: `type:api`, `area:task`, `priority:P0`
Milestone: `M2 Runtime Skeleton`
Parallel: 가능
Dependencies: PAOS-003, PAOS-004

Scope:

- `POST /tasks`, `GET /tasks`, `GET /tasks/:id`, `PATCH /tasks/:id` API를 설계한다.

Acceptance Criteria:

- Task 생성 시 `task.created` 이벤트가 발행된다.
- raw request와 structured task가 모두 보존된다.
- Task 상태 전이가 타입 정의와 일치한다.

#### PAOS-011: Planner v1 계약 설계

Labels: `type:architecture`, `area:planner`, `priority:P0`
Milestone: `M2 Runtime Skeleton`
Parallel: 가능
Dependencies: PAOS-003, PAOS-006, PAOS-007

Scope:

- Task를 Plan/Step 목록으로 변환하는 Planner 인터페이스를 정의한다.
- Step별 tool, capability, risk hint, dependency 표현을 정의한다.

Acceptance Criteria:

- Planner output이 Policy Engine input으로 바로 전달 가능하다.
- Step은 실행 순서와 병렬 실행 가능 여부를 표현한다.
- Planner는 사용자가 모호하게 요청한 경우 clarification 필요 상태를 만들 수 있다.

#### PAOS-012: Plan and Step 상태 전이 정의

Labels: `type:architecture`, `area:planner`, `priority:P0`
Milestone: `M2 Runtime Skeleton`
Parallel: PAOS-011과 병렬 가능
Dependencies: PAOS-003

Scope:

- Plan과 Step 상태 전이를 표로 정의한다.
- 실패, 차단, 승인 대기, 취소 상태를 포함한다.

Acceptance Criteria:

- 상태 전이가 단방향/양방향인지 명확하다.
- 취소와 실패의 차이가 정의된다.
- 재계획 조건이 정의된다.

### Epic 5: Tool Runtime

#### PAOS-013: Tool Registry 스키마 정의

Labels: `type:architecture`, `area:tools`, `priority:P0`
Milestone: `M2 Runtime Skeleton`
Parallel: 가능
Dependencies: PAOS-007

Scope:

- Tool metadata, input schema, output schema, capability, risk, sandbox policy를 정의한다.

Acceptance Criteria:

- Tool은 capability와 default risk를 필수로 선언한다.
- Tool input은 검증 가능한 schema를 가진다.
- Tool Registry는 Planner와 Policy Engine이 모두 참조할 수 있다.

#### PAOS-014: Tool Gateway 실행 계약 정의

Labels: `type:architecture`, `area:tools`, `priority:P0`
Milestone: `M2 Runtime Skeleton`
Parallel: 가능
Dependencies: PAOS-006, PAOS-007, PAOS-013

Scope:

- 모든 Tool 호출이 Policy Engine을 통과하는 실행 계약을 정의한다.
- 실행 전/후 이벤트와 에러 코드를 정의한다.

Acceptance Criteria:

- Tool 직접 실행 우회 경로가 없어야 한다.
- 정책 실패와 Tool 실패가 다른 에러 코드로 구분된다.
- timeout, retry, idempotency key 정책이 정의된다.

#### PAOS-015: MVP Tool 3종 정의

Labels: `type:architecture`, `area:tools`, `priority:P1`
Milestone: `M2 Runtime Skeleton`
Parallel: 가능
Dependencies: PAOS-013

Scope:

- `workspace.read_file`
- `workspace.list_files`
- `memory.write_candidate`

Acceptance Criteria:

- 세 Tool 모두 input/output schema가 있다.
- 세 Tool 모두 capability와 risk가 정의된다.
- MVP 시나리오 A를 수행하는 데 충분하다.

### Epic 6: Memory and Privacy

#### PAOS-016: 메모리 분류 정책 정의

Labels: `type:security`, `area:memory`, `priority:P0`
Milestone: `M1 Trust Core`
Parallel: 가능
Dependencies: PAOS-006

Scope:

- `ephemeral`, `project`, `personal`, `sensitive`, `blocked` memory class를 정의한다.
- 저장 허용/금지/만료 기준을 정한다.

Acceptance Criteria:

- sensitive와 blocked는 기본적으로 장기 저장되지 않는다.
- 사용자의 명시 승인 없이 개인 식별 정보가 장기 메모리에 들어가지 않는다.
- memory write는 감사 로그 대상이다.

#### PAOS-017: Memory API 계약 설계

Labels: `type:api`, `area:memory`, `priority:P1`
Milestone: `M2 Runtime Skeleton`
Parallel: 가능
Dependencies: PAOS-016

Scope:

- `POST /memory`
- `GET /memory/search`
- `DELETE /memory/:id`

Acceptance Criteria:

- memory write 전에 classification이 필요하다.
- memory search는 purpose와 task context를 함께 받는다.
- 사용자가 memory를 삭제할 수 있다.

### Epic 7: Command Center UX

#### PAOS-018: Command Center 정보 구조 설계

Labels: `type:design`, `area:ui`, `priority:P1`
Milestone: `M3 Command Center`
Parallel: 가능
Dependencies: PAOS-010, PAOS-011, PAOS-005

Scope:

- Task list, Task detail, Approval queue, Audit detail 화면 구조를 정의한다.

Acceptance Criteria:

- 사용자가 현재 실행 중인 작업을 한눈에 볼 수 있다.
- 승인 대기 작업이 별도 영역으로 보인다.
- Task detail에서 Plan, Step, Audit을 연결해서 볼 수 있다.

#### PAOS-019: 승인 카드 UX 문구와 액션 정의

Labels: `type:design`, `area:approval`, `priority:P1`
Milestone: `M3 Command Center`
Parallel: 가능
Dependencies: PAOS-008

Scope:

- 승인 카드에 보여줄 필드와 버튼을 정의한다.

Acceptance Criteria:

- 승인 카드에는 요청 작업, 영향 범위, 위험 사유, 실행 후 변경 내용이 표시된다.
- 액션은 `approve`, `deny`, `request_changes`, `cancel_task`를 포함한다.
- 모호한 승인 문구를 사용하지 않는다.

### Epic 8: Evaluation and Tests

#### PAOS-020: 정책 회귀 테스트 시나리오 정의

Labels: `type:test`, `area:policy`, `priority:P0`
Milestone: `M4 Evaluation`
Parallel: 가능
Dependencies: PAOS-006, PAOS-007, PAOS-008

Scope:

- 승인 없는 high action 차단
- critical action 기본 금지
- 권한 없는 Tool 호출 차단
- 민감 메모리 장기 저장 차단
- 감사 로그 누락 탐지

Acceptance Criteria:

- 각 시나리오가 Given/When/Then 형태로 정의된다.
- 실패 시 어떤 정책이 깨졌는지 알 수 있다.
- 이후 자동 테스트로 옮길 수 있는 입력/기대 결과가 있다.

#### PAOS-021: 대표 E2E 시나리오 정의

Labels: `type:test`, `area:e2e`, `priority:P1`
Milestone: `M4 Evaluation`
Parallel: 가능
Dependencies: PAOS-010, PAOS-011, PAOS-014, PAOS-016

Scope:

- Scenario A, B, C를 E2E 테스트 케이스로 작성한다.

Acceptance Criteria:

- 요청부터 Audit Log까지 전체 흐름이 검증된다.
- 승인 없는 고위험 action은 실행되지 않는다.
- 각 시나리오가 fixture 형태로 구현 가능하다.

## 9. 병렬 작업 배분

### Lane A: Foundation

Owner: Agent A
Issues:

- PAOS-001
- PAOS-002
- PAOS-003
- PAOS-004

Blocked by:

- 없음

Handoff:

- 도메인 타입과 이벤트 스키마를 Lane B, C, D가 사용한다.

### Lane B: Trust Core

Owner: Agent B
Issues:

- PAOS-006
- PAOS-007
- PAOS-008
- PAOS-009
- PAOS-016

Blocked by:

- PAOS-003 초안

Handoff:

- Policy/Permission 문서를 Lane C Tool Runtime과 Lane E Tests가 사용한다.

### Lane C: Runtime Contracts

Owner: Agent C
Issues:

- PAOS-010
- PAOS-011
- PAOS-012
- PAOS-013
- PAOS-014
- PAOS-015

Blocked by:

- PAOS-003
- PAOS-006
- PAOS-007

Handoff:

- API와 Tool Gateway 계약을 실제 구현 단계의 기준으로 사용한다.

### Lane D: UX and Explanation

Owner: Agent D
Issues:

- PAOS-018
- PAOS-019

Blocked by:

- PAOS-008
- PAOS-010
- PAOS-011

Handoff:

- 승인 UX와 Command Center 화면을 frontend 구현 기준으로 사용한다.

### Lane E: Evaluation

Owner: Agent E
Issues:

- PAOS-020
- PAOS-021

Blocked by:

- PAOS-006
- PAOS-007
- PAOS-008
- PAOS-014

Handoff:

- 자동 테스트 구현과 릴리즈 게이트로 사용한다.

## 10. 권장 마일스톤

### M0 Foundation

목표:

- 프로젝트 언어와 구조를 고정한다.
- 도메인, 이벤트, 감사 로그의 공통 언어를 만든다.

완료 조건:

- PAOS-001 ~ PAOS-005 완료

### M1 Trust Core

목표:

- 안전한 자율성의 기준을 먼저 만든다.

완료 조건:

- PAOS-006 ~ PAOS-009
- PAOS-016

### M2 Runtime Skeleton

목표:

- Task 생성, 계획, Tool 계약까지 이어지는 런타임 뼈대를 만든다.

완료 조건:

- PAOS-010 ~ PAOS-015
- PAOS-017

### M3 Command Center

목표:

- 사용자가 작업과 승인을 이해하고 통제할 수 있는 UI 기준을 만든다.

완료 조건:

- PAOS-018
- PAOS-019

### M4 Evaluation

목표:

- 정책과 대표 시나리오를 회귀 테스트 가능한 형태로 만든다.

완료 조건:

- PAOS-020
- PAOS-021

## 11. 첫 구현 순서 제안

1. PAOS-001: 프로젝트 골격과 문서 구조 수립
2. PAOS-002: 공통 용어집 작성
3. PAOS-003: 공통 도메인 타입 정의
4. PAOS-006: 위험 등급과 정책 규칙 정의
5. PAOS-007: capability 기반 권한 모델 정의
6. PAOS-004: 이벤트 스키마 정의
7. PAOS-005: 감사 로그 스키마 정의
8. PAOS-010: Task Intake API 설계
9. PAOS-013: Tool Registry 스키마 정의
10. PAOS-014: Tool Gateway 실행 계약 정의

## 12. 다음 작업

다음 커밋/작업에서는 이 문서를 기준으로 아래 문서를 분리한다.

- `docs/architecture/domain-model.md`
- `docs/architecture/events.md`
- `docs/security/policy-and-permissions.md`
- `docs/security/memory-privacy.md`
- `docs/issues/mvp-backlog.md`
- `docs/issues/issue-template.md`

분리 후 각 문서는 GitHub Issue 본문으로 복사 가능한 포맷을 유지한다.
