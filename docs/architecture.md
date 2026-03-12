# 아키텍처 및 흐름

프로젝트: 관심 필지 지도 (POI Map PNU)  
작성일: 2026-02-11  
최종 수정일: 2026-03-10

## 시스템 개요
관심 필지 지도는 FastAPI + SQLite + Vite 기반 애플리케이션이다.
지도 엔진은 단계적 전환 중이며 `/siyu`는 MapLibre, `/file2map`·`/photo2map`은 OpenLayers를 사용한다.
지도 경계 데이터는 외부 WFS가 아니라 FlatGeobuf 파일(`data/LSMD_CONT_LDREG_44210_202512.fgb`)을 사용한다.

## 레이어 구성
- 라우터: `app/routers/*`
- 서비스: `app/services/*`
- 리포지토리: `app/repositories/*`
- 프런트 오케스트레이션: `frontend/src/map.ts`
- 프런트 지도 모듈: `frontend/src/map/*`

## 공개 엔드포인트
- `GET /api/config`
- `GET /api/cadastral/pmtiles`
- `GET /api/cadastral/fgb`
- `GET /api/cadastral/debug-probe`
- `POST /api/cadastral/highlights`
- `GET /api/lands`
- `GET /api/lands/list`
- `POST /api/lands/export`
- `POST /api/file2map/upload/parse`
- `POST /api/events`
- `POST /api/web-events`
- `/api/v1/*`는 `/api/*`와 동등 alias

## 공개 페이지
- `GET /` (307으로 `/siyu` 리디렉션)
- `GET /file2map` (파일→지도 메인)
- `GET /photo2map` (사진→지도 메인, 로컬 EXIF GPS 마커)
- `GET /siyu` (시유재산 지도 메인)
- `GET /readme` (글로벌 헤더 유지 README 마크다운 렌더 뷰)
- `GET /README.MD` (원문 파일 응답, 호환 경로)

## 관리자/인증 엔드포인트
- `GET /admin/login`
- `POST /login` (`POST /admin/login` alias)
- `POST /logout`
- `GET /admin`
- `POST /admin/upload/city`
- `POST /admin/upload/cadastral-fgb`
- `POST /admin/settings`
- `POST /admin/password`
- `GET /admin/stats`
- `GET /admin/stats/web`
- `GET /admin/raw-queries/export`

## 웹 이벤트 수집(`POST /api/web-events`)
- 필수: `eventType`, `anonId`, `sessionId`, `pagePath`, `clientTs`, `clientTz`
- 선택: `pageQuery`, `referrerUrl`, `utmSource`, `utmMedium`, `utmCampaign`, `utmTerm`, `utmContent`, `clientLang`, `platform`, `screenWidth`, `screenHeight`, `viewportWidth`, `viewportHeight`
- 서버 파생: `user_agent`, `is_bot`, `browser_family`, `device_type`, `os_family`, `referrer_domain`, `referrer_path`, `traffic_channel`
- `pagePath` 허용: `/`, `/siyu`, `/file2map`, `/photo2map`, `/readme`
- 개인정보 최소화: `referrerUrl` 원문은 저장하지 않고, 서버에서 `domain/path`만 파생 저장하며 query/fragment는 버린다.
- 채널 분류 규칙:
  - `utm_medium` 존재 시 우선 분류(`paid`/`email`/`social`, 그 외 `campaign`)
  - `utm_medium` 부재 + referrer 없음: `direct`
  - `utm_medium` 부재 + 검색엔진 referrer: `organic`
  - 그 외: `referral`

## 지도 데이터 흐름
1. 클라이언트가 `/api/config`로 지도 설정을 조회한다.
   - `/siyu`용 MapLibre 초기화 설정에는 `cadastralPmtilesUrl`이 포함된다.
2. 테마별 목록 소스를 결정한다.
   - `/siyu(city_owned)`: `/api/lands/list?theme=city_owned`로 목록을 조회한다.
     - 1차 전환 기준: 주소/면적/재산관리관/재산용도/지목 필터는 서버 query(`searchTerm`, `minArea`, `maxArea`, `propertyManager`, `propertyUsage`, `landType`)로 처리한다.
     - 서버 필터 실패 시 프런트는 마지막 목록 스냅샷 기준 로컬 필터로 폴백한다.
   - `/file2map(national_public)`: 최초 진입 시 목록을 비워 두며, 사용자가 사이드바 상단에서 업로드한 엑셀 파일(또는 IndexedDB 복원본)이 있을 때만 목록을 표시한다.
     - 업로드 시 서버 parse API(`/api/file2map/upload/parse`)를 우선 호출해 파싱/검증/정규화를 수행한다.
     - 서버 parse 실패 시 클라이언트 로컬 파서로 자동 폴백한다.
   - 목록 항목에는 고정 필드 외에 업로드 원본 컬럼을 보존한 `sourceFields` 배열이 포함된다.
   - 유틸리티 사이드바 목록은 항상 `PNU` 오름차순으로 정렬한다.
   - `조건에 맞는 토지 찾기` 실행 후 현재 지도 화면에 결과 토지가 있으면, 화면 내 토지 중 `PNU` 최소 항목이 목록 상단에 보이도록 스크롤한다.
