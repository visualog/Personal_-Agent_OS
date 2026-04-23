# Remote Command Channel

상태: Draft v0.1  
최종 갱신: 2026-04-23

이 문서는 Personal Agent OS가 OpenClaw류의 로컬 설치형 에이전트로 가기 위한 첫 번째 원격 명령 채널 계약을 정의한다.

## 1. 목적

원격 명령 채널의 목표는 다음과 같다.

- 모바일이나 Telegram 같은 외부 채널에서 로컬 에이전트에 작업을 지시한다.
- 작업 상태를 다시 같은 채널에서 확인한다.
- 승인/거부/취소 같은 통제 명령을 같은 계약으로 보낸다.
- 명령 범위를 벗어나거나 위험한 행동을 독단적으로 하지 못하게 한다.

현재 구현은 `Telegram bot` 자체가 아니라, 그 위에 올라갈 공통 계약과 로컬 dev runtime API를 제공한다.

## 2. 현재 구현 범위

현재 경로:

- `packages/core/src/remote-control.ts`
- `scripts/command-center-demo-runtime.ts`
- `vite.config.ts`

현재 API:

- `POST /api/remote/commands`
- `GET /api/remote/tasks`
- `GET /api/remote/tasks/:id`

현재 지원 intent:

- `create_task`
- `get_status`
- `approve`
- `deny`
- `cancel`

## 3. 명령 형식

현재 text command 예시:

- `/task 이 저장소에서 인증 흐름을 정리해줘`
- `/status task_123`
- `/approve approval_123`
- `/deny approval_123`
- `/cancel task_123`

원칙:

- 명령은 짧고 명시적이어야 한다.
- `approve`, `deny`, `cancel`은 항상 식별자를 포함해야 한다.
- `create_task`는 기본적으로 최소 권한 scope를 가진다.

## 4. 범위 제한

원격 명령은 기본적으로 아래 제한을 가진다.

- `allow_read: true`
- `allow_write: false`
- `allow_execute: false`
- `allow_network: false`
- `allowed_paths: [workspace_root]`

코딩 작업으로 해석되는 경우에만 `allow_write: true`로 좁게 승격할 수 있다.

그러나 이 경우에도:

- 위험도는 낮아지지 않는다.
- 승인 게이트는 그대로 적용된다.
- scope 밖 경로로 확장할 수 없다.

## 5. 현재 dev runtime 동작

현재 dev runtime은 다음처럼 작동한다.

- 일반 task는 read 중심 orchestrator로 실행된다.
- 코딩 task는 write-capable orchestrator로 들어가며 승인 대기 상태를 만들 수 있다.
- `approve` / `deny` / `cancel`은 기존 approval/task 제어 경로를 재사용한다.

즉, 지금의 웹 입력창은 최종 UI가 아니라, 나중에 Telegram이 그대로 사용할 명령 계약을 검증하기 위한 테스트 채널이다.

## 6. 다음 단계

다음 구현 우선순위:

1. 실제 로컬 agent daemon 분리
2. Telegram transport adapter 추가
3. 원격 actor identity와 session model 추가
4. 작업 로그 push / polling 응답 포맷 정리
5. 원격 명령별 더 엄격한 scope 정책 추가
