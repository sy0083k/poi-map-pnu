# 문서 포털 (Documentation Hub)

프로젝트: 관심 필지 지도 (POI Map PNU)  
작성일: 2026-02-22  
최종 수정일: 2026-03-09

## 빠른 시작 경로
1. 왜 만드는가: [`goals.md`](goals.md)
2. 어떻게 동작하는가: [`architecture.md`](architecture.md)
3. 어떤 기준으로 구현하는가: [`engineering-guidelines.md`](engineering-guidelines.md)
4. 어떻게 운영하는가: [`maintenance.md`](maintenance.md)
5. 어떤 보안 위협을 관리하는가: [`stride-lite.md`](stride-lite.md)
6. 어떤 리스크를 우선 개선하는가: [`TODO.MD`](TODO.MD)
7. 어떻게 소개/시연하는가: [`video-intro-storyboard.md`](video-intro-storyboard.md)

## 현행 기준 요약
- 지도 데이터 소스: FlatGeobuf 파일(`data/LSMD_CONT_LDREG_44210_202512.fgb`)
- 좌표계 기준: `CADASTRAL_FGB_CRS` (`EPSG:3857` 기본)
- 공개 지도 API: `/api/cadastral/fgb` (`/api/v1/cadastral/fgb` alias)
- 하이라이트 성능: 기본 경로는 `/api/cadastral/highlights`의 `PNU+bbox` 서버 필터링 응답을 사용하고, 실패 시 Web Worker 파싱으로 폴백하며 결과는 IndexedDB 캐시(`theme+pnuSetHash+bbox+ETag`)로 재사용
- 하이라이트 캐시 정책: 캐시 키 버전 `v2`(bbox 2자리 정규화 + CRS)를 기본 사용하고, 구버전 `v1`는 읽기 호환으로 유지
- 지도 표시 정책: 업로드 하이라이트 대상 필지만 렌더링(비하이라이트 배경 필지 미표시)
- 상세 정보 UI: 선택 필지 정보를 우상단 패널의 2열(속성/값) 동적 필드(`sourceFields`)로 동일 라인 정렬해 표시하며, `X` 버튼으로 닫기 지원
- 상세 패널 제목 정책: `/siyu`는 `재산 상세 정보`, `/file2map`·`/photo2map`은 `상세 정보`
- 상세 패널 초기 상태: 웹앱 초기화 시 숨김, 필지 선택 시 자동 표시
- 선택 강조 UI: 현재 선택된 필지는 노란색 경계선으로 표시
- 선택 렌더 우선순위: 선택된 필지는 상위 레이어로 렌더링되어 인접 필지 경계선에 가려지지 않음
- 상단 헤더: `시작`(같은 창 `/readme` 전환) / `배경지도` / `주제도` 메뉴 제공
- `주제도` 하위 메뉴: `시유지`
- 헤더 탑레벨 메뉴: `파일→지도` (주제도 메뉴 오른쪽, `/file2map` 이동)
- 헤더 탑레벨 메뉴: `사진→지도` (`/photo2map` 이동, 로컬 사진 EXIF GPS 마커)
- 주제도 URL 경로: `파일→지도=/file2map`, `시유지=/siyu` (직접 진입/새로고침/뒤로가기 동기화)
- 루트 경로(`/`) 접속 정책: `307 Temporary Redirect`로 `/siyu`에 진입
- `/siyu` 필터: `재산용도` 콤보(`전체/행정재산/일반재산`) + `지목` + `재산관리관` + 면적 조건 지원
- `/file2map` 필터: 사이드바 최상단 로컬 엑셀 업로드 UI + `지역명·주소/지목/면적` 조건 지원(`재산관리관`, `재산용도` UI 비노출)
- `/file2map` 업로드 파이프라인: 서버 parse API(`/api/file2map/upload/parse`) 우선, 실패 시 로컬 파서 폴백, 적용 결과는 IndexedDB에 저장
- `/photo2map` 기능: 공통 지도 셸(`index.html`)에서 `photo` 모드로 동작, 폴더 선택(`webkitdirectory`) 기반 JPEG EXIF GPS 파싱 후 지도 마커 렌더, 데스크톱 좌측(기본) 사이드바 목록/네비게이션 + 지도 우하단 미리보기 패널 연동(클릭 시 이미지 뷰어 열기: 확대/축소/팬/이전·다음/회전/좌우·상하반전), `/file2map` 로컬 업로드 토지 하이라이트 재사용 및 토지 클릭 상세정보 표시
- 사이드바 UI 일관성: `/photo2map` 업로드/목록/네비게이션 UI를 `/file2map` 스타일 규격과 공통화
- 사진 마커 영속화: `/photo2map`에서 생성한 마커(사진 Blob 포함)는 IndexedDB에 저장되며 `/file2map` 이동 후 복귀 시 자동 복원
- `/file2map` 사진 연동: 저장된 사진 마커를 지도에 함께 렌더하고, 마커 클릭 시 우하단 선택 사진 패널(클릭 시 이미지 뷰어) 표시
- `/siyu` 사진 연동: 저장된 사진 마커가 있을 경우 동일한 선택 사진 패널(클릭 시 이미지 뷰어)과 상세 패널 비가림 정책을 적용
- `/file2map` 패널 배치 정책: 선택 사진 패널이 열려 있으면 사진 패널 실측 높이/오프셋 기반으로 상세 정보 패널 최대 높이를 동적 제한해 상호 가림 방지
- `/photo2map` 패널 배치 정책: 우하단 사진 패널과 우상단 상세 정보 패널 동시 노출 시 사진 패널 실측값 기반 안전 영역으로 상세 패널 최대 높이를 제한해 상호 가림을 방지
- 지도 상태 영역: `#map-status`는 필터/목록 사이가 아니라 지도 캔버스 상단 1줄 오버레이로 표시되며, 데스크톱에서는 줌 UI 비가림을 피하도록 폭이 제한되고 `X` 버튼으로 임시 닫기 지원
- 다중 검출 정책: `/siyu`의 `재산관리관` 검색 결과 고유값이 2개 이상이면 검색을 중단하고 상태 영역(지도 캔버스 상단 1줄 오버레이)에 검출값 안내를 표시
- 관리자 업로드: `시유지(/admin/upload/city)` 단일 운영
- 연속지적도 운영 파일 업로드: `POST /admin/upload/cadastral-fgb` (업로드 파일명 유지 저장 + `CADASTRAL_FGB_PATH` 즉시 갱신 + 이전 운영 파일 정리)
- 레거시 정리: `python scripts/remove_legacy_national_table.py`로 구 테이블(`poi`) 제거 가능(`--dry-run` 지원)
- 지도 목록 조회: `/api/lands`, `/api/lands/list`는 `theme` 쿼리 `city_owned`만 지원(미지정 시 기본 `city_owned`)
- `/siyu` 목록 필터(주소/면적/재산관리관/재산용도/지목)는 `/api/lands/list` 서버 쿼리(`searchTerm/minArea/maxArea/propertyManager/propertyUsage/landType`)로 처리하고, 실패 시 클라이언트 로컬 폴백을 사용
- 유틸리티 사이드바 결과 목록은 `PNU` 오름차순 정렬을 유지하며, `조건에 맞는 토지 찾기` 후 화면 내 토지가 있으면 `PNU` 최소 항목이 목록 상단에 보이도록 자동 스크롤한다
- 검색 결과 다운로드: `/siyu`는 `/api/lands/export` 서버 다운로드, `/file2map` 로컬 업로드 모드는 브라우저 Excel 생성 다운로드
- 헤더 메뉴 정렬: 데스크톱에서 `시작/배경지도/주제도` 시작 x좌표를 사이드바 끝점 고정 오프셋으로 배치
- 헤더 메뉴 구분자: `시작 | 배경지도 | 주제도` 사이 짧은 세로 바 표시
- 사이드바 UX: 데스크톱에서 지도-사이드바 경계 `핸들` 클릭으로 슬라이드 수납(접기/펼치기) 지원, 모바일 기존 바텀시트 플로우 유지
- 베이스맵: VWorld WMTS (`VWORLD_WMTS_KEY`), 기본 배경은 영상 지도(Satellite)이며 헤더 메뉴 `배경지도`에서 `일반지도/백지도/영상지도/하이브리드` 실제 전환 지원 (`White -> white` 매핑, White 최대 줌 18)
- 관리자 통계: `totalLands` + 이벤트 통계(경계선 실패 재조회 기능 제거)
- 웹 관측 확장: `/api/web-events`가 referrer/UTM/디바이스·브라우저 컨텍스트를 수집하고 `/admin/stats/web` breakdown으로 조회
- 개인정보 최소화: referrer는 원문 URL을 저장하지 않고 `domain/path`만 저장(query/fragment 제거)
- 채널 집계: `utm_medium` 우선, 미존재 시 `direct/organic/referral` 규칙으로 `channelBreakdown` 제공(기존 summary/dailyTrend는 유지)
- 배포 자동화: GitHub Actions `Deploy`는 수동(`workflow_dispatch`) 실행 전용이며, 품질 게이트 통과 후 SSH+Compose 배포 및 `/health` 실패 자동 롤백을 수행

## 기능 변경 시 동시 갱신 대상
- 구조/흐름 변경: `docs/architecture.md`
- 운영/절차 변경: `docs/maintenance.md`
- 보안 통제 변경: `docs/stride-lite.md`
- 사용자/운영 요약: `README.MD`
- 리스크/개선 항목 영향: `docs/TODO.MD`

## Archive / 참고 문서
- `refactoring-strategy.md`: 아카이브 문서(현행 운영 기준 아님)
- `reports/*`: 단계별 점검 보고서 보관용 문서(현행 운영 기준 아님)
