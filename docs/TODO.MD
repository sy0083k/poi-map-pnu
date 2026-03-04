# TODO 백로그 (Risk & Improvement Tracker)

프로젝트: 관심 필지 지도 (POI Map Geo)  
작성일: 2026-02-23  
최종 수정일: 2026-03-04  
운영 주기: 매주 1회 (월요일 기준)

## 목적
- 코드베이스 주요 리스크와 개선 과제를 단일 문서에서 추적한다.
- 우선순위, 상태, 담당, 목표일, 완료 기준을 명시해 실행 가능성을 높인다.

## 운영 규칙
- 상태(`status`)
  - `todo`: 착수 전
  - `doing`: 진행 중
  - `blocked`: 차단 상태 (사유/해소 조건 필수)
  - `done`: 완료 (성공 기준 충족)
- 우선순위(`priority`)
  - `P0`: 서비스 안정성/보안/데이터 무결성에 즉시 영향
  - `P1`: 단기 개선 필요
  - `P2`: 중장기 개선
- 업데이트 규칙
  - 상태 변경 시 `최종 수정일` 및 리뷰 로그를 함께 갱신한다.
  - `doing` 항목은 최대 2개로 유지한다.
  - `blocked`는 `notes`에 차단 사유와 해소 조건을 반드시 기록한다.

## 우선순위 백로그
| id | priority | title | status | owner | target_date | success_criteria | notes |
|---|---|---|---|---|---|---|---|
| RISK-001 | P0 | 설정 변경 즉시 반영 불가 | todo | unassigned | 2026-03-09 | 관리자 설정/비밀번호 변경 후 재시작 없이도 반영 전략이 문서화되고 구현/운영 절차가 확정된다. | 관련: `app/core/config.py`, `app/main.py` |
| RISK-002 | P0 | 인메모리 제한기 다중 인스턴스 한계 | todo | unassigned | 2026-03-09 | 로그인/이벤트 레이트리밋이 멀티 인스턴스 환경에서 일관 동작하도록 공유 스토어 전략이 확정된다. | 관련: `app/auth_security.py`, `app/rate_limit.py` |
| RISK-003 | P1 | FlatGeobuf 뷰포트 로딩 내구성/성능 검증 부족 | todo | unassigned | 2026-03-09 | 파일 교체/대용량 뷰포트 이동 시에도 지도 렌더링이 안정적으로 동작하고 성능 한계가 문서화된다. | 관련: `frontend/src/map/cadastral-fgb-layer.ts`, `app/services/cadastral_fgb_service.py` |
| RISK-004 | P1 | 공개 다운로드 응답 메모리 사용량 리스크 | todo | unassigned | 2026-03-09 | 대용량 파일에서도 서버 메모리 급증 없이 다운로드를 처리하도록 스트리밍 응답 방식이 적용된다. | 관련: `app/services/public_download_service.py` |
| RISK-005 | P1 | 프런트 전체 데이터 선적재로 인한 확장성 한계 | todo | unassigned | 2026-03-09 | 데이터 증가 시 초기 로딩 시간/브라우저 메모리 사용을 제어하는 점진 로딩 전략이 수립된다. | 관련: `frontend/src/map/lands-client.ts` |
| RISK-006 | P1 | 루트 pytest 수집 충돌(복제본 tests 중복) | done | team | 2026-03-02 | 루트 `pytest -q`가 `tests/`만 수집하고 `IdlePublicProperty/`와의 `conftest` 충돌 없이 통과한다. | 관련: `pyproject.toml` (`testpaths`, `norecursedirs`) |
| RISK-007 | P1 | 관리자 세션 쿠키 앱 간 교차 인식 | done | team | 2026-03-02 | 세션 쿠키명/네임스페이스 분리와 인증 검증 강화로 동일 도메인 다중 앱 간 세션 재사용이 차단된다. | 관련: `app/main.py`, `app/dependencies.py`, `app/services/auth_service.py` |

