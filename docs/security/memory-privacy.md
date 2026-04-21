# Memory Privacy

작성일: 2026-04-22  
상태: Draft v0.1  
기준 문서: `docs/plans/2026-04-21-personal-agent-os-mvp-issue-plan.md`

## 0. 목적

이 문서는 Personal Agent OS MVP에서 메모리를 어떻게 분류하고, 무엇을 저장하며, 언제 삭제할지 정의한다.

목표는 다음과 같다.

- 장기 메모리가 자동 저장소가 되지 않게 한다.
- 민감 정보가 의도 없이 축적되지 않게 한다.
- 메모리 접근과 저장을 감사 가능하게 한다.
- 구현자가 classification, retention, deletion을 일관되게 다루게 한다.

## 1. 메모리 원칙

1. 메모리는 저장 전에 분류되어야 한다.
2. 민감 정보는 기본적으로 장기 저장하지 않는다.
3. 사용자의 명시 승인 없이 개인 식별 정보는 장기 메모리에 저장하지 않는다.
4. 목적이 불분명한 기억은 저장하지 않는다.
5. 메모리 쓰기와 삭제는 모두 감사 로그 대상이다.
6. 검색은 purpose와 task context를 함께 받아야 한다.

## 2. Memory Classes

### 2.1 ephemeral

짧은 작업 동안만 필요한 메모리다.

포함 예:

- 현재 task의 중간 상태
- 최근 tool output의 임시 참조
- planner가 만든 working note

기본 특성:

- 세션 또는 task 종료 후 삭제 대상
- 장기 검색 대상 아님
- 사용자 프로필에 반영하지 않음

### 2.2 project

특정 프로젝트나 workspace와 연결된 메모리다.

포함 예:

- 코드베이스 구조 요약
- 프로젝트 규칙
- 팀 합의된 작업 방식

기본 특성:

- 프로젝트가 유효한 동안 유지
- 관련 task context에서만 검색 우선
- 프로젝트가 폐기되면 함께 정리 가능

### 2.3 personal

사용자의 장기 선호나 작업 습관을 담는 메모리다.

포함 예:

- 선호하는 문체
- 반복되는 작업 방식
- 공개적으로 저장해도 되는 개인적 preference

기본 특성:

- 명시적 또는 강한 추론 근거가 있을 때만 저장
- 민감 속성이 섞이면 저장 금지 또는 재분류
- 사용자가 삭제를 요청할 수 있어야 함

### 2.4 sensitive

보호 수준이 높은 메모리다.

포함 예:

- 주민등록번호, 계좌 정보, 인증 정보
- 건강, 법률, 고도의 사생활 정보
- 외부 유출 시 피해가 큰 식별 정보

기본 특성:

- 기본적으로 장기 저장하지 않음
- 필요하더라도 별도 승인 또는 금지 정책 적용
- 검색 범위를 강하게 제한

### 2.5 blocked

저장하지 말아야 할 메모리다.

포함 예:

- 사용자가 저장을 원하지 않는 정보
- 정책상 금지된 정보
- context에서 추출했지만 사용 금지인 데이터

기본 특성:

- 저장 불가
- 검색 불가
- 장기 보존 불가
- 차단 사유만 감사 로그에 남김

## 3. Classification Rules

### 3.1 분류 입력

메모리 분류는 다음 정보를 함께 보고 판단한다.

- 원본 텍스트 또는 요약
- source task
- purpose
- 사용자의 명시 의도
- 민감도 힌트
- 저장 기간 기대치

### 3.2 분류 우선순위

1. blocked
2. sensitive
3. personal
4. project
5. ephemeral

우선순위가 높은 클래스가 있으면 그쪽을 따른다.

### 3.3 분류 원칙

- 개인 식별 정보가 있으면 기본적으로 sensitive 쪽으로 본다.
- 프로젝트 산출물이고 장기 재사용 가치가 있으면 project다.
- 사용자의 습관, 취향, 반복 선호는 personal 후보다.
- 지금 task에서만 의미가 있으면 ephemeral이다.

### 3.4 저장 전 검사

저장 전에 반드시 확인한다.

- classification이 존재하는가
- purpose가 명시되었는가
- storage class가 허용되는가
- sensitive 정보가 섞이지 않았는가
- 사용자 동의가 필요한 항목은 승인되었는가

## 4. Retention Policy

### 4.1 ephemeral retention

- 기본 보존 기간은 task 종료 시점까지다.
- 디버깅용 임시 보존이 필요하면 별도 시스템 정책으로 제한한다.
- 장기 메모리로 승격하지 않는다.

### 4.2 project retention

- 프로젝트가 active인 동안 유지한다.
- 프로젝트가 archive되면 검색 빈도와 사용 여부를 보고 정리한다.
- 오래된 프로젝트 메모리는 삭제 또는 축약 대상이 될 수 있다.

### 4.3 personal retention

- 사용자가 계속 유용하다고 확인한 경우 유지한다.
- 일정 기간 사용되지 않으면 재평가 대상이 된다.
- 새로운 정보가 오래된 선호를 덮으면 갱신한다.

