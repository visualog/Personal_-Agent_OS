# Memory API Runtime

상태: Draft v0.1  
최종 갱신: 2026-04-22

이 문서는 Personal Agent OS의 최소 Memory API 런타임 계약을 정리한다.

## 1. 범위

현재 구현 범위:

- `write(...)`
- `search(...)`
- `delete(...)`
- in-memory memory store
- `memory.written`, `memory.read`, `memory.deleted` 이벤트 발행
- 감사 로그 기록

아직 없는 것:

- embedding/vector search
- background expiry job
- cross-project ranking
- approval workflow와의 직접 연결

## 2. Write Flow

입력:

- `task_id`
- `content`
- `source`
- `purpose`
- `retention`
- `user_approved?`

실행 순서:

1. content를 classification 규칙으로 분류한다.
2. `purpose`가 비어 있으면 거절한다.
3. `blocked` 분류면 저장하지 않는다.
4. `sensitive` 분류면 저장하지 않는다.
5. `personal` 분류는 `user_approved=true`일 때만 저장한다.
6. 허용되면 `MemoryEntry`를 `stored` 상태로 저장한다.
7. `memory.written` 이벤트와 audit record를 남긴다.

## 3. Search Flow

입력:

- `query`
- `purpose`
- `task_context`

실행 순서:

1. `purpose`로 허용 scope를 계산한다.
2. 허용 scope 안의 stored memory만 검색한다.
3. `query` 또는 `task_context`와 일치하는 항목만 반환한다.
4. `memory.read` 이벤트와 audit record를 남긴다.

현재 scope 규칙:

- preference 목적: `personal`, `project`, `ephemeral`
- project/workspace 목적: `project`, `ephemeral`
- 그 외 기본: `ephemeral`, `project`

## 4. Delete Flow

입력:

- `id`
- `reason`

실행 순서:

1. memory entry를 찾는다.
2. 있으면 `status=deleted`로 바꾼다.
3. `memory.deleted` 이벤트와 audit record를 남긴다.

현재 구현은 hard delete가 아니라 soft delete다.

## 5. 이벤트 계약

### `memory.written`

- 저장 성공 또는 저장 거절 모두 이 이벤트를 남긴다.
- 핵심 payload:
  - `memory_id`
  - `memory_class`
  - `source_task_id`
  - `retention`
  - `redacted`
  - `decision`
  - `reason`

### `memory.read`

- search 호출 시 남긴다.
- 핵심 payload:
  - `query`
  - `purpose`
  - `task_context`
  - `result_count`
  - `allowed_scopes`

### `memory.deleted`

- delete 성공 시 남긴다.
- 핵심 payload:
  - `memory_id`
  - `source_task_id`
  - `reason`
  - `deleted`

## 6. 수용 기준

- project memory는 저장 가능해야 한다.
- sensitive content는 기본 저장 차단되어야 한다.
- personal memory는 명시 승인 없이는 저장되지 않아야 한다.
- search는 purpose/task_context를 함께 사용해야 한다.
- delete 후 memory는 `deleted` 상태가 되어야 한다.
- 모든 write/search/delete는 audit 대상이어야 한다.
