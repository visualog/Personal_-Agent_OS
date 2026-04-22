# MVP Exit Criteria

상태: Draft v0.1  
최종 갱신: 2026-04-23

이 문서는 Personal Agent OS의 현재 MVP 범위를 닫기 위한 종료 기준을 고정한다.  
목적은 세 가지다.

- 현재 구현 범위를 완료/미완료로 명확히 나눈다.
- “MVP 완료”라는 표현이 어디까지를 뜻하는지 흔들리지 않게 만든다.
- 다음 단계 이슈를 post-MVP 영역으로 분리한다.

## 1. MVP 완료로 간주하는 기준

아래 항목이 모두 충족되면 현재 MVP는 완료로 본다.

### Core Runtime

- Task Intake, Planner, Orchestrator가 end-to-end로 연결되어 있다.
- Tool Registry, Tool Gateway, Workspace read-only tools가 동작한다.
- EventBus, AuditLog, Read Model, State Store가 현재 상태를 복원할 수 있다.

### Trust and Safety

- 정책 엔진이 `allow`, `require_approval`, `deny`를 판정한다.
- `risk.flagged` telemetry가 정책 위험 결과를 남긴다.
- Approval flow가 `requested`, `approved`, `denied`, `expired`를 처리한다.
- Lockdown과 capability revocation이 런타임에서 강제된다.
- Memory API가 `write/search/delete`와 최소 분류 정책을 제공한다.

### Command Center

- Task List, Approval Queue, Task Detail, Timeline, Audit Records가 웹에서 보인다.
- 로컬 dev preview가 `GET /api/command-center/state`를 제공한다.
- approval action이 `approve`, `deny`, `request_changes`, `cancel_task`를 처리한다.
- 최소 UI 회귀 테스트가 위 네 action을 브라우저 기준으로 검증한다.

### Regression Coverage

- core regression (`npm test`)가 통과한다.
- UI regression (`npm run test:ui`)이 통과한다.
- production preview build (`npm run build:web`)이 통과한다.

## 2. 현재 MVP에 포함되는 것

- local-first core runtime
- inspectable policy and approval flow
- in-memory stores and read models
- runtime-backed Command Center demo UI
- dev-only thin API for approval resolution
- core regression and UI regression automation

## 3. 현재 MVP에서 의도적으로 제외한 것

아래 항목은 중요하지만, 현재 MVP 완료 조건에는 넣지 않는다.

- 실제 Gmail, Calendar, Slack, Telegram connector
- persistent database storage
- multi-user auth/session model
- background job runner / distributed runtime
- production deployment and hosting
- real-time push sync
- polished incident recovery UX
- production observability stack

## 4. 현재 남아 있는 얇은 마감 작업

이 항목들은 MVP를 뒤집는 미완성이 아니라, 마감 품질을 높이는 작업이다.

- UI copy polish
- visual refinement and responsive tuning
- CI에서 UI regression 실행
- preview state reset UX
- demo runtime action history 정리

## 5. Post-MVP 첫 번째 후보 작업

다음 단계는 아래 묶음으로 나누는 것이 자연스럽다.

1. real connector integration
2. persistent runtime state
3. auth and identity model
4. deployment and operational controls
5. richer memory and retrieval
6. real-time command center updates

## 6. 종료 선언 체크리스트

- [ ] `npm run check`
- [ ] `npm test`
- [ ] `npm run test:ui`
- [ ] `npm run build:web`
- [ ] docs index와 README에 종료 기준 문서가 연결됨
- [ ] Command Center preview에서 4개 approval action 수동 확인 가능
