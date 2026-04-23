# Agent Daemon

## Goal

로컬 에이전트는 웹 dev 서버와 분리된 독립 프로세스로 실행되어야 한다.

이 daemon은 다음 역할을 가진다.

- 원격 명령 API를 항상 켜진 로컬 프로세스로 제공
- Telegram 브리지와 웹 미리보기의 공통 대상이 됨
- health endpoint를 제공해 연결 상태를 점검할 수 있음

## Current Files

- `scripts/agent-daemon.ts`
- `scripts/run-agent-daemon.ts`

## Endpoints

- `GET /health`
- `GET /api/command-center/state`
- `POST /api/command-center/reset`
- `POST /api/command-center/approvals/:id`
- `GET /api/remote/tasks`
- `GET /api/remote/tasks/:id`
- `POST /api/remote/commands`

## Default Runtime

현재 daemon은 `command-center-demo-runtime`을 백엔드로 사용한다.

이건 완전한 프로덕션 런타임은 아니지만, 중요한 건 transport가 분리됐다는 점이다.

- Telegram 브리지는 이제 Vite 서버 없이 daemon에 붙을 수 있다.
- 이후 persistent runtime으로 교체해도 API 표면은 유지할 수 있다.

## Run

```bash
npm run start:agent-daemon
```

기본 주소:

```text
http://127.0.0.1:4180
```

## Why This Matters

이 단계부터는 구조가 `웹 데모` 중심에서 `항상 켜진 로컬 agent process` 중심으로 이동한다.

즉, OpenClaw 스타일의 "내 컴퓨터에 설치된 에이전트"에 더 가까워진다.
