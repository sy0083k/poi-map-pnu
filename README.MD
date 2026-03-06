# 🏠 관심 필지 지도 (POI Map PNU)

브이월드(VWorld) WMTS와 FlatGeobuf 기반으로 관심 필지(POI, Parcel of Interest)를 지도에 시각화하고,  
관리자가 엑셀 업로드로 데이터를 갱신할 수 있는 웹 애플리케이션입니다.

## 📌 활용 사례
- 충청남도 서산시: 유휴 공유재산 지도
  
## 🛠 핵심 기술 스택
- Backend: Python 3.12, FastAPI, SQLite
- Frontend: TypeScript, Vite, OpenLayers
- Data: pandas, openpyxl/xlrd
- External API/Data: VWorld (WMTS), FlatGeobuf

세부 구현 원칙은 `docs/engineering-guidelines.md`를 기준으로 합니다.

## 🚀 빠른 시작

### 1) 사전 준비
- Python 3.12
- Node.js + npm (frontend 빌드용)
- VWorld API 키 (WMTS)

### 2) 환경 변수 설정
`.env.example`을 복사해 `.env`를 생성합니다.

```bash
cp .env.example .env
```

필수 환경 변수:
- `VWORLD_WMTS_KEY`
- `CADASTRAL_FGB_PATH`
- `ADMIN_ID`
- `ADMIN_PW_HASH`
- `SECRET_KEY`

`ADMIN_PW_HASH`는 bcrypt 해시여야 하며, 아래 명령으로 생성할 수 있습니다.

```bash
python create_hash.py
```

선택 환경 변수(요약):
- `ALLOWED_IPS`, `SESSION_HTTPS_ONLY`
- `SESSION_COOKIE_NAME`, `SESSION_NAMESPACE`
- `MAX_UPLOAD_SIZE_MB`, `MAX_UPLOAD_ROWS`
- `LOGIN_MAX_ATTEMPTS`, `LOGIN_COOLDOWN_SECONDS`
- `CADASTRAL_FGB_PNU_FIELD`, `CADASTRAL_FGB_CRS`, `CADASTRAL_MIN_RENDER_ZOOM`
- `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_IPS`
- `UPLOAD_SHEET_NAME`

지도 초기 화면에서 연속지적도를 바로 표시하려면 `MAP_DEFAULT_ZOOM >= CADASTRAL_MIN_RENDER_ZOOM` 조건을 만족해야 합니다.

### 3) 의존성 설치
```bash
pip install -r requirements.txt
cd frontend
npm ci
cd ..
```

### 4) 프런트 빌드
```bash
cd frontend
npm run build
cd ..
```

### 5) 서버 실행
```bash
uvicorn app.main:app --reload
```

기본 접속 URL:
- 메인: `http://127.0.0.1:8000/` (접속 시 `http://127.0.0.1:8000/siyu`로 307 리디렉션)
- 사진 지도: `http://127.0.0.1:8000/photo2map`
- 관리자 로그인: `http://127.0.0.1:8000/admin/login`

## 🧩 화면 구성 (UI Composition & Terminology)

### 데스크톱 레이아웃 용어표
| 영역명(국문) | 전문 명칭(영문) | 역할 | 주요 요소 ID/Class |
|---|---|---|---|
| 글로벌 헤더 | Global Navigation Header | 상위 메뉴(`시작/배경지도/주제도`)와 전역 이동 제공 | `#app-topbar`, `.topbar-menu` |
| 애플리케이션 셸 | Application Shell | 지도/사이드바/패널을 포함하는 메인 레이아웃 컨테이너 | `#app-shell` |
| 유틸리티 사이드바 | Utility Sidebar (Filter & Result Panel) | 필터 입력, 검색 결과 목록, 네비게이션(이전/다음) 제공 | `#sidebar`, `#filter-section`, `#list-container` |
| 지도 캔버스 | Primary Map Canvas | OpenLayers 기반 필지 시각화 및 사용자 상호작용 처리 | `#map` |
| 지도 상태바 | Map Status Overlay | 하이라이트 준비/강조 건수/검증 메시지를 지도 상단 1줄로 표시하고 `X` 버튼으로 임시 닫기 지원 | `#map-status`, `#map-status-close` |
| 상세 정보 패널 | Detail Information Panel | 선택 필지의 동적 속성/값 표시 | `#land-info-panel`, `#land-info-content` |
| 사이드바 토글 핸들 | Sidebar Toggle Handle | 데스크톱에서 사이드바 접기/펼치기 제어 | `#sidebar-handle` |
| 토스트 알림 | Transient Toast | 짧은 상태/피드백 메시지 표시 | `#ui-toast` |

