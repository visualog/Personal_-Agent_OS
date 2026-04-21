# PAOS 공통 용어집

작성 기준: `docs/plans/2026-04-21-personal-agent-os-mvp-issue-plan.md`, `docs/architecture/domain-model.md`, `docs/architecture/events.md`, `docs/security/policy-and-permissions.md`

이 문서는 PAOS-002 구현을 위한 공통 용어 정의다. 아래 의미를 기준으로 issue, 타입, 이벤트, 정책 문서를 작성한다.

## Task

사용자 요청 1건을 나타내는 최상위 작업 단위다. Planner, Policy, Executor, Audit의 출발점이 된다.

예: `프로젝트 상태를 정리해줘` 요청 1건을 하나의 Task로 등록한다.

## Plan

하나의 Task를 실행 가능한 Step 묶음으로 분해한 계획이다. 승인 여부와 실행 순서를 담는다.

예: 파일 읽기, 요약 작성, 다음 액션 생성 Step 3개로 분해한 실행안.

## Step

Plan 안의 개별 실행 단위다. 보통 하나의 tool action을 중심으로 하며, 필요한 capability와 risk level을 가진다.

예: `workspace.read_file`로 특정 파일을 읽는 1개의 Step.

## Action

정책 판정 이후 Executor가 실제로 수행하는 한 번의 도구 실행이다. 이벤트에서는 `action.started`, `action.succeeded`, `action.failed`로 추적한다.

예: 승인된 Step에 따라 파일을 읽고 결과를 반환하는 실행 1회.

## Tool

시스템이 호출할 수 있는 실제 도구 정의다. 입력/출력 스키마, capability, 기본 risk, sandbox 조건을 포함하며, 직접 실행하지 않고 Gateway를 통해 호출한다.

예: `workspace.read_file`, `memory.write`, `browser.automation`.

## Capability

도구가 무엇을 할 수 있는지를 나타내는 정적 권한 단위다. 정책 판정은 Tool 이름이 아니라 capability 기준으로 이뤄진다.

예: `workspace.read`, `filesystem.write`, `external.send`.

## Policy

Step 또는 Action이 실행 가능한지 판단하는 규칙과 판정 결과의 집합이다. capability, scope, risk level, approval 필요 여부를 함께 본다.

예: 읽기 Step은 `allow`, 외부 전송 Step은 `deny` 또는 `require_approval`.

## PolicyDecision

정책 엔진이 특정 Step 또는 Action에 대해 내린 개별 판정 기록이다. 값은 `allow`, `require_approval`, `deny` 중 하나다.

예: `filesystem.write` Step에 대해 `require_approval`를 남긴다.

## Approval

사용자가 승인 필요 Step에 대해 내리는 허가 또는 거절 기록이다. `requested`, `approved`, `denied`, `expired` 상태를 가진다.

예: 파일 수정 Step에 대해 사용자가 `approved`를 누른 기록.

## MemoryEntry

작업 맥락, 선호, 프로젝트 상태 등을 저장하는 메모리 항목이다. `ephemeral`, `project`, `personal`, `sensitive`, `blocked` 같은 범위를 가진다.

예: 프로젝트별 고정 선호를 `project` MemoryEntry로 저장한다.

## AuditRecord

요청, 정책 판정, 승인, 도구 실행, 메모리 접근을 남기는 불변 감사 기록이다. trace 단위로 연결되며 append-only로 다룬다.

예: 어떤 Step이 어떤 PolicyDecision을 거쳐 어떤 Tool을 실행했는지 남긴 로그.

## Trace

하나의 사용자 요청에서 파생된 실행 흐름 전체를 묶는 추적 축이다. Task, Plan, Step, PolicyDecision, Approval, Action, AuditRecord를 같은 trace_id로 연결한다.

예: 한 요청의 계획 수립부터 실행 완료까지 같은 `trace_id`로 조회한다.

## Artifact

이벤트나 로그에 직접 넣기 어려운 큰 출력물이나 결과물을 가리키는 참조 객체다. 요약과 메타데이터만 남기고 본문은 별도로 보관한다.

예: 읽은 파일 전체 내용 대신 `output_ref`로 연결된 결과물.

## Workspace

사용자 작업 범위와 정책 적용 범위를 이루는 논리적 공간이다. 읽기/쓰기 권한은 항상 workspace scope와 함께 판단한다.

예: 승인된 프로젝트 디렉터리, 특정 작업 폴더, 허용된 내부 저장공간.

## Tool Gateway

Planner와 Executor 사이에서 Tool 호출을 검증하고 정책 엔진을 거친 뒤 실제 실행 경로로 넘기는 관문이다. 직접 실행 우회 경로를 막는 역할을 한다.

예: Step이 들어오면 등록된 Tool 정보와 capability를 조회해 실행 가능 여부를 먼저 판정한다.

## Executor

승인과 정책 판정을 통과한 Step을 실제 Action으로 실행하는 런타임이다. 도구 호출, 결과 수집, 실패 보고를 담당한다.

예: 허용된 `workspace.read` Step을 실제 파일 읽기 Action으로 실행한다.

## Planner

Task를 Plan과 Step으로 분해하고, 각 Step에 tool, capability, risk hint, dependency를 붙이는 구성 요소다.

예: 요청을 읽고 `읽기 -> 요약 -> 다음 액션` 순서의 Step 목록을 만든다.

## Command Center

사용자가 Task, Plan, Step, 승인 대기, 실행 결과, Audit Log를 한 화면에서 보는 운영 UI다. 중지, 승인, 거절 같은 제어도 여기서 수행한다.

예: 현재 실행 중인 Task의 Plan 상태와 승인 대기 항목을 확인하는 화면.
