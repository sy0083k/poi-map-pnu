# 유지보수 가이드

프로젝트: 관심 필지 지도 (POI Map Geo)  
작성일: 2026-02-11  
최종 수정일: 2026-03-06

## 환경 변수
### 필수
- `VWORLD_WMTS_KEY`
- `ADMIN_ID`
- `ADMIN_PW_HASH`
- `SECRET_KEY`

### 주요 선택
- `CADASTRAL_FGB_PATH`
- `CADASTRAL_FGB_PNU_FIELD`
- `CADASTRAL_FGB_CRS`
- `CADASTRAL_MIN_RENDER_ZOOM`
- `ALLOWED_IPS`, `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_IPS`
- `SESSION_COOKIE_NAME`, `SESSION_NAMESPACE`, `SESSION_HTTPS_ONLY`

## 주기적 점검
- FlatGeobuf 파일 존재/권한/크기 점검
- VWorld WMTS 키 유효성 점검
- 상단 헤더 메뉴(`시작/배경지도/주제도`) 렌더 및 드롭다운 동작 점검
- `주제도` 하위 메뉴(`시유지`) 노출 점검
- 헤더 탑레벨 `파일→지도` 클릭 시 `/file2map`으로 이동하고, `주제도 > 시유지` 클릭 시 테마 전환과 활성 메뉴(`is-active`)가 즉시 갱신되는지 점검
- 헤더 탑레벨 `사진→지도` 클릭 시 `/photo2map`으로 이동하는지 점검
- 주제도 전환 시 URL이 `파일→지도=/file2map`, `시유지=/siyu`로 동기화되고, 직접 URL 진입/새로고침/브라우저 뒤로가기에 테마가 일치하는지 점검
- 루트(`/`) 접속 시 `307`으로 `/siyu`로 이동하는지 점검
- `/siyu`에서 `재산용도` 콤보(`전체/행정재산/일반재산`)와 `지목` 입력이 표시되고 검색 조건으로 반영되는지 점검
- `/siyu` 필터 배치가 `지역명·주소 검색` 바로 아래 `재산용도/지목` 1줄, 그 다음 `면적 직접 입력` 순서인지 점검
- `/siyu`에서 `재산관리관` 입력이 표시되고 검색 조건으로 반영되는지 점검
- `/siyu`에서 `재산관리관` 조건 검색 시 다중 고유값 검출(2개 이상)일 때 검색이 중단되고 `#map-status`(지도 캔버스 상단 1줄 오버레이)에 검출 목록이 표시되는지 점검
- `/file2map`에서 유틸리티 사이드바 최상단 파일 업로드 UI(파일 선택/적용/초기화/요약)가 표시되는지 점검
- `/file2map`에서 유틸리티 사이드바 최상단 파일 업로드 UI(파일 선택/적용/초기화)가 표시되는지 점검
- `/file2map`에서 `재산관리관`, `재산용도` 필터 UI가 비노출인지 점검
- 신규 브라우저(IndexedDB 비어 있음)에서 `/file2map` 최초 진입 시 목록이 비어 있는지 점검
- `/file2map`에서 업로드 성공 시 지도/목록이 업로드 데이터로 대체되고, 새로고침 시 IndexedDB 복원 데이터가 재적용되는지 점검
- `/file2map`에서 업로드 복원/검증/적용/초기화 메시지가 업로드 패널이 아니라 `#map-status`에 표시되는지 점검
- `/file2map`에서 `검색 결과 다운로드`가 서버 API(`/api/lands/export`)가 아니라 클라이언트 Excel 생성 방식으로 동작하는지 점검
- `/photo2map`에서 폴더 선택(`webkitdirectory`) 후 JPEG GPS EXIF가 있는 사진만 마커가 생성되는지 점검
- `/photo2map`에서 목록/이전/다음 네비게이션으로 마커 선택이 이동하는지 점검
- `/photo2map` 마커 또는 목록 선택 시 지도 우하단 미리보기 패널 이미지가 갱신되는지 점검
- `/photo2map` 미리보기 패널 클릭 시 대형 모달이 열리고, `ESC`/배경 클릭/닫기 버튼으로 닫히는지 점검
- 데스크톱에서 `#map-status`가 지도 좌상단 줌(확대/축소) UI를 가리지 않는지 점검
- `#map-status`의 `X` 버튼으로 상태창을 닫은 뒤, 다음 상태 갱신 시 자동으로 다시 표시되는지 점검
- 관리자 업로드에서 `시유지(/admin/upload/city)` 업로드 및 성공 메시지 점검
- 구 테이블 정리가 필요할 때 `python scripts/remove_legacy_national_table.py --dry-run`으로 존재 여부를 확인하고 삭제 실행 여부를 점검
- `/api/lands`, `/api/lands/list` 호출 시 `theme=city_owned` 정상 응답, `theme=national_public` 400 응답 여부 점검
- 상단 헤더 메뉴 사이 짧은 구분 바 표시 여부 점검
- 데스크톱에서 상단 헤더 메뉴의 시작 x좌표가 사이드바 끝점 고정 오프셋(`--topbar-menu-anchor-x`)으로 유지되는지 점검
- `시작` 클릭 시 새 창이 아닌 같은 창 `/readme`로 전환되고 글로벌 헤더가 유지되는지 점검
- 데스크톱 사이드바 슬라이드 수납(핸들 클릭 토글) 및 상태 복원(localStorage) 동작 점검
- 배경지도 기본 레이어가 `Satellite`로 초기화되고, `배경지도` 메뉴(`일반지도/백지도/영상지도/하이브리드`) 전환이 정상 동작하는지 점검
- `백지도(White)` 선택 시 WMTS 요청 layer 파라미터가 `white`(소문자)로 호출되는지 점검
- `백지도(White)` 선택 시 줌 레벨이 18을 초과하지 않도록 보정되는지 점검
- 지도 상세 패널이 초기 진입 시 숨김이며, 필지 선택 시 자동으로 표시되는지 점검
- 선택 필지(노란 경계)가 인접 필지보다 위 레이어로 표시되는지 점검
- 데스크톱 핸들의 접기/펼치기 방향 힌트(`>`/`<`)가 상태에 맞게 바뀌는지 점검
- DB 파일 권한 및 백업 점검
- 로그/통계 테이블 증가 추이 점검

