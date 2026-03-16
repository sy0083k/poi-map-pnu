# 유지보수 가이드

프로젝트: 관심 필지 지도 (POI Map PNU)  
작성일: 2026-02-11  
최종 수정일: 2026-03-16

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

## 설정 Hot-Reload 운영 절차

### 즉시 반영되는 설정 (재시작 불필요)
관리자 UI(`/admin/`)에서 저장하면 `.env` 파일에 기록된 후 `refresh_app_config()`가 자동 호출되어 실행 중인 프로세스에 즉시 반영된다.

- `APP_NAME`, `VWORLD_WMTS_KEY`, `CADASTRAL_FGB_PATH`, `CADASTRAL_FGB_PNU_FIELD`, `CADASTRAL_FGB_CRS`, `CADASTRAL_MIN_RENDER_ZOOM`
- `ALLOWED_IPS`, `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_IPS`
- `MAX_UPLOAD_SIZE_MB`, `MAX_UPLOAD_ROWS`, `UPLOAD_SHEET_NAME`
- `LOGIN_MAX_ATTEMPTS`, `LOGIN_COOLDOWN_SECONDS` — 변경 후 새 요청부터 반영됨. 이미 차단된 IP 는 기존 차단 만료 시각까지 유지됨.
- `ADMIN_ID`, `ADMIN_PW_HASH` — 비밀번호 변경 성공 직후 다음 로그인 시도부터 반영됨.

### 재시작이 필요한 설정
| 설정 | 사유 |
|---|---|
| `SECRET_KEY` | `SessionMiddleware`에 기동 시 바인딩됨. 변경 후 재시작하면 기존 세션 쿠키가 모두 무효화됨. |
| `SESSION_COOKIE_NAME` | 동일 — `SessionMiddleware` 인스턴스에 기동 시 바인딩됨. |
| `SESSION_HTTPS_ONLY` | `app.state.config`는 hot-reload되지만 `SessionMiddleware`의 Secure 쿠키 플래그는 재시작 전까지 변경되지 않음. HTTPS 전환/해제 시 반드시 재시작할 것. |

### `.env` 수동 편집 주의사항
- 관리자 UI 외 `.env`를 직접 편집한 경우, 서버를 재시작해야 반영된다(hot-reload는 관리자 저장 시에만 실행됨).
- `.env` 편집 중 문법 오류(잘못된 bcrypt 해시, 잘못된 IP CIDR 등)가 있을 경우 `reload_settings()` 호출 시 `SettingsError`가 발생해 저장이 거부된다. 이 경우 서버는 기존 설정을 유지한다.