3. 클라이언트는 목록 PNU를 대상으로 하이라이트를 구성한다.
   - `/siyu(city_owned)` 기본 하이라이트(`cadastral-map-fill`, `cadastral-map-line`)는 PMTiles 벡터 타일 소스(`pnu`, `mngr`)를 사용하고, 현재 검색 결과 PNU 집합을 MapLibre 레이어 필터로 적용한다.
   - 선택 강조(`parcels-selected-*`) geometry는 서버 API(`/api/cadastral/highlights`)에서 필요한 PNU만 조회하며, 서버는 SQLite `parcel_render_item` 렌더 인덱스에서 `PNU IN (...)` 조회를 수행한다.
   - 관리자 업로드/로컬 업로드 기반 하이라이트는 초기 로딩에서 `bbox`를 전달하지 않고 전체 업로드 PNU 매칭 결과를 우선 확보한다(부분 응답 고정 방지).
   - `parcel_render_item`은 FGB 교체 시 재생성되는 렌더 전용 캐시 테이블이며, `geom_geojson_full/mid/low`와 bbox/center 메타를 보관한다.
   - 서버 경로 실패 시 클라이언트 Web Worker 파싱으로 자동 폴백한다.
   - 폴백 경로의 매칭 파싱은 Web Worker에서 수행해 메인 스레드 블로킹을 줄인다.
   - 결과는 IndexedDB 캐시(`theme + pnuSetHash + bbox + fgb ETag`)로 저장해 재방문 시 재스캔을 회피한다.
   - 하이라이트 캐시 키는 `bbox`를 소수점 2자리 + CRS로 정규화한 `v2`를 기본 사용하고, 구버전(`v1`) 키는 읽기 호환으로만 유지한다.
   - `/api/cadastral/fgb`는 `ETag` 헤더를 제공해 클라이언트 캐시 무효화 기준으로 사용한다.
   - `/siyu?debugFgb=1` 진단 모드에서는 현재 화면 bbox를 `GET /api/cadastral/debug-probe?bbox=...&bboxCrs=EPSG:4326&limit=1000`으로 조회해 검색 결과와 무관한 원본 FGB 오버레이를 별도 source/layer로 렌더링한다.
   - `/siyu` 검색/재조회 렌더 단계에서는 위 캐시 키(`theme+pnuSetHash+bbox+ETag`)를 데이터셋 식별자로 재사용해 `Map<pnu, geometry>` 인덱스를 데이터셋 단위로 재사용하고, 동일 데이터셋 반복 검색 시 전체 재구축을 피한다.
4. 지도 렌더링은 하이라이트 레이어만 사용하며, 비하이라이트 필지(배경 연속지적도)는 표시하지 않는다.
   - `/siyu` 기본 하이라이트는 GeoJSON 전체 재조립 대신 PMTiles source filter 갱신으로 반영한다.
   - 피처 반영은 `clear+전체 재추가` 대신 ID 기반 diff(추가/삭제/교체)로 처리해 대량 렌더 블로킹을 완화한다.
   - `0건` 검색 경로에서는 상세 패널만 정리하고, 선택 해제로 인한 불필요한 전체 재렌더를 피한다.
5. 지도 이동 시에는 하이라이트 캐시를 재사용한다.
6. 사이드바 `검색 결과 다운로드` 버튼 동작은 테마별로 분기한다.
   - `/siyu(city_owned)`: 현재 검색 결과 `id` 집합을 `/api/lands/export`로 전송해 서버에서 Excel을 생성한다.
   - `/file2map(national_public)` + 로컬 업로드 모드: 현재 검색 결과를 브라우저에서 직접 Excel(`.xlsx`)로 생성해 다운로드한다.
7. 지도 엔진별 투영 정책을 유지한다.
   - `/api/cadastral/highlights` 응답은 `items[{pnu, geometry, lod, bbox, center}]` 최소 구조를 반환하고 `meta.responseCrs`는 `CADASTRAL_FGB_CRS`와 동일하다.
   - `/siyu`(MapLibre)는 기본 하이라이트를 PMTiles로 렌더링하고, 선택 강조 geometry만 내부 `FeatureCollection`으로 재조립한다. `/file2map`, `/photo2map`(OpenLayers)은 기존처럼 서버 응답 geometry를 내부 `FeatureCollection`으로 재조립해 렌더링한다.
