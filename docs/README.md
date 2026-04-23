# Documentation Index

이 디렉터리는 Personal Agent OS의 설계, 보안 정책, 이슈 백로그, 구현 계획을 관리한다.

## 시작점

- [MVP Issue Plan](plans/2026-04-21-personal-agent-os-mvp-issue-plan.md): 첫 번째 기준 문서
- [Domain Model](architecture/domain-model.md): 핵심 도메인 객체와 상태 전이
- [Glossary](architecture/glossary.md): 구현과 이슈 작성에 쓰는 공통 용어
- [Events](architecture/events.md): 내부 이벤트 계약과 payload 기준
- [Tool Runtime](architecture/tool-runtime.md): Tool Registry와 Tool Gateway 런타임 계약
- [Workspace Tools](architecture/workspace-tools.md): 읽기 전용 workspace 도구 계약
- [Task Planner Runtime](architecture/task-planner-runtime.md): Task Intake와 Planner 스켈레톤 계약
- [Orchestrator Runtime](architecture/orchestrator-runtime.md): Task부터 Tool 실행과 Audit까지 묶는 런타임 계약
- [Runtime Read Model](architecture/read-model.md): task 기준 상태/승인/위험/이벤트 조회 계약
- [Command Center Model](architecture/command-center.md): task list/detail, approval queue, audit detail 정보 구조
- [Remote Command Channel](architecture/remote-command-channel.md): 원격 명령 계약과 로컬 agent 채널 초안
- [Telegram Bridge](architecture/telegram-bridge.md): Telegram long polling 기반 로컬 원격 제어 브리지
- [Slack Bridge](architecture/slack-bridge.md): Slack polling 기반 로컬 원격 제어 브리지
- [Agent Daemon](architecture/agent-daemon.md): 항상 켜진 로컬 agent HTTP daemon
- `apps/web`: 첫 번째 Command Center 웹 프로토타입
- [Policy and Permissions](security/policy-and-permissions.md): 위험도, capability, 승인 정책
- [Policy Engine Runtime](security/policy-engine-runtime.md): `evaluatePolicy` 입력과 판정 규칙
- [Approval Flow Runtime](security/approval-flow-runtime.md): 승인 요청 저장과 상태 전이 계약
- [Memory Privacy](security/memory-privacy.md): 메모리 분류와 민감정보 처리
- [Memory API Runtime](security/memory-api-runtime.md): 메모리 write/search/delete 최소 런타임 계약
- [Runtime Control](security/runtime-control.md): 긴급 정지와 capability 권한 회수 계약
- [MVP Backlog](issues/mvp-backlog.md): GitHub Issue로 옮길 작업 목록
- [MVP Exit Criteria](issues/mvp-exit-criteria.md): 현재 MVP를 완료로 판단하는 종료 기준
- [Policy Regression](issues/policy-regression.md): Given/When/Then 기준 정책 회귀 시나리오
- [E2E Scenarios](issues/e2e-scenarios.md): 현재 구현 기준 대표 end-to-end 회귀 시나리오
- [Issue Template](issues/issue-template.md): 이슈 작성 템플릿

## 문서 작성 원칙

1. 구현자가 바로 작업을 시작할 수 있을 정도로 구체적으로 쓴다.
2. 추상적 목표보다 입력, 출력, 상태, 실패 조건, 수용 기준을 우선한다.
3. 정책 문서는 프롬프트 약속이 아니라 시스템 강제 조건으로 쓴다.
4. 모든 문서는 GitHub Issue로 분해 가능한 단위를 유지한다.