## 주기적 점검
- FlatGeobuf 파일 존재/권한/크기 점검
- VWorld WMTS 키 유효성 점검
- 상단 헤더 메뉴(`시작/배경지도/주제도`) 렌더 및 드롭다운 동작 점검
- `주제도` 하위 메뉴(`시유지`) 노출 점검
- 헤더 탑레벨 `파일→지도` 클릭 시 `/file2map`으로 이동하고, `주제도 > 시유지` 클릭 시 테마 전환과 활성 메뉴(`is-active`)가 즉시 갱신되는지 점검
- 헤더 탑레벨 `사진→지도` 클릭 시 `/photo2map`으로 이동하는지 점검
- 주제도 전환 시 URL이 `파일→지도=/file2map`, `시유지=/siyu`로 동기화되고, 직접 URL 진입/새로고침/브라우저 뒤로가기에 테마가 일치하는지 점검
- `/siyu`는 MapLibre 엔진, `/file2map`·`/photo2map`은 OpenLayers 엔진으로 초기화되는지 점검
- `/api/config` 응답에 `cadastralPmtilesUrl`이 포함되고, `/siyu` 네트워크 탭에서 `/api/cadastral/pmtiles`(또는 설정된 PMTiles URL) 요청이 발생하는지 점검
- `/siyu` 접속 시 지도 우하단 MapLibre 기본 attribution/link UI가 비노출인지 점검하고, VWorld 등 배경지도 출처 표시는 운영 정책대로 유지되는지 확인
- `/siyu` 접속 시 브라우저 콘솔에 MapLibre worker 관련 CSP 차단 에러가 없고, 응답 `Content-Security-Policy`에 `worker-src 'self' blob:`가 포함되는지 점검
- `/file2map`에서 `주제도 > 시유지` 선택 시 경로 전환(`/siyu`) 후 전체 페이지 재초기화로 엔진이 전환되는지 점검
- 루트(`/`) 접속 시 `307`으로 `/siyu`로 이동하는지 점검
- `/siyu`에서 `재산용도` 콤보(`전체/행정재산/일반재산`)와 `지목` 입력이 표시되고 검색 조건으로 반영되는지 점검
- `/siyu` 필터 배치가 `지역명·주소 검색` 바로 아래 `재산용도/지목` 1줄, 그 다음 `면적 직접 입력` 순서인지 점검
- `/siyu`에서 `재산관리관` 입력이 표시되고 검색 조건으로 반영되는지 점검
- `/siyu`에서 `재산관리관` 조건 검색 시 다중 고유값 검출(2개 이상)일 때 검색이 중단되고 `#map-status`(지도 캔버스 상단 1줄 오버레이)에 검출 목록이 표시되는지 점검
- `/file2map`에서 유틸리티 사이드바 최상단 파일 업로드 UI(파일 선택/적용/초기화/요약)가 표시되는지 점검
- `/file2map`에서 `재산관리관`, `재산용도` 필터 UI가 비노출인지 점검
- 신규 브라우저(IndexedDB 비어 있음)에서 `/file2map` 최초 진입 시 목록이 비어 있는지 점검
- `/file2map`에서 업로드 성공 시 지도/목록이 업로드 데이터로 대체되고, 새로고침 시 IndexedDB 복원 데이터가 재적용되는지 점검
- `/file2map` 업로드 시 `/api/file2map/upload/parse` 서버 검증 경로가 우선 사용되는지 점검
- `/api/file2map/upload/parse` 실패 시 로컬 파서 폴백으로 업로드가 계속 가능한지 점검
- `/file2map`에서 업로드 복원/검증/적용/초기화 메시지가 업로드 패널이 아니라 `#map-status`에 표시되는지 점검
- `/file2map`에서 `검색 결과 다운로드`가 서버 API(`/api/lands/export`)가 아니라 클라이언트 Excel 생성 방식으로 동작하는지 점검
- `/photo2map`에서 폴더 선택(`webkitdirectory`) 후 JPEG GPS EXIF가 있는 사진만 마커가 생성되는지 점검
- `/photo2map` 진입 시 공통 지도 셸(`index.html`)에서 `photo` 모드로 초기화되는지(`data-map-mode="photo"`) 점검
- `/file2map`에서 업로드 후 `/photo2map` 진입 시 업로드 토지 하이라이트가 함께 표시되는지 점검
- `/photo2map`에서 토지 클릭 시 우상단 상세 정보 패널(`land-info-panel`)이 열리고 `source_fields`가 렌더되는지 점검
- `/photo2map`에서 목록/이전/다음 네비게이션으로 마커 선택이 이동하는지 점검
- `/photo2map` 마커 또는 목록 선택 시 지도 우하단 미리보기 패널 이미지가 갱신되는지 점검
- `/photo2map` 사이드바의 업로드 버튼/목록 선택 강조/하단 네비게이션 스타일이 `/file2map`과 동일 규격으로 보이는지 점검
- `/photo2map` 사진 목록 항목 사이 구분 라인(border-bottom)이 `/file2map` 목록과 동일 규격(`#eee`, 1px)인지 점검
- `/photo2map`에서 우상단 상세 정보 패널과 우하단 사진 패널이 동시에 열려도 서로 가리지 않는지(상세 패널 높이 제한 적용) 점검
- `/file2map`에서 우상단 상세 정보 패널과 우하단 사진 패널이 동시에 열려도 서로 가리지 않는지(사진 패널 open 상태에서 상세 패널 높이 제한 적용) 점검
- `/siyu`에서 우상단 상세 정보 패널과 우하단 사진 패널이 동시에 열려도 서로 가리지 않는지(사진 패널 open 상태에서 상세 패널 높이 제한 적용) 점검
- 세로로 긴 사진 선택/창 크기 변경/모바일 회전 시 사진 패널 실측값 재계산(`ResizeObserver`)으로 상세 패널 높이가 즉시 보정되는지 점검
- 데스크톱 `/photo2map`에서 유틸리티 사이드바가 지도 좌측(기본 위치)에 배치되는지 점검
- `/photo2map` 미리보기 패널 클릭 시 이미지 뷰어가 열리고 확대/축소/팬/이전·다음/회전/좌우·상하반전이 동작하는지 점검
- `/photo2map`에서 마커 생성 후 `/file2map` 이동-복귀 시 저장된 사진 마커가 자동 복원되는지 점검
- `/file2map`에서 저장된 사진 마커가 지도에 표시되고, 마커 클릭 시 우하단 선택 사진 패널(클릭 시 이미지 뷰어 열기)이 동작하는지 점검
- 데스크톱에서 `#map-status`가 지도 좌상단 줌(확대/축소) UI를 가리지 않는지 점검
- `#map-status`의 `X` 버튼으로 상태창을 닫은 뒤, 다음 상태 갱신 시 자동으로 다시 표시되는지 점검
- 관리자 업로드에서 `시유지(/admin/upload/city)` 업로드 및 성공 메시지 점검
- 관리자 업로드에서 `연속지적도 FGB(/admin/upload/cadastral-fgb)` 업로드 성공 시 `/api/cadastral/fgb` 응답 ETag가 변경되고 즉시 반영되는지 점검
- 관리자 로그아웃 버튼이 `POST /logout` + CSRF 토큰으로 동작하는지 점검
- 구 테이블 정리가 필요할 때 `python scripts/remove_legacy_national_table.py --dry-run`으로 존재 여부를 확인하고 삭제 실행 여부를 점검
- `/api/lands`, `/api/lands/list` 호출 시 `theme=city_owned` 정상 응답, `theme=national_public` 400 응답 여부 점검
- `/api/lands/list` 서버 필터 query(`searchTerm`, `minArea`, `maxArea`, `propertyManager`, `propertyUsage`, `landType`)가 `/siyu` UI 결과와 일치하는지 점검
- `/api/lands/list` 서버 필터 실패 상황에서 `/siyu`가 마지막 목록 스냅샷 기준 로컬 폴백으로 동작하는지 점검
- `조건에 맞는 토지 찾기` 결과 목록이 항상 `PNU` 오름차순인지 점검
- `조건에 맞는 토지 찾기` 결과에 현재 화면 내 토지가 있으면, 화면 내 토지 중 `PNU` 최소 항목이 목록 상단에 보이도록 자동 스크롤되는지 점검
- `/api/web-events`에서 `pagePath`가 허용 경로(`/, /siyu, /file2map, /photo2map, /readme`)만 수집되는지 점검
- `/api/cadastral/highlights` 호출 시 요청 `PNU+bbox` 기준 `items[]`, `matched/bboxApplied/bboxFiltered/source/sourceFgbEtag` 메타가 정상 응답되는지 점검
- `/siyu` 첫 진입 시 `cadastral-map-*` 레이어가 PMTiles source + PNU filter로 렌더링되고, 목록 필터 변경 시 전체 GeoJSON 재조립 없이 필터만 갱신되는지 점검
- `/siyu`에서 지도 위 필지 마우스 클릭 시 `pnu` 기반 역매핑으로 목록 선택/상세 패널/선택 강조가 유지되는지 점검
- 관리자 업로드/로컬 업로드 기반 하이라이트 초기 로딩 시 `bbox` 없이 전체 업로드 PNU 매칭이 적용되어, 초기 화면 밖 필지도 줌 아웃/이동 시 누락 없이 표시되는지 점검
- `/api/cadastral/highlights` 실패 시 클라이언트 워커 폴백으로 하이라이트가 계속 표시되는지 점검
- `/admin/stats/web`에 `topReferrers`, `topUtmSources`, `topUtmCampaigns`, `deviceBreakdown`, `browserBreakdown`, `topPagePaths`, `channelBreakdown`가 정상 집계되는지 점검
- `referrerUrl` 원문이 DB에 저장되지 않고(`referrer_domain`/`referrer_path`만 저장), `referrer_path`에 query/fragment가 포함되지 않는지 점검
- 상단 헤더 메뉴 사이 짧은 구분 바 표시 여부 점검
- 데스크톱에서 상단 헤더 메뉴의 시작 x좌표가 사이드바 끝점 고정 오프셋(`--topbar-menu-anchor-x`)으로 유지되는지 점검
- `시작` 클릭 시 새 창이 아닌 같은 창 `/readme`로 전환되고 글로벌 헤더가 유지되는지 점검
- 데스크톱 사이드바 슬라이드 수납(핸들 클릭 토글) 및 상태 복원(localStorage) 동작 점검
- 배경지도 기본 레이어가 `Satellite`로 초기화되고, `배경지도` 메뉴(`일반지도/백지도/영상지도/하이브리드`) 전환이 정상 동작하는지 점검
- `백지도(White)` 선택 시 WMTS 요청 layer 파라미터가 `white`(소문자)로 호출되는지 점검
- `백지도(White)` 선택 시 줌 레벨이 18을 초과하지 않도록 보정되는지 점검
- 지도 상세 패널이 초기 진입 시 숨김이며, `/siyu`는 지도 클릭 시에만 자동으로 표시되는지 점검
- `/siyu`에서 사이드바 목록 클릭은 선택 강조/지도 이동만 수행하고 상세 패널을 열지 않는지 점검
- `/siyu`에서 하단 이전/다음 네비게이션으로 다른 필지를 선택하면 상세 패널이 닫히는지 점검
- `/siyu`에서 상세 패널 제목이 `재산 상세 정보`로 표시되고, `/file2map`에서는 `상세 정보`로 표시되는지 점검
- 선택 필지 강조 레이어가 인접 필지보다 위에 표시되는지 점검
- `/siyu`에서 선택 필지가 기존 관리관 색을 유지한 채 흰 halo + pulse outline으로 강조되고, `prefers-reduced-motion` 환경에서는 pulse 없이 정적 강조만 보이는지 점검
- 데스크톱 핸들의 접기/펼치기 방향 힌트(`>`/`<`)가 상태에 맞게 바뀌는지 점검
- DB 파일 권한 및 백업 점검
- 로그/통계 테이블 증가 추이 점검