### 모바일 레이아웃 용어표
| 영역명(국문) | 전문 명칭(영문) | 역할 | 주요 요소 ID/Class |
|---|---|---|---|
| 검색 플로팅 버튼 | Floating Action Button (FAB) | 모바일에서 검색 화면 진입 트리거 | `#mobile-search-fab` |
| 검색 오버레이 | Full-screen Search Overlay | 전체화면 검색 조건 입력 UI | `#mobile-search-overlay` |
| 결과 바텀시트 | Result Bottom Sheet | 검색 결과 목록 및 네비게이션 제공 | `body.mobile-results #sidebar` |

### 상태/상호작용 규칙
- 모바일 UI 상태는 `mobile-home` → `mobile-search` → `mobile-results` 순으로 전환된다.
- 선택 필지는 `Selected Feature Highlight`로 처리되며, 노란색 경계선으로 강조된다.
- 상세 정보 패널(`Detail Information Panel`)은 초기 진입 시 숨김이며, 필지 선택 시 표시된다.
- 헤더 메뉴(`Top-level Navigation Menu`)는 항목 간 짧은 구분 바로 시각적으로 분리된다.
- 사이드바 토글은 `Expanded/Collapsed State`를 사용하며, 상태는 로컬 스토리지로 복원된다.

## 🔐 관리자 사용 흐름
1. `/admin/login`에서 로그인
2. `/admin`에서 엑셀 업로드
   - 시유지용: `/admin/upload/city`
   - 필수 컬럼: `고유번호`, `소재지`, `지목`, `실면적`, `재산관리관`
3. 메인 지도는 업로드 목록 PNU만 1회 매칭해 하이라이트 캐시를 구성하며, 하이라이트 대상이 아닌 필지 연속지적도는 표시하지 않는다.
   - FlatGeobuf 파싱은 Web Worker에서 수행하고, 결과는 IndexedDB 캐시(`theme+pnuSetHash+ETag`)로 재사용한다.
   - 상단 헤더에 `시작`, `배경지도`, `주제도` 메뉴가 표시된다.
   - 헤더 메뉴(`시작`, `배경지도`, `주제도`) 사이에는 짧은 세로 구분 바가 표시된다.
   - 데스크톱에서 헤더 메뉴의 시작 x좌표는 사이드바 끝점 고정 오프셋(`--topbar-menu-anchor-x`)을 기준으로 배치된다.
  - `시작`은 새 창이 아니라 같은 창에서 `/readme` 페이지로 이동하며, 글로벌 헤더를 유지한 상태로 README 본문을 마크다운 렌더링으로 표시한다.
   - `배경지도` 메뉴는 `일반지도/백지도/영상지도/하이브리드` 순서로 제공되며, 실제로 베이스맵이 전환된다(`백지도`는 WMTS `white` 레이어로 호출, 최대 줌 18).
   - `주제도` 메뉴는 `시유지` 하위 항목을 제공한다.
   - 글로벌 헤더에서 `주제도` 오른쪽에 탑레벨 `파일→지도` 메뉴가 표시되며, 클릭 시 `http://127.0.0.1:8000/file2map`(내부 경로 `/file2map`)로 이동한다.
   - 글로벌 헤더에 탑레벨 `사진→지도` 메뉴가 표시되며, 클릭 시 `http://127.0.0.1:8000/photo2map`(내부 경로 `/photo2map`)로 이동한다.
   - `시유지(/siyu)` 유틸리티 사이드바는 `재산용도` 콤보(`전체/행정재산/일반재산`) + `지목` + `재산관리관` + 면적 복합 검색을 지원한다.
   - `시유지(/siyu)`에서 `재산관리관` 검색 결과의 고유값이 2개 이상이면 검색이 중단되고 상태 영역(`#map-status`)에 검출 목록이 표시된다.
   - `파일→지도(/file2map)` 유틸리티 사이드바 최상단에는 사용자 엑셀 업로드 UI가 표시된다.
   - 신규 브라우저에서 `/file2map` 최초 진입 시 목록은 비어 있으며, 파일 적용 전까지 토지 목록을 표시하지 않는다.
   - `/file2map`에서는 업로드 파일이 지도/목록 데이터 소스를 대체하며 브라우저 IndexedDB에 저장되어 새로고침 시 복원된다.
   - `/file2map` 업로드 복원/검증/적용/초기화 메시지는 업로드 패널이 아니라 지도 상단 상태 영역(`#map-status`)에 표시된다.
   - `/file2map`에서는 `재산관리관`, `재산용도` 필터 UI를 노출하지 않고 `지역명·주소/지목/면적` 필터만 사용한다.
   - 초기 배경지도는 `영상 지도(Satellite)`로 시작한다.
   - 데스크톱에서는 지도-사이드바 경계의 `핸들` 클릭으로 좌측 패널을 슬라이드 수납할 수 있고, 상태가 복원된다.
