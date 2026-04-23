# Telegram Bridge

## Goal

Telegram은 외부 모바일에서 로컬 에이전트로 들어오는 첫 번째 실제 채널이다.

이 브리지는 다음 원칙을 지킨다.

- Telegram 입력도 결국 `remote-control` 계약만 사용한다.
- 허용된 사용자 ID만 명령을 보낼 수 있다.
- 위험한 작업은 기존 approval flow를 그대로 사용한다.
- 명령 범위를 벗어난 실행 권한은 Telegram 채널이 임의로 열 수 없다.

## Current Files

- `packages/core/src/telegram-bridge.ts`
- `scripts/run-telegram-bridge.ts`
- `packages/core/src/remote-control.ts`

## Runtime Flow

1. 로컬 PC에서 `npm run start:telegram-bridge` 실행
2. 브리지가 Telegram `getUpdates` long polling 수행
3. 수신한 메시지의 `from.id`가 허용 사용자 목록에 있는지 확인
4. 허용된 메시지만 `submitRemoteCommand(...)`로 전달
5. 응답 요약을 Telegram 채팅으로 다시 보냄

## Environment Variables

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_USER_IDS`
- `PAOS_BRIDGE_POLL_INTERVAL_MS` (optional)

`TELEGRAM_ALLOWED_USER_IDS`는 쉼표 구분 숫자 문자열 목록이다.

예시:

```text
TELEGRAM_ALLOWED_USER_IDS=123456789,987654321
```

## Supported Commands

- `/help`
- `/task <요청>`
- `/status <task_id>`
- `/approve <approval_id>`
- `/deny <approval_id>`
- `/cancel <task_id>`

## Safety Notes

- 허용되지 않은 사용자는 초입에서 거부된다.
- Telegram 채널도 `allow_execute`, `allow_network`를 기본적으로 열 수 없다.
- 코딩 요청은 쓰기 가능 범위를 가질 수 있지만, 위험도는 planner/policy/orchestrator가 다시 판정한다.
- 현재 구현은 dev runtime에 연결된 로컬 bridge MVP다. 이후 실제 daemon/runtime storage로 교체 가능하도록 transport와 command contract를 분리해두었다.