## 웹 로그 보존/정리 정책
- 저장 최소화: `referrerUrl` 원문 미저장, `referrer_domain`/`referrer_path`만 저장(query/fragment 제거).
- 길이 제한: 서버 정규화 기준(`page_query<=512`, `referrer_domain<=128`, `referrer_path<=256`, `utm_*<=128`, `client_lang<=32`, `platform<=64`)을 유지한다.
- 저장량 관리: 인덱스는 운영 통계 질의에 필요한 최소 집합만 유지한다.
- 보존/파기: `RISK-008` 완료 전까지 운영자가 주기적으로 `web_visit_event` 적재량을 점검하고, 파기 자동화 도입 시 본 문서에 절차/주기/롤백 방법을 갱신한다.

## 하이라이트 초기 지연 대응 (2026-03-06)
### 적용 사항
1. 서버 하이라이트 기본 경로를 SQLite `parcel_render_item` 조회로 전환해 요청당 FlatGeobuf 재스캔을 제거했다.
2. 하이라이트 매칭을 청크 단위로 점진 반영해 첫 가시 표시를 앞당겼다.
3. IndexedDB 캐시(`theme+pnuSetHash+ETag`)를 도입해 재방문 시 재스캔을 줄였다.
4. `/api/cadastral/fgb` 응답에 `ETag`를 추가해 캐시 무효화 기준을 명확화했다.
5. `parcel_render_item`은 앱 시작 시 또는 `POST /admin/upload/cadastral-fgb` 성공 직후 현재 FGB 기준으로 재생성되며, 실패 시 기존 운영 인덱스를 유지한다.
6. 하이라이트 캐시는 키 버전 `v3`(bbox 2자리 정규화 + CRS)를 기본 사용하고, 서버 메모리 캐시는 `HIGHLIGHT_CACHE_TTL_SECONDS`/`HIGHLIGHT_CACHE_MAX_ENTRIES`로 TTL/최대 엔트리를 조정한다.
7. 브라우저 IndexedDB 하이라이트 캐시는 스키마 버전 3을 사용하며, 스키마 업그레이드 시 기존 `cadastral_highlights` 저장소를 재생성해 구 캐시를 무효화한다. 이후 만료(기본 7일)와 최대 건수(기본 1000건)를 초과한 레코드를 자동 정리한다.
8. `/siyu` 검색/재조회 렌더 단계는 데이터셋 키(`theme+pnuSetHash+bbox+ETag`)별 `Map<pnu, geometry>` 인덱스 캐시(LRU 최대 5개)를 사용해 반복 검색 시 전체 재구축을 피한다.
9. 검색 결과가 0건일 때는 하이라이트 조합을 조기 종료(early return)해 불필요한 인덱스 순회를 방지한다.
10. 피처 레이어 반영은 ID 기반 diff 갱신을 사용하고, `0건` 검색 시에는 패널만 정리해 선택 해제에 따른 중복 전체 재렌더를 피한다.