4. 지도에서 토지를 선택하면 팝업 대신 우상단 상세 패널에 업로드 원본 컬럼이 동적으로 표시되며, 속성과 값은 동일한 라인(y축)으로 정렬된다.
   - 초기 진입 시 상세 패널은 숨김 상태이며, 필지 첫 선택 시 자동으로 열린다.
   - 패널 우상단 `X` 버튼으로 닫을 수 있고, 토지를 다시 선택하면 패널이 다시 열린다.
   - 현재 선택된 토지(지도 클릭/사이드바 선택)는 노란색 경계선으로 강조 표시되며, 별도 상위 레이어로 렌더링되어 인접 필지보다 위에 보인다.
   - 데스크톱 사이드바 핸들은 `>`/`<` 방향 힌트로 접기/펼치기 가능성을 직관적으로 표시한다.
5. FGB 파일 조회 실패 시 지도 상태 문구에 오류가 표시된다.
6. 사이드바의 `검색 결과 다운로드` 버튼은 테마별로 동작한다.
   - `/siyu`: 서버(`/api/lands/export`)에서 Excel 생성
   - `/file2map`: 브라우저에서 현재 검색 결과를 직접 Excel 생성
7. 통계 탭에서 `전체 필지 수` 및 이벤트 통계를 확인 가능

## 🖼️ 사진→지도 (`/photo2map`)
- `/file2map`과 동일한 공통 지도 셸(`index.html` + `map.ts`)을 사용하고, 사진 모드 컨트롤러로 동작한다.
- 브라우저 폴더 선택(`webkitdirectory`)으로 로컬 사진 폴더를 선택한다.
- JPEG(`.jpg`, `.jpeg`) 사진의 EXIF GPS 정보를 브라우저에서 직접 파싱한다.
- GPS 정보가 있는 사진만 지도에 마커로 표시된다.
- 데스크톱에서는 유틸리티 사이드바가 지도 좌측(기본 위치)에 배치되고, 사진 목록과 이전/다음 네비게이션으로 마커 간 이동을 지원한다.
- `/photo2map` 유틸리티 사이드바의 업로드/목록/네비게이션 UI는 `/file2map` 사이드바 스타일 규격(버튼/간격/목록 선택 강조/푸터)을 공통으로 사용한다.
- 마커/목록 선택 시 지도 우하단 미리보기 패널이 갱신되어 선택된 사진을 표시한다.
- 미리보기 패널을 클릭하면 지도 위 대형 모달 패널로 사진을 확대해 볼 수 있다(ESC/배경 클릭/닫기 버튼으로 닫기).
- `/photo2map`에서 생성한 사진 마커 데이터는 브라우저(IndexedDB)에 저장되며, `/file2map` 이동 후 다시 `/photo2map`으로 복귀해도 자동 복원된다.
- `/file2map`에서도 저장된 사진 마커를 지도에 표시하며, 마커 클릭 시 우하단 선택 사진 패널/대형 모달을 동일하게 사용할 수 있다.
- `/file2map`에서 업로드해 브라우저에 저장된 토지(PNU) 하이라이트를 `/photo2map`에서도 표시하고, 토지를 클릭하면 우상단 상세 정보 패널이 열린다.
- `/photo2map`에서 상세 정보 패널과 사진 패널이 동시에 열릴 때를 대비해 상세 패널 최대 높이를 제한해 패널 간 겹침을 방지한다.
- 서버에 사진 원본 업로드는 수행하지 않는다.

