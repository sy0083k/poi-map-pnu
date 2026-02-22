# Phase 0 Baseline Report

프로젝트: IdlePublicProperty  
작성일: 2026-02-22  
범위: 리팩토링 전 기준선 고정(구조/품질/성능/우선순위)

## 1) 목적
- 리팩토링 전 현재 상태를 정량/정성 기준으로 고정한다.
- 이후 변경에서 "구조 개선"과 "회귀"를 구분할 수 있는 비교 기준을 만든다.

## 2) 측정 환경
- 실행 일시: 2026-02-22
- 런타임: 로컬 ASGI (`httpx.ASGITransport`, loopback client `127.0.0.1`)
- 설정: 테스트용 환경변수 세트(`tests/conftest.py`와 동일 계열)
- 샘플 수: 엔드포인트당 30회
- 참고: 로컬 측정값이므로 운영 환경 지연과는 다를 수 있음

## 3) 품질 기준선
### 3.1 테스트/체크 상태
- `python -m compileall -q app tests`: 통과
- `pytest -q -rs`: 통과
  - 스킵 1건: `tests/test_e2e_smoke.py` (`RUN_HTTP_E2E=1` 필요)

### 3.2 LOC 상위 파일 (복잡도/집중도 지표)
- `frontend/src/map.ts`: 807
- `app/repositories/idle_land_repository.py`: 614
- `frontend/src/admin.ts`: 464
- `app/services/stats_service.py`: 441
- `tests/test_stats_api.py`: 313
- `app/routers/admin.py`: 209

해석:
- 대형 파일 3개(`map.ts`, `idle_land_repository.py`, `stats_service.py`)가 리팩토링 1순위 후보다.

## 4) 모듈 의존도 기준선
### 4.1 Python fan-out (내부 모듈 import 수)
- `app/main.py`: 10
- `app/services/upload_service.py`: 6
- `app/services/geo_service.py`: 5
- `app/routers/admin.py`: 3
- `app/services/land_service.py`: 3

### 4.2 Python fan-in (타 모듈에서 참조되는 빈도)
- `app.logging_utils`: 7
- `app.db.connection`: 5
- `app.dependencies`: 5
- `app.core`: 4
- `app.repositories`: 4

### 4.3 Frontend fan-out (내부 import)
- `frontend/src/map.ts`: 1 (`./http`)
- `frontend/src/admin.ts`: 1 (`./http`)
- `frontend/src/login.ts`: 1 (`./http`)

해석:
- Python은 중심 모듈(`logging_utils`, `db.connection`) 결합이 명확하다.
- Frontend는 import fan-out 자체는 낮지만, `map.ts` 내부 책임이 과밀(파일 내부 응집도 문제)이다.

## 5) API 성능/오류 기준선 (로컬 샘플)
| Endpoint | Samples | Error Rate | p50 (ms) | p95 (ms) | Avg (ms) |
|---|---:|---:|---:|---:|---:|
| `GET /api/lands` | 30 | 0.00 | 6.81 | 11.22 | 8.96 |
| `POST /api/events` | 30 | 0.00 | 10.33 | 12.97 | 11.03 |
| `POST /api/web-events` | 30 | 0.00 | 10.13 | 11.61 | 10.26 |
| `GET /admin/stats?limit=10` | 30 | 0.00 | 1.43 | 2.00 | 1.53 |
| `GET /admin/stats/web?days=30` | 30 | 0.00 | 1.72 | 2.26 | 1.83 |

해석:
- 기준 샘플에서 오류율은 모두 0%.
- 상대적으로 `events`/`web-events`가 통계 조회보다 느리며, 리팩토링 후 이 구간 회귀 여부를 우선 감시한다.

## 6) 리팩토링 우선순위 (P0/P1/P2)
### P0 (즉시 착수)
- `frontend/src/map.ts`
  - 이유: 파일 크기/책임 혼재(UI/지도/필터/텔레메트리/다운로드/세션 추적)
- `app/repositories/idle_land_repository.py`
  - 이유: 저장소 책임 과밀(DDL, CRUD, 집계, 로그, 통계)
- `app/services/stats_service.py`
  - 이유: 이벤트 정규화/집계/CSV export가 한 모듈에 집중

### P1 (단기 착수)
- `/api` vs `/api/v1` 운영 정책 문서화
- `docs/refactoring-strategy.md`의 과거 진술과 현행 코드 정합화

### P2 (후순위)
- 세부 코드 스타일/함수 레벨 미세 정리
- low-risk 문서 표현 개선

## 7) Phase 0 완료 판정
- [x] 기준선 리포트 작성 완료 (본 문서)
- [x] 동작 불변 체크리스트 문서 별도 작성 완료 (`docs/reports/phase0-invariant-contract.md`)
