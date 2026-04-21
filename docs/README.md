# Documentation Index

이 디렉터리는 Personal Agent OS의 설계, 보안 정책, 이슈 백로그, 구현 계획을 관리한다.

## 시작점

- [MVP Issue Plan](plans/2026-04-21-personal-agent-os-mvp-issue-plan.md): 첫 번째 기준 문서
- [Domain Model](architecture/domain-model.md): 핵심 도메인 객체와 상태 전이
- [Events](architecture/events.md): 내부 이벤트 계약과 payload 기준
- [Policy and Permissions](security/policy-and-permissions.md): 위험도, capability, 승인 정책
- [Memory Privacy](security/memory-privacy.md): 메모리 분류와 민감정보 처리
- [MVP Backlog](issues/mvp-backlog.md): GitHub Issue로 옮길 작업 목록
- [Issue Template](issues/issue-template.md): 이슈 작성 템플릿

## 문서 작성 원칙

1. 구현자가 바로 작업을 시작할 수 있을 정도로 구체적으로 쓴다.
2. 추상적 목표보다 입력, 출력, 상태, 실패 조건, 수용 기준을 우선한다.
3. 정책 문서는 프롬프트 약속이 아니라 시스템 강제 조건으로 쓴다.
4. 모든 문서는 GitHub Issue로 분해 가능한 단위를 유지한다.

