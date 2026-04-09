## Purpose
이 문서는 이 저장소에서 작업하는 모든 에이전트/기여자가 따라야 하는 실행 절차와 보고 요구사항을 정의한다.
규범 기준의 재서술을 피하고, 현행 기준 문서와 코드 구조를 일관되게 따르게 하는 것이 목적이다.

## Source of Truth and Document Roles
- 최우선 규범 기준: `docs/engineering-guidelines.md`
- 보조 현행 문서:
  - `docs/architecture.md`
  - `docs/maintenance.md`
  - `docs/stride-lite.md`
  - `docs/TODO.MD`
  - `README.MD`
- 문서 허브: `docs/index.md`
  - 탐색과 링크 확인을 위한 허브 문서로 사용한다.
  - 구현/리뷰 기준을 독자적으로 정의하는 문서로 취급하지 않는다.

## Mandatory Pre-Check (필수)
- 계획 수립, 구현, 리뷰 전에 `docs/engineering-guidelines.md`를 먼저 확인한다.
- 작업 성격에 따라 관련 현행 문서를 추가 확인한다.
  - 구조/흐름 변경: `docs/architecture.md`
  - 운영/절차 변경: `docs/maintenance.md`
  - 보안 통제 변경: `docs/stride-lite.md`
  - 사용자/운영 요약 변경: `README.MD`
  - 문서 링크/허브 확인: `docs/index.md`
  - 리스크/개선 항목 변경: `docs/TODO.MD`
- 기준 문서의 규칙은 재정의하지 말고 그대로 따른다.
- 답변/PR 설명에는 아래를 명시한다:
  - 가이드라인 준수 여부
  - 충돌 지점(있다면)과 사유/대안
  - 테스트 결과
  - 잔여 리스크

## Execution and Reporting Requirements (필수)
- 아키텍처, 프런트엔드, 보안, API 계약, 테스트 기준은 `docs/engineering-guidelines.md`를 따른다.
- 기능/정책을 바꿀 때는 관련 현행 문서를 함께 검토하고 필요한 문서 동기화를 수행한다.
- 저장소 파일을 수정한 작업의 최종 답변에는 적절한 git commit title을 제안한다.
- 저장소 파일 변경에는 코드와 문서 변경을 모두 포함한다.
- 설정 변경이 있으면 `.env` 갱신만으로 즉시 반영되지 않을 수 있으므로 재시작 필요성을 설명한다.
- 로그인/이벤트 레이트리밋은 인메모리 기반이므로, 관련 변경에서는 멀티 인스턴스 한계를 설명한다.

## Document Sync Checklist
기능/정책 변경 시 아래 문서를 함께 갱신한다.
- 구조/흐름 변경: `docs/architecture.md`
- 운영/절차 변경: `docs/maintenance.md`
- 보안 통제 변경: `docs/stride-lite.md`
- 사용자/운영 요약 변경: `README.MD`
- 문서 허브 링크/요약 변경: `docs/index.md`
- 리스크/개선 항목 영향: `docs/TODO.MD`

## TODO Governance
- 리스크/개선 작업을 다룰 때 `docs/TODO.MD`를 함께 업데이트한다.
- 상태(`todo/doing/blocked/done`), 목표일, 리뷰 로그를 최신화한다.

## Archive Documents
- `docs/refactoring-strategy.md`는 아카이브 문서이며 현행 강제 규칙으로 사용하지 않는다.
- `docs/reports/*` 문서가 존재하더라도 아카이브/기준선 참고용으로만 취급하고, 현행 강제 규칙으로 사용하지 않는다.
