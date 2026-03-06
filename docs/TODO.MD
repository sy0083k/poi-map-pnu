# TODO 백로그 (Risk & Improvement Tracker)

프로젝트: 관심 필지 지도 (POI Map Geo)  
작성일: 2026-02-23  
최종 수정일: 2026-03-06  
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
| RISK-003 | P1 | FlatGeobuf 뷰포트 로딩 내구성/성능 검증 부족 | doing | team | 2026-03-12 | 파일 교체/대용량 뷰포트 이동 시에도 지도 렌더링이 안정적으로 동작하고 성능 한계가 문서화된다. | 관련: `frontend/src/map/cadastral-fgb-layer.ts`, `app/services/cadastral_fgb_service.py` / 2026-03-06: Web Worker 파싱 + IndexedDB 캐시(`theme+pnuSetHash+ETag`) + `/api/cadastral/fgb` ETag 반영 |
| RISK-004 | P1 | 공개 다운로드 응답 메모리 사용량 리스크 | done | team | 2026-03-05 | 공개 다운로드 기능 제거로 관련 응답 메모리 리스크가 소거된다. | 관련 코드(`app/services/public_download_service.py`, `/api/public-download`, `/admin/public-download/*`) 제거 완료 |
| RISK-005 | P1 | 프런트 전체 데이터 선적재로 인한 확장성 한계 | doing | team | 2026-03-12 | 데이터 증가 시 초기 로딩 시간/브라우저 메모리 사용을 제어하는 점진 로딩 전략이 수립된다. | 관련: `frontend/src/map/lands-list-client.ts`, `frontend/src/map.ts` / 2026-03-06: `map.ts`/`admin.ts` 책임 분리 리팩터링 착수 |
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
- 2026-03-05 | reviewer: team | 메인 화면 상단 헤더 메뉴(`시작/배경지도/주제도`)와 데스크톱 사이드바 슬라이드 수납(상태 복원)을 추가하고, 메뉴 하위항목은 준비중 토스트 UI로 연결 | 다음 액션: 실제 배경지도/주제도 토글 정책 확정 및 문서 정책(위성 고정) 재검토
- 2026-03-05 | reviewer: team | 사이드바 타이틀 영역 제거, 데스크톱 수납 트리거를 버튼에서 핸들로 전환, `배경지도` 메뉴를 `일반지도/영상지도/하이브리드` 순서의 실제 전환으로 반영 | 다음 액션: 주제도 메뉴 실데이터/렌더링 연동 범위 정의
- 2026-03-05 | reviewer: team | 상단 헤더 `시작` 메뉴를 새 탭 링크에서 같은 창 `/readme` 전환으로 변경하고 글로벌 헤더를 유지한 README 페이지를 추가 | 다음 액션: README 마크다운 렌더링(서식/링크/목차) 고도화 필요성 검토
- 2026-03-05 | reviewer: team | 지도 상세 패널 초기 숨김/헤더 메뉴 x좌표 고정 오프셋 정책을 반영하고 하이라이트 초기 지연 원인(Full scan, 초기 중복 렌더, moveend 재렌더) 조사 결과를 유지보수 문서에 기록 | 다음 액션: RISK-003, RISK-005 최적화 구현 우선순위 확정
- 2026-03-05 | reviewer: team | 헤더 메뉴 구분 바 추가, 선택 필지 상위 레이어 렌더 적용, 사이드바 핸들 방향 힌트 UI를 반영 | 다음 액션: 인접 필지 밀집 구간에서 선택 경계선 가시성 회귀 모니터링
- 2026-03-05 | reviewer: team | 상단 헤더 `주제도` 하위 메뉴를 `시유재산/공유재산(시·도)/국·공유지`로 재구성하고 `국·공유지`/`시유재산` 테마 전환(초기 동일 데이터 복제) 및 `공유재산(시·도)` 준비중 토스트를 반영 | 다음 액션: 소유구분 실데이터 분류 규칙(`property_manager`/원본컬럼) 확정 후 테마별 필터 경로 분리
- 2026-03-05 | reviewer: team | 관리자 업로드를 `국·공유재산(/admin/upload)`/`시유지(/admin/upload/city)`로 분리하고, `poi/poi_city` 이중 테이블 + `/api/lands*?theme=` 조회 계약을 반영 | 다음 액션: `공유재산(시·도)` 전용 업로드/조회 정책 및 스키마 확장 여부 결정
- 2026-03-05 | reviewer: team | `시유재산` 테마 유틸리티 사이드바에 `재산관리관` 입력 필터를 추가하고, 다중 고유값 검출 시 상태 영역에 검출 목록을 노출하도록 반영 | 다음 액션: 재산관리관 자동완성/제안 목록 UX 및 telemetry 필드 확장 여부 검토
- 2026-03-05 | reviewer: team | 재산관리관 다중 검출(고유값 2개+) 시 검색을 중단하고 목록/하이라이트를 비운 뒤 상태 영역(`#map-status`)을 지도 캔버스 상단 1줄 오버레이로 이동 | 다음 액션: 재산관리관 후보 클릭형 UX(메시지에서 즉시 재검색) 도입 여부 검토
- 2026-03-05 | reviewer: team | 업로드/강조 건수 상태 메시지(`업로드 하이라이트 N건, ... 강조 N건`)를 필터-목록 사이에서 지도 캔버스 상단 오버레이로 재배치하고 모바일에도 동일 정책을 적용 | 다음 액션: 장문 상태 메시지의 축약(ellipsis) 가독성 및 접근성 안내 문구 개선 여부 검토
- 2026-03-05 | reviewer: team | 데스크톱 `#map-status` 폭을 좌상단 줌 UI 비가림 회피형으로 조정하고 `X` 버튼 임시 닫기(다음 상태 갱신 시 자동 재표시) 동작을 추가 | 다음 액션: 장문 메시지/다국어 문자열에서 닫기 버튼 대비 및 접근성(스크린리더 안내) 검토
- 2026-03-05 | reviewer: team | 배경지도 메뉴에 `백지도(White)`를 추가하고 순서를 `일반지도/백지도/영상지도/하이브리드`로 조정 | 다음 액션: White 레이어 선택 비율 telemetry 수집 필요성 검토
- 2026-03-05 | reviewer: team | `백지도(White)` 미표시 이슈를 VWorld WMTS layer 식별자 매핑(`White -> white`) 및 White 최대 줌 18 보정으로 수정 | 다음 액션: 운영 브라우저에서 White 선택 시 타일 공백 재발 여부 모니터링
- 2026-03-05 | reviewer: team | 지도 사이드바 다운로드 버튼을 `검색 결과 다운로드`로 변경하고 `/api/lands/export`를 통해 현재 검색 결과 `landIds`의 원본 업로드 컬럼 전체 속성을 Excel로 제공하도록 전환 | 다음 액션: 대용량 다운로드(수만 건) 비동기 큐/백그라운드 작업 전환 필요성 검토
- 2026-03-05 | reviewer: team | 주제도별 진입 경로를 `국·공유지=/gukgongyu`, `시유재산=/siyu`로 추가하고 메뉴 전환/뒤로가기/popstate 동기화를 반영 | 다음 액션: `.html` 별칭 경로(`/gukgongyu.html`, `/siyu.html`) 필요 여부 결정
- 2026-03-05 | reviewer: team | 루트 경로(`/`)를 `307 Temporary Redirect`로 `/siyu`에 위임해 기본 진입 주제도를 시유재산으로 고정 | 다음 액션: 운영 배포 후 북마크/링크 유입의 경로 전환 영향(로그) 모니터링
- 2026-03-05 | reviewer: team | 글로벌 헤더 `주제도` 하위 메뉴 표기명을 `시유지/공유지(시+도)/국·공유지` 순서로 조정하고 기존 `시유재산/공유재산(시·도)` 표기를 대체 | 다음 액션: 운영 용어집(사용자 안내 문구/매뉴얼) 동기화 점검
- 2026-03-05 | reviewer: team | `public_download` 기능(`/api/public-download`, `/admin/public-download/*`)과 설정(`PUBLIC_DOWNLOAD_*`)을 코드/문서/테스트에서 제거 | 다음 액션: 운영 환경의 잔존 `data/public_download/` 파일 수동 정리 여부 결정
- 2026-03-06 | reviewer: team | 프런트 오케스트레이션 분해(`map.ts` -> `map/land-workflow.ts`, `map/topbar-menu.ts`, `map/layout-controls.ts`, `map/feedback.ts`) 및 `admin.ts` 모듈 분리를 반영 | 다음 액션: `land-workflow.ts`/`admin/stats.ts` 추가 분해와 점진 로딩 전략 설계 계속
- 2026-03-06 | reviewer: team | `poi_repository` 축소 1단계로 테스트 호출부를 `land/event/web_visit/job` 도메인 repository 직접 사용으로 전환하고, `poi_repository`에 deprecation shim 경고를 추가 | 다음 액션: Step 2에서 `poi_repository.py` 완전 제거 및 참조 0건 CI 규칙 유지
- 2026-03-06 | reviewer: team | 하이라이트 초기 지연 대응으로 FlatGeobuf 파싱을 Web Worker로 이동하고, IndexedDB 캐시 및 `/api/cadastral/fgb` ETag를 도입 | 다음 액션: 초기 표시 시간/Long Task 관측값 수집 후 서버 서브셋 API 필요성 재평가
- 2026-03-06 | reviewer: team | 유틸리티 사이드바 필터에 `재산용도`, `지목` 입력을 추가해 두 테마 공통 복합 검색을 확장 | 다음 액션: 재산용도 표기(원본 컬럼 라벨) 표준화 및 자동완성 UX 도입 여부 검토
- 2026-03-06 | reviewer: team | 유틸리티 사이드바에서 `재산용도`를 콤보(`행정재산/일반재산`)로 전환하고 `재산용도/지목`를 `지역명·주소` 바로 아래 1줄 배치로 조정 | 다음 액션: 재산용도 값 표준화 미준수 데이터(오탈자/공백) 정제 정책 수립
- 2026-03-06 | reviewer: team | 글로벌 헤더에서 `주제도` 우측 탑레벨 메뉴 `파일→지도`를 추가하고, `주제도` 하위는 `시유지`만 유지하도록 정리 | 다음 액션: 엑셀 업로드 기반 `파일→지도` 생성 기능의 실제 엔드포인트/권한 UX를 확정
- 2026-03-06 | reviewer: team | `/file2map`을 `/siyu`와 기능 동등하게 맞추기 위해 `재산관리관` 필터 분기를 제거하고 `poi_city -> poi` 1회 복제 스크립트를 추가 | 다음 액션: `/file2map` 독립 개선 요구사항 확정 후 테마별 기능 플래그 재분리 여부 결정
- 2026-03-06 | reviewer: team | `/file2map` 유틸리티 사이드바를 로컬 업로드 중심으로 전환하고 `재산관리관/재산용도` UI를 제거, 업로드 데이터 IndexedDB 복원 및 클라이언트 Excel 다운로드를 반영 | 다음 액션: 업로드 파일 크기 상한/브라우저 저장소 한계에 대한 운영 가이드 보강
- 2026-03-06 | reviewer: team | `/file2map` 최초 진입 시 목록 비표시로 전환하고, 서버 `national_public` 경로(`poi`, `/admin/upload`)를 제거해 `poi_city` 단일 데이터 소스로 정리 | 다음 액션: 운영 DB에서 `scripts/remove_legacy_national_table.py` 실행 여부와 백업 정책 확정
