# 유지보수 가이드

프로젝트: 관심 필지 지도 (POI Map Geo)  
작성일: 2026-02-11  
최종 수정일: 2026-03-05

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
- 상단 헤더 메뉴 사이 짧은 구분 바 표시 여부 점검
- 데스크톱에서 상단 헤더 메뉴의 시작 x좌표가 사이드바 끝점 고정 오프셋(`--topbar-menu-anchor-x`)으로 유지되는지 점검
- `시작` 클릭 시 새 창이 아닌 같은 창 `/readme`로 전환되고 글로벌 헤더가 유지되는지 점검
- 데스크톱 사이드바 슬라이드 수납(핸들 클릭 토글) 및 상태 복원(localStorage) 동작 점검
- 배경지도 기본 레이어가 `Satellite`로 초기화되고, `배경지도` 메뉴(`일반지도/영상지도/하이브리드`) 전환이 정상 동작하는지 점검
- 지도 상세 패널이 초기 진입 시 숨김이며, 필지 선택 시 자동으로 표시되는지 점검
- 선택 필지(노란 경계)가 인접 필지보다 위 레이어로 표시되는지 점검
- 데스크톱 핸들의 접기/펼치기 방향 힌트(`>`/`<`)가 상태에 맞게 바뀌는지 점검
- DB 파일 권한 및 백업 점검
- 로그/통계 테이블 증가 추이 점검

## 하이라이트 초기 지연 조사 (2026-03-05)
### 관측 기준
- 운영 데이터 샘플: FlatGeobuf 파일 `data/LSMD_CONT_LDREG_44210_202512.fgb` 약 152MB
- 업로드 목록 샘플: `poi` 기준 100건(고유 PNU 100건)

### 지연 원인 후보(우선순위)
1. `loadUploadedHighlights`가 전체 범위(`fullRect`)를 순회하며 PNU 매칭을 찾는 구조라, 네트워크/파싱 구간에서 초기 비용이 크다.
2. 초기 로드 흐름에서 `applyFilters(false)`가 데이터 빈 상태/실데이터 상태로 2회 호출되어 렌더 경로가 중복된다.
3. 지도 `moveend`마다 `reloadCadastralLayers`가 호출되어 벡터 레이어 재구성이 빈번해진다.

### 최소화 대안
1. 단기(저위험): 초기 로드 시 `applyFilters`/`reloadCadastralLayers` 호출 횟수를 1회로 축소하고, `moveend`에서는 레이어 재생성 대신 상태 갱신만 수행한다.
2. 단기(저위험): `loadUploadedHighlights` 완료 전에는 기본 상태 메시지를 유지하고, 완료 후에만 렌더/상태 갱신을 일괄 적용한다.
3. 중기(구조개선): 서버에서 업로드 PNU 기준 필지 지오메트리 서브셋 API를 제공해 클라이언트 full scan 의존을 제거한다.
4. 중기(구조개선): FlatGeobuf/PNU 인덱스 사전 구축(빌드 시점)으로 최초 매칭 경로를 단축한다.

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
  - `/api/public-download`

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

### 설정 변경 미반영
- `.env` 갱신 후 앱 재시작 필요

## 백업/복구
- `data/database.db`
- `data/public_download/`
- `data/*.fgb` (운영 중 사용하는 지적도 파일)