## 하이라이트 초기 지연 대응 (2026-03-06)
### 적용 사항
1. FlatGeobuf 파싱을 Web Worker로 이동해 메인 스레드 프리징을 완화했다.
2. 하이라이트 매칭을 청크 단위로 점진 반영해 첫 가시 표시를 앞당겼다.
3. IndexedDB 캐시(`theme+pnuSetHash+ETag`)를 도입해 재방문 시 재스캔을 줄였다.
4. `/api/cadastral/fgb` 응답에 `ETag`를 추가해 캐시 무효화 기준을 명확화했다.

### 운영 점검 포인트
1. 최초 진입 시 `#map-status`에 매칭 진행률(매칭/스캔 건수)이 갱신되는지 확인
2. 재진입 시 동일 테마/데이터 조건에서 하이라이트 표시 시간이 단축되는지 확인
3. FGB 교체 후 `ETag`가 변경되고, 캐시가 새 데이터로 갱신되는지 확인

## 배포 전 체크리스트
1. `python -m compileall -q app tests`
2. `mypy app tests create_hash.py`
3. `ruff check app tests`
4. `scripts/check_quality_warnings.sh`
5. `cd frontend && npm run typecheck && npm run build`
6. `pytest -m unit -q`
7. `pytest -m integration -q`
8. `pytest -m e2e -q`
9. `pytest -q`

## API 운영
- `/api/v1/*`는 `/api/*`와 동등 alias 계약 유지
- 핵심 확인 경로:
  - `/api/config`
  - `/api/cadastral/fgb`
  - `/api/lands/list`
  - `/api/lands/export`

## 장애 대응
### 지도 데이터 미표시
- `CADASTRAL_FGB_PATH` 실제 경로/권한 확인(하이라이트 준비 시 사용)
- `CADASTRAL_FGB_PNU_FIELD` 필드명 설정 확인
- `CADASTRAL_FGB_CRS` 값(EPSG:3857/EPSG:4326)과 실제 파일 CRS 정합 확인
- 브라우저 콘솔 `업로드 하이라이트 준비 실패` 메시지 확인(FlatGeobuf 모듈/네트워크)
- `/api/lands/list` 실패 시 하이라이트가 비어 보일 수 있음

### 우상단 상세 패널 데이터 누락
- `/api/lands/list` 응답의 `sourceFields` 배열 포함 여부 확인
- 업로드 파일의 필수 컬럼 외 추가 컬럼이 `source_fields_json`으로 저장됐는지 DB 확인
- 지도에서 필지 선택 후에도 패널이 비어 있으면 브라우저 콘솔 타입 오류(`source_fields`) 확인
- 패널은 2열(속성/값) 그리드로 렌더링되므로, Pair가 동일 라인에 안 보이면 CSS `align-items` / `line-height` / `padding` 적용 여부 확인
- 패널이 보이지 않으면 헤더 `X`로 닫힌 상태인지 확인하고, 토지 재선택 시 재표시되는지 점검

### 선택 경계선 색상 이상
- 선택된 필지 경계선은 노란색, 비선택 하이라이트는 빨간색인지 확인
- 색상 반영이 안 되면 프론트 `map-view`의 선택 상태(`selectedFeatureId`) 갱신 및 레이어 재렌더(`vectorLayer.changed`) 호출 여부 점검

### 업로드 실패
- 파일 타입/용량/행 제한(`MAX_UPLOAD_SIZE_MB`, `MAX_UPLOAD_ROWS`) 확인
- 업로드 시트명(`UPLOAD_SHEET_NAME`) 및 필수 컬럼 확인

### `/file2map` 로컬 업로드 실패
- 브라우저 콘솔에 엑셀 파싱 모듈(`xlsx@esm.sh`) 로딩 오류가 있는지 확인
- 필수 컬럼(`고유번호`, `소재지`, `지목`, `실면적`, `재산관리관`) 누락 여부 확인
- PNU 19자리/실면적 숫자 검증 오류 메시지 확인
- IndexedDB 저장/복원 실패 시 브라우저 저장소 권한(사생활 보호 모드 포함) 점검

### `/photo2map` EXIF 마커 미표시
- 선택한 폴더에 JPEG(`.jpg/.jpeg`) 파일이 포함돼 있는지 확인
- 사진에 GPS EXIF(`GPSLatitude/GPSLongitude`)가 실제로 존재하는지 확인
- 브라우저 파일 권한/보안정책으로 폴더 선택이 차단되지 않았는지 확인

### 설정 변경 미반영
- `.env` 갱신 후 앱 재시작 필요

## 백업/복구
- `data/database.db`
- `data/*.fgb` (운영 중 사용하는 지적도 파일)