## 주간 리뷰 로그
- 2026-02-23 | reviewer: team | 초기 백로그 문서 생성 및 5개 리스크 등록 | 다음 액션: RISK-001, RISK-002 우선 설계안 작성
- 2026-02-25 | reviewer: team | 관리자 통계 탭에 경계선 현황(전체/미수집) 및 수동 재수집(백그라운드 잡 + 상태 폴링) 기능 반영 | 다음 액션: RISK-003 내구성(프로세스 재시작 시 잡 지속성) 본 과제로 분리 검토
- 2026-02-27 | reviewer: team | 비아카이브 문서를 현재 코드 기준(POI 용어/품질 게이트/API 운영 정책)으로 동기화 | 다음 액션: RISK-001, RISK-002 설계안 확정
- 2026-03-02 | reviewer: team | 루트 pytest 수집 범위를 `tests/`로 고정하고 복제본(`IdlePublicProperty/`) 재귀 수집 제외 설정 반영 | 다음 액션: CI에서 `pytest -q` 충돌 재발 여부 모니터링
- 2026-03-02 | reviewer: team | 업로드/지도 흐름을 PNU 기반 경계선 조회로 전환하고 `/admin/stats` 재조회 API로 정리 | 다음 액션: RISK-003, RISK-005(대량 PNU 조회 성능) 운영 관측값 축적
- 2026-03-02 | reviewer: team | 세션 쿠키 분리(`SESSION_COOKIE_NAME`, `SESSION_NAMESPACE`) 및 인증 네임스페이스 검증을 적용해 IdlePublicProperty 로그인 쿠키의 교차 인증 가능성을 차단 | 다음 액션: 운영 환경 SECRET_KEY/쿠키명 분리 상태 점검
- 2026-03-04 | reviewer: team | WMS 경로/프록시를 제거하고 WFS 고정 필지(`/api/cadastral/fgb`) 표시로 지도 기본 경로를 단순화 | 다음 액션: RISK-005(초기 로드 성능) 관측값 기반 최적화
- 2026-03-04 | reviewer: team | WFS PNU 조회 시 응답 피처의 `pnu/PNU` 일치 검증을 추가해 타지역 오표시(잘못된 first-feature 캐시) 재발을 차단 | 다음 액션: 운영 환경에서 캐시 초기화 후 위치 정확도 점검
- 2026-03-04 | reviewer: team | WFS PNU 질의를 `pnu/PNU` 이중 필터로 보강하고 `feature.id` 기반 식별 추출 및 캐시 검증 버전(3) 상향으로 전건 미표시 문제를 복구 | 다음 액션: 운영 로그에서 `WFS_PNU_MISMATCH/WFS_NO_FEATURES` 비율 관측
- 2026-03-04 | reviewer: team | WFS 기반 경로를 제거하고 FlatGeobuf(`data/LSMD_CONT_LDREG_44210_202512.fgb`) 기반 렌더링으로 전환 | 다음 액션: `CADASTRAL_MIN_RENDER_ZOOM`/브라우저 메모리 지표 기반 성능 최적화
- 2026-03-04 | reviewer: team | 초기 미표시 이슈 대응으로 `MAP_DEFAULT_ZOOM`을 `CADASTRAL_MIN_RENDER_ZOOM`과 정합(15)시키고 불일치 경고 로깅을 추가 | 다음 액션: 운영에서 초기 렌더 성공률/줌아웃 체감 모니터링
- 2026-03-04 | reviewer: team | 업로드 목록 조회 실패/0건과 무관하게 배경 연속지적도를 항상 렌더링하고, 관심 필지 강조만 조건부로 표시하도록 프런트 흐름을 분리 | 다음 액션: 운영에서 `/api/lands/list` 실패 시 배경 레이어 유지 여부 관측
- 2026-03-04 | reviewer: team | 연속지적도 렌더 단계에 `dataProjection=CADASTRAL_FGB_CRS`를 명시해 OpenLayers 투영 오인(기본 4326)으로 인한 미표시를 수정 | 다음 액션: 운영 브라우저 콘솔에서 `parsedFeatureCount` 경고 재발 여부 모니터링
- 2026-03-04 | reviewer: team | 하이라이트 생성 범위를 뷰포트 기반에서 업로드 PNU 전용 1회 매칭 캐시로 전환해 목록 1~4건만 보이던 문제를 해소 | 다음 액션: 대량 업로드(1천건+)에서 초기 하이라이트 준비 시간/브라우저 메모리 관측
- 2026-03-04 | reviewer: team | 지도 렌더 정책을 하이라이트 전용으로 전환해 하이라이트 외 배경 연속지적도 표시를 제거 | 다음 액션: 운영에서 하이라이트 준비 실패율 및 사용자 맥락 손실(배경 부재) 피드백 관측
- 2026-03-04 | reviewer: team | 선택 토지 정보 UI를 지도 팝업에서 우상단 패널로 전환하고, 업로드 원본 컬럼을 `sourceFields`로 동적 렌더링하도록 확장 | 다음 액션: 대용량 컬럼셋(20+ 필드)에서 패널 렌더 성능/가독성 관측
- 2026-03-04 | reviewer: team | 우상단 상세 패널의 필드 표시를 `속성<TAB>값` 단일행 포맷으로 변경해 정보 밀도를 높임 | 다음 액션: 운영에서 모바일 가독성/탭 정렬 일관성 관측
- 2026-03-04 | reviewer: team | 우상단 상세 패널 제목을 `상세 정보`로 통일하고, 속성/값 2열 그리드로 값 열 x축 자동 정렬을 적용 | 다음 액션: 긴 속성명/긴 값 조합에서 모바일 줄바꿈 가독성 관측
- 2026-03-04 | reviewer: team | 배경지도 선택 UI를 제거하고 기본 배경 레이어를 위성 지도로 고정 | 다음 액션: 사용자 피드백에서 베이스맵 전환 요구 빈도 관측
- 2026-03-04 | reviewer: team | 우상단 상세 패널 헤더에 닫기(`X`) 버튼을 추가하고 속성/값 Pair를 동일 라인(y축)으로 정렬해 표시 안정성을 개선 | 다음 액션: 운영에서 닫기 버튼 사용 빈도와 재선택 재표시 UX 관측
- 2026-03-04 | reviewer: team | 지도 클릭/사이드바 선택된 필지의 경계선을 노란색으로 강조하고 비선택 필지는 빨간색을 유지하도록 선택 스타일 분기를 추가 | 다음 액션: 다건 필터링/페이지 이동 시 선택 스타일 유지 여부 관측