## 📱 모바일 화면 흐름
- 초기 화면: 지도 중심 화면 + 우하단 검색(돋보기) 버튼
- 검색 화면: 돋보기 버튼 클릭 시 전체화면 검색 입력 오버레이
- 결과 화면: 검색 실행 후 화면 하단 50% 결과 패널 + 지도 연동
- 뒤로가기: 결과 → 검색 → 초기 화면 순으로 단계 복귀

## 🧭 API 개요

### 공개 API (`/api`)
- `GET /api/config`
- `GET /api/cadastral/fgb`
- `GET /api/lands`
- `GET /api/lands/list`
  - `theme` 쿼리 지원: `city_owned` (미지정 시 기본 `city_owned`, `national_public`은 400)
- `POST /api/lands/export`
  - 요청 본문: `theme`, `landIds[]`
  - 응답: 검색 결과 토지의 원본 업로드 컬럼 전체 속성 Excel(`.xlsx`)
- `POST /api/events`
- `POST /api/web-events`

### 버전 경로 (`/api/v1`)
- `/api/v1/*`는 현재 **유지 중인 호환성(alias) 경로**입니다.
- `/api/v1/*`는 `/api/*`와 동일한 요청/응답 계약(필드 의미, 상태코드, 레이트리밋)을 제공합니다.
- 신규 기능/변경은 `/api/*`를 기준으로 적용하며 `/api/v1/*` 동등성을 유지합니다.
- 향후 폐기 시 사전 공지 + Deprecation/Sunset 헤더 + 관측 기간을 거친 뒤 제거합니다.

### 관리자/인증
- `GET /admin/login`
- `POST /login` (`POST /admin/login` alias 지원)
- `GET /logout`
- `GET /admin`
- `POST /admin/upload/city`
- `POST /admin/settings`
- `POST /admin/password`
- `GET /admin/stats`
- `GET /admin/stats/web`
- `GET /admin/raw-queries/export`

### 상태 점검
- `GET /health`
- `GET /health?deep=1` (DB + 연속지적도 파일 상태 확인)

## 🛡 보안/운영 포인트 (핵심)
- 관리자 보호 경로는 내부망 허용 IP(`ALLOWED_IPS`)와 세션 인증으로 보호되며, 상태 변경 요청에는 CSRF 검증을 적용합니다.
- `VWORLD_WMTS_KEY`는 일반/위성/하이브리드 베이스맵(WMTS) 렌더링용 예외 공개 키입니다.
- 연속지적도는 `CADASTRAL_FGB_PATH` 파일에서 조회하며, PNU 매칭 필드는 `CADASTRAL_FGB_PNU_FIELD`를 사용합니다.
- 클라이언트 렌더링은 `CADASTRAL_FGB_CRS`를 OpenLayers `dataProjection`으로 사용해 투영 오인(기본 4326) 문제를 방지합니다.
- 프록시 환경에서는 `TRUST_PROXY_HEADERS`, `TRUSTED_PROXY_IPS`를 정확히 설정해야 합니다.
- 동일 브라우저/도메인에서 여러 앱을 운영하는 경우 앱별로 `SECRET_KEY`, `SESSION_COOKIE_NAME`, `SESSION_NAMESPACE`를 반드시 분리해야 세션 교차 인식을 방지할 수 있습니다.
- 이벤트 수집 API는 레이트리밋이 적용됩니다.
  - `POST /api/events`: 60 req/min
  - `POST /api/web-events`: 120 req/min
  - 초과 시 `429 Too Many Requests`, `Retry-After` 헤더 반환

