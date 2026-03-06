# 아키텍처 및 흐름

프로젝트: 관심 필지 지도 (POI Map Geo)  
작성일: 2026-02-11  
최종 수정일: 2026-03-06

## 시스템 개요
관심 필지 지도는 FastAPI + SQLite + Vite/OpenLayers 기반 애플리케이션이다.
지도 경계 데이터는 외부 WFS가 아니라 FlatGeobuf 파일(`data/LSMD_CONT_LDREG_44210_202512.fgb`)을 사용한다.

## 레이어 구성
- 라우터: `app/routers/*`
- 서비스: `app/services/*`
- 리포지토리: `app/repositories/*`
- 프런트 오케스트레이션: `frontend/src/map.ts`
- 프런트 지도 모듈: `frontend/src/map/*`

## 공개 엔드포인트
- `GET /api/config`
- `GET /api/cadastral/fgb`
- `GET /api/lands`
- `GET /api/lands/list`
- `POST /api/lands/export`
- `POST /api/events`
- `POST /api/web-events`
- `/api/v1/*`는 `/api/*`와 동등 alias

## 공개 페이지
- `GET /` (307으로 `/siyu` 리디렉션)
- `GET /file2map` (파일→지도 메인)
- `GET /siyu` (시유재산 지도 메인)
- `GET /readme` (글로벌 헤더 유지 README 마크다운 렌더 뷰)
- `GET /README.MD` (원문 파일 응답, 호환 경로)

## 관리자/인증 엔드포인트
- `GET /admin/login`
- `POST /login` (`POST /admin/login` alias)
- `GET /logout`
- `GET /admin`
- `POST /admin/upload`
- `POST /admin/upload/city`
- `POST /admin/settings`
- `POST /admin/password`
- `GET /admin/stats`
- `GET /admin/stats/web`
- `GET /admin/raw-queries/export`

## 지도 데이터 흐름
1. 클라이언트가 `/api/config`로 지도 설정을 조회한다.
2. 테마별 목록 소스를 결정한다.
   - `/siyu(city_owned)`: `/api/lands/list?theme=city_owned`로 목록을 조회한다.
   - `/file2map(national_public)`: 기본은 `/api/lands/list?theme=national_public`이며, 사용자가 사이드바 상단에서 업로드한 엑셀 파일이 있으면 브라우저 로컬 저장소(IndexedDB) 복원 데이터를 우선 사용한다.
   - 목록 항목에는 고정 필드 외에 업로드 원본 컬럼을 보존한 `sourceFields` 배열이 포함된다.
3. 클라이언트는 목록 PNU만 대상으로 FlatGeobuf에서 1회 매칭해 하이라이트를 구성한다.
   - 매칭 파싱은 Web Worker에서 수행해 메인 스레드 블로킹을 줄인다.
   - 결과는 IndexedDB 캐시(`theme + pnuSetHash + fgb ETag`)로 저장해 재방문 시 재스캔을 회피한다.
   - `/api/cadastral/fgb`는 `ETag` 헤더를 제공해 클라이언트 캐시 무효화 기준으로 사용한다.
4. 지도 렌더링은 하이라이트 레이어만 사용하며, 비하이라이트 필지(배경 연속지적도)는 표시하지 않는다.
5. 지도 이동 시에는 하이라이트 캐시를 재사용한다.
6. 사이드바 `검색 결과 다운로드` 버튼 동작은 테마별로 분기한다.
   - `/siyu(city_owned)`: 현재 검색 결과 `id` 집합을 `/api/lands/export`로 전송해 서버에서 Excel을 생성한다.
   - `/file2map(national_public)` + 로컬 업로드 모드: 현재 검색 결과를 브라우저에서 직접 Excel(`.xlsx`)로 생성해 다운로드한다.
