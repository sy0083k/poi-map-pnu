# 문서 포털 (Documentation Hub)

프로젝트: 관심 필지 지도 (POI Map Geo)  
작성일: 2026-02-22  
최종 수정일: 2026-03-06

## 빠른 시작 경로
1. 왜 만드는가: [`goals.md`](goals.md)
2. 어떻게 동작하는가: [`architecture.md`](architecture.md)
3. 어떤 기준으로 구현하는가: [`engineering-guidelines.md`](engineering-guidelines.md)
4. 어떻게 운영하는가: [`maintenance.md`](maintenance.md)
5. 어떤 보안 위협을 관리하는가: [`stride-lite.md`](stride-lite.md)
6. 어떤 리스크를 우선 개선하는가: [`TODO.MD`](TODO.MD)

## 현행 기준 요약
- 지도 데이터 소스: FlatGeobuf 파일(`data/LSMD_CONT_LDREG_44210_202512.fgb`)
- 좌표계 기준: `CADASTRAL_FGB_CRS` (`EPSG:3857` 기본)
- 공개 지도 API: `/api/cadastral/fgb` (`/api/v1/cadastral/fgb` alias)
- 하이라이트 성능: FlatGeobuf 파싱은 Web Worker에서 수행하고, 결과는 IndexedDB 캐시(`theme+pnuSetHash+ETag`)로 재사용
- 지도 표시 정책: 업로드 하이라이트 대상 필지만 렌더링(비하이라이트 배경 필지 미표시)
- 상세 정보 UI: 선택 필지 정보를 우상단 패널의 2열(속성/값) 동적 필드(`sourceFields`)로 동일 라인 정렬해 표시하며, `X` 버튼으로 닫기 지원
- 상세 패널 초기 상태: 웹앱 초기화 시 숨김, 필지 선택 시 자동 표시
- 선택 강조 UI: 현재 선택된 필지는 노란색 경계선으로 표시
- 선택 렌더 우선순위: 선택된 필지는 상위 레이어로 렌더링되어 인접 필지 경계선에 가려지지 않음
- 상단 헤더: `시작`(같은 창 `/readme` 전환) / `배경지도` / `주제도` 메뉴 제공
- `주제도` 하위 메뉴: `시유지`
- 헤더 탑레벨 메뉴: `파일→지도` (주제도 메뉴 오른쪽, `/file2map` 이동)
- 주제도 URL 경로: `파일→지도=/file2map`, `시유지=/siyu` (직접 진입/새로고침/뒤로가기 동기화)
- 루트 경로(`/`) 접속 정책: `307 Temporary Redirect`로 `/siyu`에 진입
- 공통 필터: 유틸리티 사이드바에서 `재산용도` 콤보(`전체/행정재산/일반재산`)와 `지목` 입력 조건을 지원
- 공통 필터 확장: 유틸리티 사이드바에서 `재산관리관` 입력을 `/siyu`와 `/file2map` 모두 동일하게 지원
- 지도 상태 영역: `#map-status`는 필터/목록 사이가 아니라 지도 캔버스 상단 1줄 오버레이로 표시되며, 데스크톱에서는 줌 UI 비가림을 피하도록 폭이 제한되고 `X` 버튼으로 임시 닫기 지원
- 다중 검출 정책: `재산관리관` 검색 결과의 고유값이 2개 이상이면 검색을 중단하고 상태 영역(지도 캔버스 상단 1줄 오버레이)에 검출값 안내를 표시
- 관리자 업로드: `국·공유재산(/admin/upload)` / `시유지(/admin/upload/city)` 분리 운영
- 데이터 초기 동등화: `python scripts/clone_city_data_to_national.py`로 `poi_city -> poi` 1회 복제 지원(`--dry-run` 가능)
- 지도 목록 조회: `/api/lands`, `/api/lands/list`는 `theme` 쿼리(`national_public` 기본, `city_owned`) 지원
- 검색 결과 다운로드: 지도 버튼은 `/api/lands/export`로 현재 검색 결과 `landIds`의 원본 업로드 컬럼 전체 속성을 Excel로 내려받음
- 헤더 메뉴 정렬: 데스크톱에서 `시작/배경지도/주제도` 시작 x좌표를 사이드바 끝점 고정 오프셋으로 배치
- 헤더 메뉴 구분자: `시작 | 배경지도 | 주제도` 사이 짧은 세로 바 표시
- 사이드바 UX: 데스크톱에서 지도-사이드바 경계 `핸들` 클릭으로 슬라이드 수납(접기/펼치기) 지원, 모바일 기존 바텀시트 플로우 유지
- 베이스맵: VWorld WMTS (`VWORLD_WMTS_KEY`), 기본 배경은 영상 지도(Satellite)이며 헤더 메뉴 `배경지도`에서 `일반지도/백지도/영상지도/하이브리드` 실제 전환 지원 (`White -> white` 매핑, White 최대 줌 18)
- 관리자 통계: `totalLands` + 이벤트 통계(경계선 실패 재조회 기능 제거)

## 기능 변경 시 동시 갱신 대상
- 구조/흐름 변경: `docs/architecture.md`
- 운영/절차 변경: `docs/maintenance.md`
- 보안 통제 변경: `docs/stride-lite.md`
- 사용자/운영 요약: `README.MD`
- 리스크/개선 항목 영향: `docs/TODO.MD`

## Archive / 참고 문서
- `refactoring-strategy.md`: 아카이브 문서(현행 운영 기준 아님)
- `reports/*`: 단계별 점검 보고서 보관용 문서(현행 운영 기준 아님)