8. 토지 선택 시 상세정보는 지도 팝업이 아니라 우상단 패널에서 동적으로 렌더링하며, 패널은 2열(속성/값) 그리드로 속성/값 Pair를 동일 라인(y축)에 정렬한다.
   - `/siyu(city_owned)`에서는 상세 패널 제목을 `재산 상세 정보`로 표시한다.
   - 웹앱 초기화 시 상세 패널은 숨김 상태로 시작한다.
   - 패널 헤더의 `X` 버튼으로 닫을 수 있으며, `/siyu`에서는 지도 위 토지를 다시 클릭했을 때만 자동 재표시된다.
   - `/siyu`에서는 지도 위 토지를 직접 클릭한 경우에만 상세 패널을 연다.
   - `/siyu`에서 사이드바 목록 클릭은 선택 강조와 지도 이동만 수행하고 상세 패널은 열지 않는다.
   - `/siyu`에서 하단 이전/다음 네비게이션으로 선택이 바뀌면 열린 상세 패널은 닫힌다.
9. 배경지도 기본 레이어는 `Satellite`이며, 상단 헤더 `배경지도` 메뉴에서 `일반지도(Base)`, `백지도(White)`, `영상지도(Satellite)`, `하이브리드(Hybrid)` 전환을 지원한다.
   - VWorld WMTS 호출 시 `백지도(White)`는 URL layer 식별자 `white`(소문자)로 매핑한다.
   - `백지도(White)` 선택 시 최대 줌 레벨은 `18`로 제한한다.
   - `/siyu` MapLibre 초기화는 기본 attribution control을 비활성화해 MapLibre 링크/로고 UI를 노출하지 않는다.
10. 선택된 하이라이트 필지는 `/siyu`에서 기존 관리관 색을 유지한 채 흰 halo + 원색 inner line + pulse outline 조합으로 렌더링하고, 비선택 하이라이트는 기존 빨간/관리관별 기본 스타일을 유지한다.
   - 선택 필지는 별도 상위 레이어로 렌더링해 인접 필지 경계선에 가려지지 않도록 한다.
   - 접근성 설정 `prefers-reduced-motion: reduce`가 활성화되면 pulse 애니메이션은 비활성화하고 정적 halo + inner line만 유지한다.
11. 상단 헤더는 `시작`(같은 창 `/readme`), `배경지도`, `주제도` 메뉴를 제공한다.
    - 데스크톱에서 메뉴의 시작 x좌표는 사이드바 끝점을 기준으로 고정 오프셋(`--topbar-menu-anchor-x`)을 사용한다.
    - 메뉴 사이에는 짧은 세로 구분 바로 시각적 분리감을 제공한다.
    - `주제도` 메뉴는 `시유지` 하위 항목을 제공한다.
    - 헤더에서 `주제도` 오른쪽에 탑레벨 `파일→지도` 메뉴를 두고, `http://127.0.0.1:8000/file2map`(내부 경로 `/file2map`)로 이동한다.
    - 주제도 경로는 `파일→지도=/file2map`, `시유지=/siyu`로 매핑되며 URL 직접 진입/새로고침 시 해당 테마로 초기화된다.
    - 엔진 분리 정책: 주제도 경로 전환은 경로 기반 전체 페이지 전환으로 처리해 `/siyu`(MapLibre)와 `/file2map`(OpenLayers) 런타임을 분리한다.
    - 서버 데이터 저장은 `시유재산(poi_city)` 단일 테이블을 사용한다.
    - `/siyu` 유틸리티 사이드바는 주소/재산용도/지목/면적/재산관리관 필터를 지원한다.
    - `/file2map` 유틸리티 사이드바는 최상단 파일 업로드 UI + 주소/지목/면적 필터를 지원한다(`재산관리관`, `재산용도` UI 비노출).
    - `/siyu`에서 재산관리관 조건 검색의 고유값이 2개 이상이면 검색을 중단하고 상태 영역(`#map-status`)에 다중 검출 목록을 표시한다.
    - 상태 영역은 데스크톱에서 좌상단 줌 UI를 가리지 않도록 폭/좌측 오프셋을 제한하고, `X` 버튼으로 임시 닫기를 지원한다(다음 상태 갱신 시 자동 재표시).
