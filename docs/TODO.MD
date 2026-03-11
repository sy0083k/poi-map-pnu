# TODO 백로그 (Risk & Improvement Tracker)

프로젝트: 관심 필지 지도 (POI Map PNU)  
작성일: 2026-02-23  
최종 수정일: 2026-03-10  
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
| RISK-003 | P1 | FlatGeobuf 뷰포트 로딩 내구성/성능 검증 부족 | doing | team | 2026-03-12 | 파일 교체/대용량 뷰포트 이동 시에도 지도 렌더링이 안정적으로 동작하고 성능 한계가 문서화된다. | 관련: `frontend/src/map/cadastral-fgb-layer.ts`, `app/services/cadastral_fgb_service.py` / 2026-03-06: Web Worker 파싱 + IndexedDB 캐시(`theme+pnuSetHash+ETag`) + `/api/cadastral/fgb` ETag 반영 / 2026-03-08: `/api/cadastral/highlights` 서버 필터링 API(클라이언트 워커 폴백 유지) 1단계 적용 / 2026-03-08: 2단계로 `/api/cadastral/highlights`에 `bbox+bboxCrs` 부분 응답 확장 및 캐시 키(`bbox` 포함) 반영 / 2026-03-08: 서버 로더를 `flatgeobuf.Reader(..., bbox=...)` 우선 + `load(..., bbox=...)` 폴백으로 전환해 전체 로드 회피 적용 / 2026-03-08: 캐시 전략 3단계로 키 버전 `v2`(bbox 2자리 정규화 + CRS) 적용, 서버 LRU/TTL 제어(`HIGHLIGHT_CACHE_*`), IndexedDB v2 만료/용량 정리 정책 반영 / 2026-03-10: `/siyu?debugFgb=1` + `/api/cadastral/debug-probe`를 추가해 검색 흐름과 분리된 원본 FGB probe overlay 검증 경로를 마련 / 2026-03-11: SQLite `parcel_render_item` 렌더 인덱스를 도입해 `/api/cadastral/highlights` 기본 경로를 FGB 재스캔에서 `PNU IN (...)` 조회로 전환하고, FGB 업로드 성공 시 인덱스를 즉시 재생성하도록 변경 / 2026-03-11: `/siyu`에서 viewport query CRS와 geometry render projection(`CADASTRAL_FGB_CRS`)을 분리하고, 첫 bbox seed 0건 시 bbox 없는 1회 fallback을 추가해 blank layer 회귀를 보완 / 2026-03-11: MapLibre와 worker가 공통 좌표 변환 유틸을 사용하도록 정리하고 `EPSG:3857 -> EPSG:4326` 변환 누락으로 인한 `/siyu` blank layer 회귀를 수정 / 2026-03-11: 선택 후 fit에 따른 moveend가 viewport context 재조회를 트리거해도 `clearInfoPanel()`로 선택을 지우지 않도록 조정해 선택 상태 자동 해제 회귀를 완화 / 2026-03-11: SQLite `render_grid_cell`/`render_grid_parcel` 후보 축소 인덱스를 추가해 bbox 요청 시 cell -> pnu -> `parcel_render_item` 경로로 첫 로딩 후보를 줄이고, grid 인덱스 미생성/오류 시 기존 경로로 폴백하도록 조정 |
| RISK-004 | P1 | 공개 다운로드 응답 메모리 사용량 리스크 | done | team | 2026-03-05 | 공개 다운로드 기능 제거로 관련 응답 메모리 리스크가 소거된다. | 관련 코드(`app/services/public_download_service.py`, `/api/public-download`, `/admin/public-download/*`) 제거 완료 |
| RISK-005 | P1 | 프런트 전체 데이터 선적재로 인한 확장성 한계 | doing | team | 2026-03-12 | 데이터 증가 시 초기 로딩 시간/브라우저 메모리 사용을 제어하는 점진 로딩 전략이 수립된다. | 관련: `frontend/src/map/lands-list-client.ts`, `frontend/src/map.ts` / 2026-03-06: `map.ts`/`admin.ts` 책임 분리 리팩터링 착수 / 2026-03-08: 백엔드 repository/service 분해 + 장대 테스트 파일 분할로 파일 길이 경고 16→7 축소(잔여: map 모듈 6건 + xenon 환경 경고 1건) / 2026-03-08: 서비스 복잡도 C 대상 6건 helper 분해 리팩터링 수행(잔여: 테스트 복잡도 경고) / 2026-03-08: 3차 스프린트로 테스트 복잡도(F/E/D/C) 분해 리팩터링 완료(잔여: 프런트 TS 파일 길이 경고 2건) / 2026-03-08: `map-view.ts`, `photo-mode.ts` 모듈 분해로 TS 파일 길이 경고 0건 달성 / 2026-03-08: `/siyu` 목록 필터를 `/api/lands/list` 서버 쿼리 기반으로 1차 전환하고 실패 시 로컬 폴백을 유지 / 2026-03-08: `/file2map` 업로드 파싱을 `/api/file2map/upload/parse` 서버 우선 + 로컬 파서 폴백으로 전환 / 2026-03-10: `/siyu` 경로를 MapLibre 엔진으로 분리하고 `/file2map`·`/photo2map` OpenLayers 유지(1차 전환) / 2026-03-11: `/siyu` 초기 진입을 현재 화면 `bbox` 첫 페이지 + 하이라이트 상한 300건으로 전환하고, moveend/`목록 더 불러오기` 기반 점진 로딩을 추가 / 2026-03-11: `/api/lands/list`에 `totalCount`를 추가해 사이드바 분모를 현재 로드 수가 아닌 `theme + filter + geom 존재` 전체 건수로 고정 / 2026-03-11: viewport 하이라이트 상한을 초기 1회로 제한하고, 이후 bbox 이동 시 일반 벡터는 현재 bbox 기준으로 교체하되 선택 필지 1건은 예외 유지하도록 조정 |
| RISK-006 | P1 | 루트 pytest 수집 충돌(복제본 tests 중복) | done | team | 2026-03-02 | 루트 `pytest -q`가 `tests/`만 수집하고 `IdlePublicProperty/`와의 `conftest` 충돌 없이 통과한다. | 관련: `pyproject.toml` (`testpaths`, `norecursedirs`) |
| RISK-007 | P1 | 관리자 세션 쿠키 앱 간 교차 인식 | done | team | 2026-03-02 | 세션 쿠키명/네임스페이스 분리와 인증 검증 강화로 동일 도메인 다중 앱 간 세션 재사용이 차단된다. | 관련: `app/main.py`, `app/dependencies.py`, `app/services/auth_service.py` |
| RISK-008 | P1 | 확장 웹 로그(Referrer/UTM/디바이스) 보존·파기 정책 미정 | doing | team | 2026-03-14 | 수집 필드별 보존 기간/파기 절차/반출 통제 정책이 문서화되고 운영 점검 항목에 반영된다. 채널 분류 규칙과 개인정보 최소화(원문 referrer 미저장) 기준이 명시된다. | 관련: `app/services/web_stats_service.py`, `app/repositories/web_visit_repository.py`, `docs/maintenance.md` |
| RISK-009 | P0 | Deploy 워크플로 마지막 단계 TODO 미구현 | done | team | 2026-03-07 | `.github/workflows/deploy.yml`이 수동 배포 트리거/품질 게이트/SSH+Compose 배포/헬스체크 실패 자동 롤백을 포함해 실행 가능한 상태가 된다. | 관련: `.github/workflows/deploy.yml`, `README.MD`, `docs/maintenance.md` |

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
- 2026-03-05 | reviewer: team | (레거시 이력) 주제도별 진입 경로를 `국·공유지=/gukgongyu`, `시유재산=/siyu`로 추가하고 메뉴 전환/뒤로가기/popstate 동기화를 반영. 현재 기준 경로는 `파일→지도=/file2map`, `시유지=/siyu` | 다음 액션: `.html` 별칭 경로(`/gukgongyu.html`, `/siyu.html`) 필요 여부 결정
- 2026-03-05 | reviewer: team | 루트 경로(`/`)를 `307 Temporary Redirect`로 `/siyu`에 위임해 기본 진입 주제도를 시유재산으로 고정 | 다음 액션: 운영 배포 후 북마크/링크 유입의 경로 전환 영향(로그) 모니터링
- 2026-03-05 | reviewer: team | 글로벌 헤더 `주제도` 하위 메뉴 표기명을 `시유지/공유지(시+도)/국·공유지` 순서로 조정하고 기존 `시유재산/공유재산(시·도)` 표기를 대체 | 다음 액션: 운영 용어집(사용자 안내 문구/매뉴얼) 동기화 점검
- 2026-03-05 | reviewer: team | `public_download` 기능(`/api/public-download`, `/admin/public-download/*`)과 설정(`PUBLIC_DOWNLOAD_*`)을 코드/문서/테스트에서 제거 | 다음 액션: 운영 환경의 잔존 `data/public_download/` 파일 수동 정리 여부 결정
- 2026-03-06 | reviewer: team | 프런트 오케스트레이션 분해(`map.ts` -> `map/land-workflow.ts`, `map/topbar-menu.ts`, `map/layout-controls.ts`, `map/feedback.ts`) 및 `admin.ts` 모듈 분리를 반영 | 다음 액션: `land-workflow.ts`/`admin/stats.ts` 추가 분해와 점진 로딩 전략 설계 계속
- 2026-03-06 | reviewer: team | `poi_repository` 축소 1단계로 테스트 호출부를 `land/event/web_visit/job` 도메인 repository 직접 사용으로 전환하고, `poi_repository`에 deprecation shim 경고를 추가 | 다음 액션: Step 2에서 `poi_repository.py` 완전 제거 및 참조 0건 CI 규칙 유지
- 2026-03-06 | reviewer: team | `poi_repository` Step 2로 `app/repositories/poi_repository.py`를 완전 제거하고 마이그레이션 테스트를 파일 부재 + 참조 금지 가드로 강화 | 다음 액션: CI에 `poi_repository` 문자열 재유입 감시(정적 grep) 상시화 여부 검토
- 2026-03-06 | reviewer: team | 하이라이트 초기 지연 대응으로 FlatGeobuf 파싱을 Web Worker로 이동하고, IndexedDB 캐시 및 `/api/cadastral/fgb` ETag를 도입 | 다음 액션: 초기 표시 시간/Long Task 관측값 수집 후 서버 서브셋 API 필요성 재평가
- 2026-03-06 | reviewer: team | 유틸리티 사이드바 필터에 `재산용도`, `지목` 입력을 추가해 두 테마 공통 복합 검색을 확장 | 다음 액션: 재산용도 표기(원본 컬럼 라벨) 표준화 및 자동완성 UX 도입 여부 검토
- 2026-03-06 | reviewer: team | 유틸리티 사이드바에서 `재산용도`를 콤보(`행정재산/일반재산`)로 전환하고 `재산용도/지목`를 `지역명·주소` 바로 아래 1줄 배치로 조정 | 다음 액션: 재산용도 값 표준화 미준수 데이터(오탈자/공백) 정제 정책 수립
- 2026-03-06 | reviewer: team | 글로벌 헤더에서 `주제도` 우측 탑레벨 메뉴 `파일→지도`를 추가하고, `주제도` 하위는 `시유지`만 유지하도록 정리 | 다음 액션: 엑셀 업로드 기반 `파일→지도` 생성 기능의 실제 엔드포인트/권한 UX를 확정
- 2026-03-06 | reviewer: team | `/file2map`을 `/siyu`와 기능 동등하게 맞추기 위해 `재산관리관` 필터 분기를 제거하고 `poi_city -> poi` 1회 복제 스크립트를 추가 | 다음 액션: `/file2map` 독립 개선 요구사항 확정 후 테마별 기능 플래그 재분리 여부 결정
- 2026-03-06 | reviewer: team | `/file2map` 유틸리티 사이드바를 로컬 업로드 중심으로 전환하고 `재산관리관/재산용도` UI를 제거, 업로드 데이터 IndexedDB 복원 및 클라이언트 Excel 다운로드를 반영 | 다음 액션: 업로드 파일 크기 상한/브라우저 저장소 한계에 대한 운영 가이드 보강
- 2026-03-06 | reviewer: team | `/file2map` 최초 진입 시 목록 비표시로 전환하고, 서버 `national_public` 경로(`poi`, `/admin/upload`)를 제거해 `poi_city` 단일 데이터 소스로 정리 | 다음 액션: 운영 DB에서 `scripts/remove_legacy_national_table.py` 실행 여부와 백업 정책 확정
- 2026-03-06 | reviewer: team | `/photo2map` 페이지를 추가해 브라우저 폴더 선택 기반 JPEG EXIF GPS 마커 렌더 및 마커 클릭 로컬 사진 열기 기능을 반영 | 다음 액션: HEIC/PNG EXIF 확장 지원 필요성 및 공용 단말 운영 가이드 보강
- 2026-03-06 | reviewer: team | `/photo2map` 유틸리티 사이드바에 사진 목록/이전·다음 네비게이션을 추가하고, 새 탭 오픈 대신 지도 우상단 사진 패널 연동으로 전환 | 다음 액션: 선택 상태 복원(새로고침/세션) 및 썸네일 성능 최적화 여부 검토
- 2026-03-06 | reviewer: team | `/photo2map` 선택 사진 패널을 우하단 미리보기로 재배치하고, 패널 클릭 시 지도 위 대형 모달(ESC/배경/닫기 버튼 닫기) 확대 뷰를 추가 | 다음 액션: 대용량 이미지(고해상도)에서 메모리 사용량/모달 반응성 관측
- 2026-03-06 | reviewer: team | `/photo2map`을 공통 지도 셸(`index.html` + `map.ts`) 기반 `photo` 모드로 통합하고, 데스크톱 유틸리티 사이드바를 지도 좌측(기본 위치)으로 유지하도록 조정 | 다음 액션: 모바일 사진 모드 사이드바 정책(현행 유지 vs 확장) 확정
- 2026-03-06 | reviewer: team | `/file2map` 로컬 업로드 토지 하이라이트를 `/photo2map`에서 재사용해 표시하고, 토지 클릭 시 우상단 상세 정보 패널을 표시하도록 확장 | 다음 액션: 사진 마커와 토지 하이라이트가 겹치는 구간의 클릭 우선순위 UX 검증
- 2026-03-06 | reviewer: team | `/photo2map`에서 우상단 상세 정보 패널의 최대 높이를 동적 제한해 우하단 사진 패널과 동시 노출 시 상호 가림이 발생하지 않도록 조정 | 다음 액션: 해상도별(데스크톱/태블릿/모바일) 패널 겹침 회귀를 시나리오 테스트로 상시 점검
- 2026-03-06 | reviewer: team | `/photo2map` 사진 마커(Blob 포함)를 IndexedDB에 영속화하고 `/file2map`에서도 저장된 사진 마커를 렌더해 마커 클릭 시 선택 사진 패널/대형 모달을 공통 제공 | 다음 액션: 저장 용량(대량/고해상도) 한계와 자동 정리 정책(만료/개수 제한) 검토
- 2026-03-06 | reviewer: team | `/photo2map`·`/file2map` 대형 사진 보기 패널에 휠 확대/축소 및 확대 상태 드래그 이동을 추가해 세부 확인 UX를 개선 | 다음 액션: 터치 환경(핀치/드래그) 확대 조작 확장 여부 검토
- 2026-03-06 | reviewer: team | 이미지 뷰어 드래그 팬 자연화를 위해 캡션과 이미지 뷰포트를 분리하고 팬 감도/경계 계산을 개선 | 다음 액션: 사용자별 팬 감도 선호에 대응하는 설정 노출(고정/빠름) 여부 검토
- 2026-03-06 | reviewer: team | 이미지 뷰어 팬 감도(2.4)·줌 스텝(0.2)·경계 여유를 상향하고 이미지 합성 품질 저하를 줄이기 위해 `will-change: transform`을 제거 | 다음 액션: 고해상도 원본(4K+)에서 메모리/프레임 저하 없이 화질 체감이 개선되는지 실측
- 2026-03-06 | reviewer: team | 팬 이동 거리 제한 체감 해소를 위해 드래그 중 clamp를 완화하고 릴리즈 시 경계 정렬(120ms), `Shift` 고속 팬을 추가 | 다음 액션: 터치 환경(모바일)에서 동일 정책 적용 시 오조작(스크롤 충돌) 여부 검증
- 2026-03-06 | reviewer: team | 한 번에 이동 거리 제한 해소를 위해 이미지 뷰어 드래그 중 가장자리 자동 팬(auto-pan) 루프를 추가 | 다음 액션: 초당 프레임 저하 환경에서 auto-pan 최대 속도(22px/frame) 동적 감쇠 필요성 검토
- 2026-03-06 | reviewer: team | 확대 후 축소 시 이미지 치우침 재발을 막기 위해 `scale<=1` 정규화(translate 0)와 hard/soft clamp 분리 적용 | 다음 액션: 극단 비율 파노라마 이미지에서 축별 clamp 상한 재튜닝 필요성 검토
- 2026-03-06 | reviewer: team | `/photo2map` 유틸리티 사이드바 UI를 `/file2map` 스타일 규격(업로드 버튼/목록 선택 강조/하단 네비게이션)과 공통화해 화면 간 일관성을 강화 | 다음 액션: 테마별 사이드바 공통 컴포넌트 추출 여부 및 CSS 중복 제거 범위 검토
- 2026-03-06 | reviewer: team | `/file2map`에서 선택 사진 패널 open 상태(`photo-panel-open`)를 기준으로 상세 정보 패널 최대 높이 제한을 적용해 패널 상호 가림을 방지 | 다음 액션: `/file2map` 패널 닫기/재열기 반복 시 클래스 토글 누락 여부와 모바일 레이아웃 회귀 점검
- 2026-03-06 | reviewer: team | 세로 긴 사진 케이스 재발 방지를 위해 `/photo2map`·`/file2map` 모두 사진 패널 실측값(ResizeObserver + 런타임 CSS 변수) 기반 상세 패널 높이 계산으로 전환 | 다음 액션: 구형 브라우저(ResizeObserver 미지원) fallback 동작 및 성능 영향(리사이즈 이벤트 빈도) 점검
- 2026-03-06 | reviewer: team | 사용성 회귀 대응으로 이미지 뷰어(모달 확대/휠 줌/드래그 팬)를 제거하고 미리보기 패널 클릭 시 새창 열기 동작으로 복구 | 다음 액션: 팝업 차단 브라우저 비율과 사용자 안내 문구 이해도(토스트) 모니터링
- 2026-03-06 | reviewer: team | `/siyu`에서 상세 정보 패널과 선택 사진 패널 동시 노출 시 가림 현상을 막기 위해 `photo-panel-open` 기반 공통 높이 제한과 오버레이 초기화를 적용 | 다음 액션: 테마 전환(popstate/메뉴 전환) 반복 시 패널 상태/런타임 CSS 변수 정합성 회귀 점검
- 2026-03-06 | reviewer: team | 공통 `index.html` 기반 구조로 정리하기 위해 미사용 레거시 `templates/photo2map.html`과 `frontend/src/photo-map.ts` 및 Vite `photoMap` 입력을 제거 | 다음 액션: 빌드 산출물에서 불필요 `photoMap` 번들 재생성 여부를 주기 점검
- 2026-03-07 | reviewer: team | 웹 방문 이벤트 수집을 Referrer/UTM/디바이스·브라우저 컨텍스트까지 확장하고 `/admin/stats/web` breakdown(유입/채널/디바이스/브라우저/페이지) 집계를 추가 | 다음 액션: 로그 보존·파기 자동화 정책(RISK-008) 설계 및 운영 반출 통제 점검
- 2026-03-07 | reviewer: team | `web_visit_event`를 ALTER TABLE 기반 idempotent 보강 패턴으로 정리하고, referrer 원문 미저장 + 채널 분류 규칙 + 운영 점검 항목(길이 제한/증가 추이)을 문서화 | 다음 액션: RISK-008 완료를 위해 자동 파기 주기와 실행 스크립트 확정
- 2026-03-07 | reviewer: team | 사진 미리보기 패널 클릭 동작을 새창 열기에서 Viewer.js 이미지 뷰어로 교체하고 `/photo2map`·`/file2map`·`/siyu` 공통 경로로 통합 | 다음 액션: 모바일 터치 제스처/메모리 사용량 회귀 모니터링
- 2026-03-07 | reviewer: team | Deploy 워크플로를 `workflow_dispatch` 수동 실행 + 품질 게이트 + SSH/Compose 배포 + `/health` 실패 자동 롤백으로 구현하고 관련 운영 문서를 동기화 | 다음 액션: 운영 저장소에 `DEPLOY_*` GitHub Secrets 등록 및 첫 수동 배포 리허설 수행
- 2026-03-08 | reviewer: team | 유지보수성 리스크 대응으로 `event/land/web_visit repository` 및 `web_stats_service`를 내부 모듈로 분해하고 장대 테스트 파일(`test_map_ui_contract`, `test_stats_api`, `test_upload_service`)을 분할 | 다음 액션: 남은 프런트 장대 파일(`map.ts`, `map-view.ts`, `photo-mode.ts` 등 6건) 분해 완료 및 xenon 설치 환경에서 경고 0 재검증
- 2026-03-08 | reviewer: team | 서비스 복잡도 C 6건(`upload/land/raw_query_export/admin_settings/web_stats_utils/cadastral_fgb`)을 helper 분해로 정리해 xenon 서비스 스캔 기준 충족 | 다음 액션: 테스트 복잡도 경고(F/E/D/C) 분리 리팩터링 스프린트 착수
- 2026-03-08 | reviewer: team | 3차 스프린트로 테스트 복잡도 경고(F/E/D/C) 대상(`test_map_ui_contract`, `test_map_ui_contract_photo2map`, `test_stats_api`, `test_repositories`, `test_stats_service`, `test_web_visit_repository_split`)을 시나리오 분해해 Xenon 블록 경고를 제거 | 다음 액션: 남은 프런트 TypeScript 파일 길이 경고(`map-view.ts`, `photo-mode.ts`) 분해 계획 수립
- 2026-03-08 | reviewer: team | `map-view.ts`, `photo-mode.ts`를 보조 모듈(`map-view-*`, `photo-mode-*`)로 분해하고 UI 계약 테스트를 모듈 경계 기준으로 보강해 TS 파일 길이 경고 2건을 해소 | 다음 액션: RISK-005 본질 과제(대용량 데이터 점진 로딩/메모리 상한) 설계 지속
- 2026-03-08 | reviewer: team | 1단계 전환으로 `/api/cadastral/highlights` 서버 PNU 필터링 응답을 추가하고 클라이언트 하이라이트 로더를 서버 우선 + 워커 폴백으로 확장 | 다음 액션: 서버 경로 성공률/지연/스캔량 관측 후 Worker 완전 제거 여부 판단
- 2026-03-08 | reviewer: team | 2단계 전환으로 `/api/cadastral/highlights`에 `bbox+bboxCrs` 조건을 추가하고 클라이언트가 현재 지도 extent를 전달하도록 확장(서버 실패 시 워커 폴백 유지) | 다음 액션: bbox 재요청 빈도/응답량 감소율 관측 후 moveend 재로드 정책 최적화
- 2026-03-08 | reviewer: team | `/api/cadastral/highlights` 서버 로더를 `flatgeobuf.Reader(..., bbox=...)` 우선 경로로 변경하고 Reader 실패 시 `load(..., bbox=...)` 폴백을 추가해 전체 로드 회피를 적용 | 다음 액션: p50/p95 초기 하이라이트 가시화 시간과 `meta.scanned` 감소율 관측
- 2026-03-08 | reviewer: team | 하이라이트 캐시 키를 `v2`(bbox 2자리 정규화 + CRS)로 승격하고 서버 메모리 캐시 LRU/TTL 제어 및 IndexedDB v2(만료/최대건수 자동 정리) 정책을 반영 | 다음 액션: 캐시 hit율/메모리 사용량/응답 지연 개선폭 관측 후 v1 읽기 호환 제거 시점 결정
- 2026-03-08 | reviewer: team | `/siyu` 목록 필터를 `/api/lands/list` 서버 처리(`searchTerm/minArea/maxArea/propertyManager/propertyUsage/landType`)로 전환하고 서버 실패 시 클라이언트 로컬 폴백을 유지 | 다음 액션: 대량 데이터에서 필터 응답시간/폴백 발생률 관측 후 `/file2map` 단계 전환 범위 확정
- 2026-03-08 | reviewer: team | `/file2map` 업로드 파싱을 공개 API(`/api/file2map/upload/parse`) 서버 우선 경로로 추가하고 실패 시 기존 로컬 파서 폴백을 유지 | 다음 액션: 서버 parse 성공률/지연/폴백 발생률 관측 후 로컬 파서 제거 가능성 판단
- 2026-03-09 | reviewer: team | 관리자 연속지적도 업로드 경로(`POST /admin/upload/cadastral-fgb`)를 추가해 `.fgb` 검증 후 `CADASTRAL_FGB_PATH`를 즉시 반영하고 이전 운영 FGB 파일 정리 정책을 반영 | 다음 액션: 운영에서 업로드 실패율/파일 검증 시간/즉시 반영 안정성 관측
- 2026-03-09 | reviewer: team | `/siyu` 검색/재조회 렌더에 데이터셋 키(`theme+pnuSetHash+bbox+ETag`)별 `Map<pnu, geometry>` 인덱스 캐시(LRU 5)와 0건 early return을 적용해 반복 검색 프리징 병목을 완화 | 다음 액션: 동일 조건 반복 검색/0건 검색 시 Long Task 및 응답시간 개선폭 관측
- 2026-03-09 | reviewer: team | 추가 완화로 피처 레이어 반영을 ID 기반 diff 갱신으로 전환하고, 0건 검색 시 상세 패널만 정리해 선택 해제 중복 전체 재렌더를 제거 | 다음 액션: 0건 검색 직후 UI 입력(줌/팬/커서) 반응성과 Long Task 길이 비교 계측
- 2026-03-10 | reviewer: team | `/siyu`에 MapLibre 기반 렌더 어댑터를 도입하고 `/file2map`·`/photo2map`는 OpenLayers를 유지하는 경로 분리 1차 전환을 적용 | 다음 액션: 2차 전환(`/file2map`, `/photo2map`)의 사진 오버레이 기능 동등성 기준과 회귀 테스트 범위 확정
- 2026-03-11 | reviewer: team | SQLite `parcel_render_item` 렌더 인덱스를 추가하고 `/api/cadastral/highlights` 계약을 `items[{pnu, geometry, lod, bbox, center}]` 최소 구조로 전환, `POST /admin/upload/cadastral-fgb` 성공 시 인덱스를 즉시 재생성하도록 연결 | 다음 액션: 대용량 FGB 기준 startup 재생성 시간과 worker 폴백 발생률을 관측해 후속 RTree/공간 DB 전환 필요성 판단
- 2026-03-11 | reviewer: team | SQLite `render_grid_cell`/`render_grid_parcel` 후보 축소 인덱스를 도입해 bbox 하이라이트 요청을 `cell -> pnu -> parcel_render_item` 경로로 줄이고, 인덱스 미생성/조회 오류 시 기존 `parcel_render_item` 경로로 자동 폴백하도록 조정 | 다음 액션: grid cell 크기(고정 1km/0.01deg) 기준 p50/p95 응답시간과 candidate PNU 감소율을 관측해 다중 레벨/RTree 전환 필요성 판단
- 2026-03-11 | reviewer: team | `/api/lands/list`에 `totalCount`를 추가하고 `/siyu` 사이드바 내비게이션 분모를 현재 로드 수 대신 `theme + filter + geom 존재` 전체 건수로 고정 | 다음 액션: viewport 모드에서 bbox 제외 totalCount가 사용자 기대와 맞는지 운영 피드백 관측