### 운영 점검 포인트
1. 최초 진입 시 `#map-status`에 매칭 진행률(매칭/스캔 건수)이 갱신되는지 확인
2. 재진입 시 동일 테마/데이터 조건에서 하이라이트 표시 시간이 단축되는지 확인
3. FGB 교체 후 `ETag`가 변경되고, 캐시가 새 데이터로 갱신되는지 확인
4. `HIGHLIGHT_CACHE_TTL_SECONDS`/`HIGHLIGHT_CACHE_MAX_ENTRIES` 조정 시 캐시 hit율/메모리 사용량 변화를 함께 관측
5. 브라우저 장기 사용 세션에서 IndexedDB 캐시 정리(만료/최대건수)가 정상 동작하는지 확인
6. `/siyu`에서 동일 조건 검색 반복 시 메인 스레드 프리징이 악화되지 않는지(특히 0건 결과) 확인

## 하이라이트 성능 한계 (RISK-003)

### 개요
`/api/cadastral/highlights` 응답 속도와 `parcel_render_item` 재빌드 타이밍이 서버 로그 및 응답 메타 필드로 계측된다.

### `query_ms` — DB 조회 시간
응답 `meta.query_ms` 필드에 SQLite 조회 소요 시간(ms, 소수점 3자리)이 포함된다.