7. OpenLayers `GeoJSON.readFeatures`에는 `dataProjection=CADASTRAL_FGB_CRS`, `featureProjection=EPSG:3857`을 명시해 투영 오인으로 인한 미표시를 방지한다.
8. 토지 선택 시 상세정보는 지도 팝업이 아니라 우상단 패널에서 동적으로 렌더링하며, 패널은 2열(속성/값) 그리드로 속성/값 Pair를 동일 라인(y축)에 정렬한다.
   - 웹앱 초기화 시 상세 패널은 숨김 상태로 시작한다.
   - 패널 헤더의 `X` 버튼으로 닫을 수 있으며, 필지를 다시 선택하면 자동 재표시된다.
9. 배경지도 기본 레이어는 `Satellite`이며, 상단 헤더 `배경지도` 메뉴에서 `일반지도(Base)`, `백지도(White)`, `영상지도(Satellite)`, `하이브리드(Hybrid)` 전환을 지원한다.
   - VWorld WMTS 호출 시 `백지도(White)`는 URL layer 식별자 `white`(소문자)로 매핑한다.
   - `백지도(White)` 선택 시 최대 줌 레벨은 `18`로 제한한다.
10. 선택된 하이라이트 필지는 노란색 경계선 스타일로 렌더링하고, 비선택 하이라이트는 기존 빨간 스타일을 유지한다.
   - 선택 필지는 별도 상위 레이어로 렌더링해 인접 필지 경계선에 가려지지 않도록 한다.
11. 상단 헤더는 `시작`(같은 창 `/readme`), `배경지도`, `주제도` 메뉴를 제공한다.
    - 데스크톱에서 메뉴의 시작 x좌표는 사이드바 끝점을 기준으로 고정 오프셋(`--topbar-menu-anchor-x`)을 사용한다.
    - 메뉴 사이에는 짧은 세로 구분 바로 시각적 분리감을 제공한다.
    - `주제도` 메뉴는 `시유지` 하위 항목을 제공한다.
    - 헤더에서 `주제도` 오른쪽에 탑레벨 `파일→지도` 메뉴를 두고, `http://127.0.0.1:8000/file2map`(내부 경로 `/file2map`)로 이동한다.
    - 주제도 경로는 `파일→지도=/file2map`, `시유지=/siyu`로 매핑되며 URL 직접 진입/새로고침 시 해당 테마로 초기화된다.
    - 데이터 저장은 `국·공유재산(poi)` / `시유재산(poi_city)` 테이블로 분리되며, 조회 API `theme` 쿼리로 레이어별 데이터를 선택한다.
    - `/siyu` 유틸리티 사이드바는 주소/재산용도/지목/면적/재산관리관 필터를 지원한다.
    - `/file2map` 유틸리티 사이드바는 최상단 파일 업로드 UI + 주소/지목/면적 필터를 지원한다(`재산관리관`, `재산용도` UI 비노출).
    - `/siyu`에서 재산관리관 조건 검색의 고유값이 2개 이상이면 검색을 중단하고 상태 영역(`#map-status`)에 다중 검출 목록을 표시한다.
    - 상태 영역은 데스크톱에서 좌상단 줌 UI를 가리지 않도록 폭/좌측 오프셋을 제한하고, `X` 버튼으로 임시 닫기를 지원한다(다음 상태 갱신 시 자동 재표시).
12. 데스크톱에서는 지도-사이드바 경계의 핸들을 클릭해 사이드바를 슬라이드로 접기/펼치기 할 수 있으며, 상태는 로컬 스토리지로 복원한다.
    - 핸들은 청록색 배경과 방향 힌트(`>`/`<`)로 확장/축소 가능성을 직관적으로 노출한다.
    - 모바일(`<=768px`)은 기존 `mobile-home/search/results` 바텀시트 레이아웃을 우선한다.

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
- FlatGeobuf 파일 교체 후 앱 재시작이 필요할 수 있다.
- `/api/v1/*` alias 계약은 계속 유지한다.
- 로그인/이벤트 레이트리밋은 인메모리라 멀티 인스턴스에 한계가 있다.