### 4.4 sensitive retention

- 기본적으로 저장하지 않는다.
- 예외가 필요한 경우에도 최소 보존만 허용한다.
- 가능한 한 hashed, redacted, or pointer 형태를 사용한다.

### 4.5 blocked retention

- 저장하지 않는다.
- classification 실패나 금지 사유만 남긴다.

## 5. Deletion Rules

### 5.1 사용자 삭제

사용자는 자신의 메모리를 삭제할 수 있어야 한다.

삭제 시 동작:

- 메모리 레코드 삭제
- 검색 인덱스에서 제거
- 파생된 summary 또는 pointer가 있으면 함께 정리
- 감사 로그에 삭제 사실 기록

### 5.2 자동 삭제

다음 상황에서는 자동 삭제 또는 만료가 가능해야 한다.

- retention 기간 만료
- task 종료 후 ephemeral 정리
- 프로젝트 archive 후 관련 메모리 정리
- classification 재평가 결과 blocked로 전환

### 5.3 삭제 불가 또는 제한

- 감사 로그 원본은 별도 정책 없이는 임의 삭제하지 않는다.
- 법적 또는 운영상 보존 대상은 별도 보존 정책을 따른다.
- sensitive 메모리는 저장 자체를 회피하는 것이 우선이다.

## 6. Memory Write Flow

1. 후보 메모리가 생성된다.
2. classification이 수행된다.
3. policy가 저장 허용 여부를 판단한다.
4. 필요하면 approval을 요청한다.
5. 허용된 경우에만 저장한다.
6. 저장 결과를 audit에 남긴다.

## 7. Memory Search Flow

검색은 다음 입력을 함께 받아야 한다.

- `purpose`
- `task_context`
- `query`

검색 규칙:

- purpose가 없으면 검색 범위를 좁힌다.
- task context가 다르면 personal 또는 sensitive 메모리의 노출을 제한한다.
- sensitive는 기본적으로 검색 제외 또는 강한 필터 적용 대상이다.
- search 결과에는 class와 reason이 함께 반환되어야 한다.

## 8. Redaction and Minimization

메모리에 들어가기 전에 가능한 한 줄인다.

- 원문 전체 대신 필요한 부분만 저장
- 전화번호, 주소, 계정 정보는 가능한 한 마스킹
- 외부 도구 출력은 전체 저장보다 핵심 사실만 요약
- 불필요한 식별자는 제거

## 9. Audit Requirements

메모리 관련 이벤트는 모두 감사 대상이다.

필수 기록:

- `memory_id`
- `task_id`
- `classification`
- `decision`
- `reason`
- `purpose`
- `actor`
- `created_at`
- `deleted_at`

## 10. Deny Reasons

메모리 저장 거절 사유는 최소한 다음을 포함해야 한다.

- `missing_classification`
- `sensitive_data_detected`
- `personal_identifier_without_consent`
- `purpose_missing`
- `retention_policy_violation`
- `blocked_content`
- `approval_required_not_granted`
- `search_scope_too_broad`

예:

- "민감 정보가 포함되어 sensitive memory 저장이 차단됨"
- "purpose가 없어 long-term memory로 저장할 수 없음"
- "사용자 동의 없이 개인 식별 정보를 저장하려고 해서 거절됨"

## 11. Acceptance Test Cases

### 11.1 Classification

1. Given 작업 메모리 초안, When classification runs, Then `ephemeral`로 분류된다.
2. Given 프로젝트 규칙 요약, When classification runs, Then `project`로 분류된다.
3. Given 사용자의 문체 선호, When classification runs, Then `personal`로 분류된다.
4. Given 계좌번호 또는 인증 정보, When classification runs, Then `sensitive` 또는 `blocked`가 된다.
5. Given 저장 금지 요청이 포함된 데이터, When classification runs, Then `blocked`가 된다.

### 11.2 Retention

1. Given `ephemeral` memory, When task ends, Then 삭제 대상이 된다.
2. Given 오래 사용되지 않은 project memory, When retention job runs, Then 재평가 대상이 된다.
3. Given sensitive memory 후보, When policy evaluates it, Then 장기 저장이 거절된다.
4. Given blocked memory 후보, When write is attempted, Then 저장되지 않는다.

### 11.3 Deletion

1. Given 사용자가 memory deletion을 요청, When system processes it, Then 해당 memory가 삭제된다.
2. Given memory deletion, When audit is written, Then 삭제 사실이 trace와 함께 남는다.
3. Given search index, When memory is deleted, Then index에서도 제거된다.

### 11.4 Search

1. Given search request without purpose, When search runs, Then 결과가 제한된다.
2. Given search request with purpose and task_context, When search runs, Then 관련 범위만 반환된다.
3. Given sensitive memory, When normal search runs, Then 결과에 나타나지 않거나 강하게 제한된다.

## 12. 구현 체크리스트

- classification before write
- purpose required for search
- user deletion support
- sensitive and blocked default non-persistence
- audit for write/delete/classification decisions
- explicit policy for retention and expiry