12. 데스크톱에서는 지도-사이드바 경계의 핸들을 클릭해 사이드바를 슬라이드로 접기/펼치기 할 수 있으며, 상태는 로컬 스토리지로 복원한다.
    - 핸들은 청록색 배경과 방향 힌트(`>`/`<`)로 확장/축소 가능성을 직관적으로 노출한다.
    - 모바일(`<=768px`)은 기존 `mobile-home/search/results` 바텀시트 레이아웃을 우선한다.
13. `/siyu` 디버그 쿼리 정책:
    - `debugMap=1`: 기존 MapLibre source/layer/geometry 검증 상태를 `window.__mapDebug`로 노출한다.
    - `debugFgb=1`: 하이라이트와 별도의 원본 FGB probe overlay를 현재 화면 bbox 기준으로 1회 로드한다.
    - 권장 진단 URL은 `/siyu?debugMap=1&debugFgb=1`이다.

## 사진 지도 흐름 (`/photo2map`)
0. `/photo2map`은 별도 템플릿이 아니라 공통 지도 셸(`index.html`)을 사용하고, 프런트 `map.ts`가 `map_mode=photo` 분기로 사진 모드 컨트롤러를 초기화한다.
1. 클라이언트가 `/api/config`로 기본 지도 중심/줌/VWorld 키를 조회한다.
2. 사용자가 브라우저 폴더 선택(`webkitdirectory`)으로 로컬 사진 목록을 제공한다.
3. 클라이언트가 JPEG 파일의 EXIF(GPSLatitude/GPSLongitude)를 직접 파싱해 좌표를 추출한다.
4. GPS 정보가 있는 사진만 OpenLayers 마커로 렌더링한다.
5. 유틸리티 사이드바는 사진 목록 + 이전/다음 네비게이션으로 마커 간 이동을 지원한다.
   - 사이드바 UI 스킨(업로드 액션 버튼/목록 선택 강조/하단 네비게이션)은 `/file2map`과 공통 스타일 규격을 사용한다.
6. 마커/목록/네비게이션 선택은 단일 선택 상태를 공유하며 지도 우하단 미리보기 패널 이미지를 갱신한다.
   - 미리보기 패널 클릭 시 Viewer.js 이미지 뷰어를 열고 확대/축소/팬/이전·다음/회전/좌우·상하반전을 지원한다.
   - 데스크톱에서는 사진 모드 유틸리티 사이드바를 지도 좌측(기본 위치)에 배치한다.
   - 사진 마커 데이터(파일 Blob 포함)는 브라우저 IndexedDB에 저장되어 `/file2map` 이동/복귀 후에도 복원된다.
7. `/file2map` 업로드 데이터가 브라우저에 저장돼 있으면 동일 PNU 하이라이트를 `/photo2map`에도 표시하고, 토지 클릭 시 우상단 상세 정보 패널(`source_fields`)을 렌더링한다.
   - `/photo2map`의 업로드 토지 하이라이트도 초기 로딩에서 `bbox`를 전달하지 않고 전체 업로드 PNU 매칭 결과를 우선 확보한다.
   - 상세 정보 패널은 `photo2map` 모드에서 사진 패널의 실측 높이/하단 오프셋을 반영해 가용 높이를 동적으로 제한하고, 두 패널 동시 노출 시 겹침을 방지한다.
8. `/file2map`·`/siyu` 진입 시 저장된 사진 마커가 있으면 지도에 함께 표시되고, 마커 클릭 시 우하단 선택 사진 패널(클릭 시 이미지 뷰어 열기)을 동일하게 제공한다.
   - 선택 사진 패널이 열려 있는 동안 `/file2map`·`/siyu` 상세 정보 패널 최대 높이를 사진 패널 실측값 기반 안전 영역으로 제한해 두 패널의 겹침을 방지한다.
9. 서버 API에 사진 파일을 업로드하지 않으며 EXIF 파싱/보관은 브라우저 로컬에서만 수행한다.

## 설정
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

## 운영 참고
- 관리자 FGB 업로드(`POST /admin/upload/cadastral-fgb`)는 검증 성공 시 `.env`의 `CADASTRAL_FGB_PATH`와 런타임 경로를 즉시 갱신한다.
- 업로드 실패 시 기존 운영 FGB 경로/파일은 유지되며, 성공 후에는 이전 운영 경로 파일을 정리한다.
- `/api/v1/*` alias 계약은 계속 유지한다.
- 로그인/이벤트 레이트리밋은 인메모리라 멀티 인스턴스에 한계가 있다.
- `/photo2map`은 브라우저 보안 제약으로 로컬 경로 문자열 입력을 지원하지 않고 폴더 선택 UI만 지원한다.