## ⚠️ 운영 주의사항
- 관리자 화면에서 `.env`를 갱신해도 실행 중 프로세스의 설정 객체는 즉시 교체되지 않습니다. 운영 환경에서는 설정/비밀번호 변경 후 앱 재시작 절차를 함께 운영하세요.
- 관리자 설정 저장 시 `.env`의 동일 변수 중복 라인은 자동 정리되며, 마지막 값을 기준으로 키당 1줄만 유지됩니다.
- 로그인 실패 제한과 이벤트 레이트리밋은 현재 인메모리 구현입니다. 다중 인스턴스 운영 시 인스턴스 간 상태가 공유되지 않으므로 별도 공유 스토어 기반 정책을 고려하세요.
- API 버전 정책(`/api` vs `/api/v1`)의 운영 절차는 `docs/architecture.md`와 `docs/maintenance.md`를 기준으로 관리하세요.
- 연속지적도 파일 교체 시 `CADASTRAL_FGB_PATH` 설정과 파일 권한을 확인하고 앱을 재시작하세요.
- 하이라이트는 Web Worker + IndexedDB 캐시 기반으로 동작한다. 지연이 반복되면 브라우저 저장소 제한/삭제 여부와 `/api/cadastral/fgb`의 `ETag` 변경 여부를 함께 점검하세요.

## ✅ 테스트 및 품질 체크
루트 저장소의 기본 테스트 수집 대상은 `tests/`입니다.  
`IdlePublicProperty/`는 레거시 복제본(참조용)으로 루트 `pytest -q` 수집 대상에서 제외됩니다.

```bash
python -m compileall -q app tests
mypy app tests create_hash.py
ruff check app tests
scripts/check_quality_warnings.sh
cd frontend && npm run typecheck && npm run build
cd ..
pytest -m unit -q
pytest -m integration -q
pytest -m e2e -q
pytest -q
```

선택 실행:
```bash
RUN_HTTP_E2E=1 pytest -q tests/test_e2e_smoke.py
```

## ⚙️ CI/CD 워크플로
- CI: `.github/workflows/ci.yml`
  - frontend typecheck/build
  - Vite manifest 검증
  - `compileall`, `mypy`, `pytest`
- Deploy: `.github/workflows/deploy.yml`
  - 현재 배포 명령은 TODO 상태이며 프로젝트 환경에 맞게 채워야 합니다.

## 🐳 Docker 배포 (IP-only, no-domain)
도메인 없이 서버 IP로 직접 접속하는 운영을 가정합니다.

1. 환경 변수 파일 준비:
```bash
cp .env.example .env
```

2. 컨테이너 빌드/기동:
```bash
docker compose build
docker compose up -d
```

3. 상태 확인:
```bash
docker compose ps
curl http://127.0.0.1:8000/health
```

접속 URL:
- 메인: `http://<SERVER_IP>:8000/`
- 관리자 로그인: `http://<SERVER_IP>:8000/admin/login`

운영 메모:
- `docker-compose.yml`은 IP-only 환경을 위해 `SESSION_HTTPS_ONLY=false`, `TRUST_PROXY_HEADERS=false`를 기본값으로 사용합니다.
- SQLite DB는 `./data` 볼륨으로 영속화됩니다.

## 📂 디렉터리 구조
```text
project-root/
├─app/                    # FastAPI 애플리케이션
│  ├─routers/             # API 라우터
│  ├─services/            # 비즈니스 로직
│  ├─repositories/        # SQLite 접근
│  ├─clients/             # 외부 API 클라이언트
│  ├─validators/          # 업로드 검증/정규화
│  └─core/                # 설정 로딩
├─frontend/               # Vite + TypeScript 소스
│  └─src/map/             # 지도 화면 기능 모듈(map-view, filters, list-panel, telemetry, download-client, session-tracker 등)
├─templates/              # 서버 렌더링 템플릿
├─static/                 # 정적 파일 및 빌드 산출물(static/dist)
├─data/                   # SQLite DB 및 운영 데이터 파일
├─tests/                  # 테스트 코드
├─docs/                   # 운영/아키텍처/보안 문서
└─.github/workflows/      # CI/CD 워크플로
```

## 📚 문서
- 문서 포털: `docs/index.md`
- 아키텍처: `docs/architecture.md`
- 유지보수: `docs/maintenance.md`
- 보안 위협 모델: `docs/stride-lite.md`
- 엔지니어링 기준: `docs/engineering-guidelines.md`
- 리스크/개선 TODO: `docs/TODO.MD`

## 📄 라이선스
MIT License
