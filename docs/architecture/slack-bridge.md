# Slack Bridge

## Goal

Slack은 Telegram 대신 쓸 수 있는 첫 번째 대체 메신저 채널이다.

이 브리지는 다음 원칙을 지킨다.

- Slack 입력도 결국 `remote-control` 계약만 사용한다.
- 허용된 사용자와 허용된 채널만 처리한다.
- 위험한 작업은 기존 approval flow를 그대로 사용한다.
- 명령 범위를 벗어난 실행 권한은 Slack 채널이 임의로 열 수 없다.

## Current Files

- `packages/core/src/slack-bridge.ts`
- `scripts/run-slack-bridge.ts`
- `packages/core/src/remote-control.ts`

## Runtime Flow

1. 로컬 PC에서 `npm run start:slack-bridge` 실행
2. 시작 시 `auth.test`로 Slack bot identity 확인
3. `PAOS_AGENT_DAEMON_URL`이 있으면 daemon health 확인
4. 허용된 channel 목록을 polling
5. 허용된 사용자 메시지 중 명령 텍스트만 `submitCommand(...)`로 전달
6. 응답 요약을 같은 채널에 다시 보냄

## Environment Variables

- `SLACK_BOT_TOKEN`
- `SLACK_ALLOWED_USER_IDS`
- `SLACK_ALLOWED_CHANNEL_IDS`
- `PAOS_AGENT_DAEMON_URL` (optional)
- `PAOS_BRIDGE_POLL_INTERVAL_MS` (optional)

예시:

```text
SLACK_BOT_TOKEN=xoxb-...
SLACK_ALLOWED_USER_IDS=U0123456789
SLACK_ALLOWED_CHANNEL_IDS=C0123456789
```

전체 예시는 repo root의 `.env.example` 참고.

## Supported Commands

- `/help`
- `/task <요청>`
- `/status <task_id>`
- `/approve <approval_id>`
- `/deny <approval_id>`
- `/cancel <task_id>`

Slack에서 `/`로 시작하는 메시지는 Slack 자체 slash command로 해석될 수 있다. 현재 bridge는 channel message polling 기반이므로, 수동 테스트에서는 앞에 공백을 붙인 형태가 안정적이다.

```text
 /task README.md 파일에서 로그인 오류 수정 방향을 정리해줘
```

## Coding Flow

파일 경로가 없는 코딩 요청:

- `docs/agent-drafts/<task-id>.md` 제안 초안 생성
- 실제 source file 수정 없음
- approval 없음

파일 경로가 있는 코딩 요청:

- `docs/agent-drafts/<task-id>.patch` patch 제안 생성
- 실제 source file 수정 전 approval 요청
- `/approve <approval_id>` 후 `workspace.apply_patch` 실행
- 현재 patch 적용은 append-only로 제한

## Safety Notes

- 허용되지 않은 사용자는 초입에서 거부된다.
- 허용되지 않은 채널은 아예 처리하지 않는다.
- Slack 채널도 `allow_execute`, `allow_network`를 기본적으로 열 수 없다.
- 코딩 요청은 쓰기 가능 범위를 가질 수 있지만, 위험도는 planner/policy/orchestrator가 다시 판정한다.
- 실제 파일 적용은 patch 제안 생성과 승인 단계를 거쳐야 한다.
- 브리지 시작 시 auth identity와 daemon health를 먼저 확인해서 설정 오류를 초기에 드러낸다.
