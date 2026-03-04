# 아키텍처 및 흐름

프로젝트: 관심 필지 지도 (POI Map Geo)  
작성일: 2026-02-11  
최종 수정일: 2026-03-04

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
- `POST /api/events`
- `POST /api/web-events`
- `GET /api/public-download`
- `/api/v1/*`는 `/api/*`와 동등 alias

## 관리자/인증 엔드포인트
- `GET /admin/login`
- `POST /login` (`POST /admin/login` alias)
- `GET /logout`
- `GET /admin`
- `POST /admin/upload`
- `POST /admin/public-download/upload`
- `GET /admin/public-download/meta`
- `POST /admin/settings`
- `POST /admin/password`
- `GET /admin/stats`
- `GET /admin/stats/web`
- `GET /admin/raw-queries/export`

## 지도 데이터 흐름
1. 클라이언트가 `/api/config`로 지도 설정을 조회한다.
2. `/api/lands/list`로 업로드 목록(PNU)을 불러온다.
   - 각 항목에는 고정 필드 외에 업로드 원본 컬럼을 보존한 `sourceFields` 배열이 포함된다.
3. 클라이언트는 목록 PNU만 대상으로 FlatGeobuf에서 1회 매칭해 하이라이트 캐시를 구성한다.
4. 지도 렌더링은 하이라이트 레이어만 사용하며, 비하이라이트 필지(배경 연속지적도)는 표시하지 않는다.
5. 지도 이동 시에는 하이라이트 캐시를 재사용한다.
6. OpenLayers `GeoJSON.readFeatures`에는 `dataProjection=CADASTRAL_FGB_CRS`, `featureProjection=EPSG:3857`을 명시해 투영 오인으로 인한 미표시를 방지한다.
7. 토지 선택 시 상세정보는 지도 팝업이 아니라 우상단 패널에서 동적으로 렌더링하며, 패널은 2열(속성/값) 그리드로 속성/값 Pair를 동일 라인(y축)에 정렬한다.
   - 패널 헤더의 `X` 버튼으로 닫을 수 있으며, 필지를 다시 선택하면 자동 재표시된다.
8. 배경지도 기본 레이어는 `Satellite`이며, UI에서 레이어 선택 버튼은 노출하지 않는다.
9. 선택된 하이라이트 필지는 노란색 경계선 스타일로 렌더링하고, 비선택 하이라이트는 기존 빨간 스타일을 유지한다.

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
