# 아키텍처 및 흐름

프로젝트: IdlePublicProperty  
작성일: 2026-02-11

## 시스템 개요
IdlePublicProperty는 공공 지도 데이터를 제공하고, 관리자 전용 업로드 및 관리 워크플로를 지원하는 FastAPI 웹 애플리케이션이다. 데이터는 SQLite에 저장되며 VWorld API를 통해 지오메트리 정보를 보강한다.

## 레이어 구성
- **라우터**: HTTP 엔드포인트, 요청/응답 매핑, 의존성 연결
  - `app/routers/auth.py`
  - `app/routers/admin.py`
  - `app/routers/map_router.py`
  - `app/routers/map_v1_router.py`
- **서비스**: 비즈니스 로직 및 오케스트레이션
  - `app/services/auth_service.py`
  - `app/services/upload_service.py`
  - `app/services/land_service.py`
  - `app/services/geo_service.py`
- **리포지토리**: SQL 및 영속성 처리
  - `app/repositories/idle_land_repository.py`
- **클라이언트**: 외부 연동
  - `app/clients/vworld_client.py`
- **검증기**: 업로드 정규화 및 검증
  - `app/validators/land_validators.py`

## 주요 구성 요소
- **세션 + CSRF**: SessionMiddleware가 서명된 세션 쿠키를 관리한다. CSRF 토큰은 세션에 저장되며 관리자 POST 요청에서 검증한다.
- **레이트 리미팅**: 로그인 실패에 대해 인메모리 제한을 적용한다.
- **데이터베이스**: `data/database.db`의 SQLite.
- **외부 API**: 지오코딩 및 WFS 조회를 위한 VWorld.

## 데이터 모델 (SQLite)
테이블: `idle_land`  
컬럼:
- `id` (INTEGER, PK)
- `address` (TEXT)
- `land_type` (TEXT)
- `area` (REAL)
- `adm_property` (TEXT)
- `gen_property` (TEXT)
- `contact` (TEXT)
- `geom` (TEXT, GeoJSON)

## 공개 엔드포인트
- `GET /api/config`
- `GET /api/lands`
- `GET /api/v1/config`
- `GET /api/v1/lands`

## 관리자 엔드포인트
- `GET /admin/login`
- `POST /login`
- `GET /admin`
- `POST /admin/upload`
- `GET /logout`

## 흐름: 공개 지도 조회
1. 클라이언트가 `/api/config`로 지도 설정을 조회한다.
2. 클라이언트가 `/api/lands`로 GeoJSON 데이터를 조회한다.
3. `land_service.get_public_land_features()`가 리포지토리에서 데이터를 읽어 GeoJSON으로 반환한다.

## 흐름: 관리자 로그인
1. `GET /admin/login`이 세션에 CSRF 토큰을 발급하고 로그인 페이지를 렌더링한다.
2. `POST /login`이 CSRF 검증, 자격 증명 확인, 세션 갱신, 로그인 실패 제한을 수행한다.

## 흐름: 관리자 업로드
1. `POST /admin/upload`에서 CSRF, 파일 타입, 파일 크기를 검증한다.
2. 엑셀 행을 검증 및 정규화한다.
3. 리포지토리에서 데이터를 삭제 후 단일 커넥션으로 삽입한다.
4. 백그라운드 작업으로 지오메트리 보강을 수행한다.

## 흐름: 지오메트리 보강
1. `geo_service.update_geoms()`가 지오메트리가 없는 행을 조회한다.
2. 각 행에 대해 `VWorldClient.get_parcel_geometry()`를 호출한다.
3. `geom` 컬럼을 업데이트하고 커밋한다.

## 설정
`app/core/config.py`가 환경변수에서 로드한다. 필수:
- `VWORLD_WMTS_KEY`, `VWORLD_GEOCODER_KEY`, `ADMIN_ID`, `ADMIN_PW_HASH`, `SECRET_KEY`
선택:
- `ALLOWED_IPS`, `MAX_UPLOAD_SIZE_MB`, `MAX_UPLOAD_ROWS`, `LOGIN_MAX_ATTEMPTS`,
  `LOGIN_COOLDOWN_SECONDS`, `VWORLD_TIMEOUT_S`, `VWORLD_RETRIES`, `VWORLD_BACKOFF_S`,
  `SESSION_HTTPS_ONLY`, `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_IPS`, `UPLOAD_SHEET_NAME`

## 운영 참고
- 관리자 엔드포인트는 내부 IP 허용 목록과 세션 인증으로 보호된다.
- 프록시 환경에서는 신뢰 프록시(`TRUSTED_PROXY_IPS`) 경유 요청에 한해 `X-Forwarded-For`를 사용한다.
- VWorld WMTS 키는 지도 사용을 위해 `/api/config`에서 제공된다. Geocoder 키는 서버 전용이다.
- 지오메트리 업데이트는 백그라운드 작업이며 VWorld 가용성에 의존한다.