```json
{ "meta": { "query_ms": 12.345, ... } }
```

- `bbox` 있음: `WHERE pnu IN (...) AND bbox_maxx >= ? AND bbox_minx <= ? AND bbox_maxy >= ? AND bbox_miny <= ?` — `idx_parcel_render_item_bbox_x/y` 인덱스 활용
- `bbox` 없음: `WHERE pnu IN (...)` 조회

### `build_ms` / `commit_ms` — 재빌드 타이밍
FGB 업로드 성공 또는 앱 시작 시 재빌드가 실행되며 서버 로그에 다음 형식으로 기록된다.

```
INFO parcel_render.rebuild row_count=12345 build_ms=4200.0 commit_ms=800.0
```

로그 수집 방법: 서버 로그에서 `parcel_render.rebuild` 문자열을 검색한다.

### `staleIndex: true` — ETag 불일치 감지
파일 교체 후 `parcel_render_item` 재빌드가 완료되기 전 사이에 요청이 도달하면 응답에 `meta.staleIndex: true`가 포함된다.

```json
{ "items": [], "meta": { "source": "stale_index", "staleIndex": true, ... } }
```

**운영 대응 절차:**
1. `staleIndex: true` 응답이 지속되면 서버 로그에서 `parcel_render.rebuild` 완료 기록 확인
2. 재빌드가 실행되지 않았다면 `/admin/upload/cadastral-fgb`를 통해 FGB를 재업로드하거나 앱을 재시작한다
3. 재빌드 완료 후 정상 응답(`meta.source == "parcel_render_item"`)으로 자동 복귀한다
4. 클라이언트는 `items == []` 응답을 워커 폴백 신호로 처리하므로 사용자 표시는 FlatGeobuf 워커 경로로 계속 동작한다

### 환경변수 튜닝
| 변수 | 기본값 | 설명 |
|---|---|---|
| `HIGHLIGHT_CACHE_TTL_SECONDS` | 300 | 서버 메모리 캐시 TTL(초) |
| `HIGHLIGHT_CACHE_MAX_ENTRIES` | 500 | 서버 메모리 캐시 최대 엔트리 수 |

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
10. `scripts/run_coverage.sh` (stale 데이터 재사용 방지를 위해 `coverage erase` 포함)

## 커버리지 운영
- 표준 실행: `scripts/run_coverage.sh`
- 선택 출력: `scripts/run_coverage.sh --xml --html`
- stale `.coverage` 정리(1회): `rm -f .coverage .coverage.*`
- 주의: `coverage report -m` 단독 실행은 이전 `.coverage`를 재사용할 수 있으므로 지양한다.

## GitHub Actions 배포 절차
1. GitHub Actions `Deploy` 워크플로를 `workflow_dispatch`로 수동 실행한다.
2. 워크플로는 배포 전 품질 게이트(컴파일/타입/린트/테스트 + 프론트 빌드)를 모두 통과해야 다음 단계로 진행한다.
3. 배포는 SSH 접속 후 원격 서버에서 `git fetch/reset` + `docker compose build --pull app` + `docker compose up -d app` 순으로 수행한다.
4. 배포 직후 `/health` 재시도 검증을 수행하고, 실패 시 이전 커밋으로 `git reset --hard` 후 Compose 재기동으로 자동 롤백한다.
5. 운영 GitHub Secrets는 아래를 유지한다.
   - `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`
   - `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`
   - `DEPLOY_PATH`

## API 운영
- `/api/v1/*`는 `/api/*`와 동등 alias 계약 유지
- 핵심 확인 경로:
  - `/api/config`
  - `/api/cadastral/fgb`
  - `/api/cadastral/debug-probe`
  - `/api/cadastral/highlights`
  - `/api/lands/list`
  - `/api/lands/export`

## 장애 대응
### 지도 데이터 미표시
- `CADASTRAL_FGB_PATH` 실제 경로/권한 확인(하이라이트 준비 시 사용)
- `CADASTRAL_FGB_PNU_FIELD` 필드명 설정 확인
- `CADASTRAL_FGB_CRS` 값(EPSG:3857/EPSG:4326)과 실제 파일 CRS 정합 확인
- `/siyu`에서 렌더 원인 확인이 필요하면 `?debugMap=1` 쿼리로 접속 후 콘솔 `window.__mapDebug.getLandsSourceData()`/`window.__mapDebug.listLandsLayers()`로 source/layer 상태를 점검
- 원본 FGB 자체 문제를 검색 흐름과 분리해 확인하려면 `/siyu?debugMap=1&debugFgb=1`로 접속 후 `window.__mapDebug.getDebugProbeSourceData()`/`window.__mapDebug.getDebugProbeMeta()`로 probe overlay 상태를 확인
- debug probe API 단독 점검 시 `/api/cadastral/debug-probe?bbox=126.44,36.77,126.47,36.79&bboxCrs=EPSG:4326&limit=1000` 응답의 `meta.returned/truncated/sourceFile/outputCrs`를 확인
- 디버깅 종료 후에는 일반 URL(`/siyu`)로 재접속해 전역 디버그 훅 노출 상태가 아닌지 확인
- 브라우저 콘솔 `업로드 하이라이트 준비 실패` 메시지 확인(SQLite 렌더 인덱스/API 또는 FlatGeobuf worker 폴백 경로)
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
- IndexedDB 저장소 권한/용량 제한으로 사진 마커 복원이 실패하지 않았는지 확인

### 설정 변경 미반영
- 일반 설정 변경은 `.env` 갱신 후 앱 재시작 필요
- `CADASTRAL_PMTILES_URL` 변경도 `.env` 갱신 후 앱 재시작 필요
- 예외: `/admin/upload/cadastral-fgb`는 성공 시 `CADASTRAL_FGB_PATH`를 런타임에 즉시 반영하고 `parcel_render_item` 재생성 및 하이라이트 캐시 무효화를 함께 수행함

## 백업/복구
- `data/database.db`
- `data/*.fgb` (운영 중 사용하는 지적도 파일)
