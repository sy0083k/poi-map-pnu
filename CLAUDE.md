# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

After completing any task that modifies repository files, suggest an appropriate git commit title in the final response.
저장소 파일 변경에는 코드와 문서 변경을 모두 포함한다.

## Mandatory Pre-Check

Before planning or implementing any change, read `docs/engineering-guidelines.md` first. It is the single source of truth for architecture rules, coding style, and security invariants. When responding to PRs, state whether the change complies with guidelines and note any conflicts.

`docs/refactoring-strategy.md` and `docs/reports/*` are **archive/reference only** — do not treat them as current rules.

## Commands

**Backend quality checks (run before any commit):**
```bash
python -m compileall -q app tests
mypy app tests create_hash.py
ruff check app tests
scripts/check_quality_warnings.sh
```

**Tests:**
```bash
pytest -m unit -q
pytest -m integration -q
pytest -m e2e -q
pytest -q                        # all tests
scripts/run_coverage.sh          # coverage report
scripts/run_coverage.sh --xml --html
```

**Frontend:**
```bash
cd frontend && npm run typecheck
cd frontend && npm run build
```

**Run server:**
```bash
uvicorn app.main:app --reload
```

**Docker:**
```bash
cp .env.example .env
docker compose build && docker compose up -d
curl http://127.0.0.1:8000/health
```

**Generate admin password hash:**
```bash
python create_hash.py
```

**Shapefile → FlatGeobuf 변환 (ogr2ogr 필요):**
```bash
ogr2ogr -f FlatGeobuf \
  -t_srs EPSG:3857 \
  data/LSMD_CONT_LDREG_<지역코드>_<연월>.fgb \
  <원본_shp_경로>/<파일명>.shp
```

## Architecture

### Backend (FastAPI, `app/`)

Strict three-layer separation — **MUST** be maintained:

| Layer | Location | Responsibility |
|---|---|---|
| Router | `app/routers/` | Thin HTTP handlers — no domain logic |
| Service | `app/services/` | All business logic |
| Repository | `app/repositories/` | All DB/SQL access |
| Client | `app/clients/` | All external API calls (VWorld, etc.) |

Config lives in `app/core/` and is loaded from environment variables only. `app/main.py` is the FastAPI entry point — it mounts routes, sets session/security headers, and serves Jinja2 templates. Admin 경로: `/admin/login`, `/admin/upload/city` (Excel), `/admin/upload/cadastral-fgb` (FGB → 완료 즉시 render cache 재구축).

**API contract:** `/api/v1/*` is an alias for `/api/*` and must remain equivalent. Any field/status-code change requires reviewing both.

### Frontend (TypeScript + Vite, `frontend/src/`)

- `map.ts` — orchestration only (bootstraps theme, wires modules together)
- `map/*` — feature modules (rendering, workflows, filters, panels, workers)
- `http.ts` — **all** network calls must go through this utility (timeout/error normalization)
- `admin.ts` — admin panel

Three map themes, each with its own engine:
- `/siyu` → **MapLibre GL** + **PMTiles** (city-owned property, vector tiles)
- `/file2map` → **OpenLayers** (local Excel/FGB upload)
- `/photo2map` → **OpenLayers** (EXIF GPS photo mode)

FlatGeobuf geometry parsing runs in a **Web Worker** (`cadastral-fgb-worker.ts`) to keep the main thread unblocked. Results are cached in **IndexedDB** (`cadastral-fgb-cache.ts`).

### Data Flow

1. Frontend fetches land list from `/api/lands/list?theme=...`
2. PNU codes drive highlight requests to `/api/cadastral/highlights`
3. Geometry served from FGB file (`CADASTRAL_FGB_PATH`) parsed in worker, cached in IndexedDB
4. PMTiles URL (`CADASTRAL_PMTILES_URL`) provides cadastral vector tile overlay
5. Analytics tracked via `/api/web-events`

### Key Environment Variables

| Variable | Purpose |
|---|---|
| `VWORLD_WMTS_KEY` | Basemap tile API key (safe to expose to browser) |
| `CADASTRAL_FGB_PATH` | Path to FlatGeobuf parcel geometry file |
| `CADASTRAL_PMTILES_URL` | PMTiles vector tile URL for `/siyu` |
| `ADMIN_ID` / `ADMIN_PW_HASH` | Admin credentials (bcrypt hash) |
| `SECRET_KEY` | Session encryption — never log or expose |
| `ALLOWED_IPS` | IP allowlist for all admin routes |
| `TRUST_PROXY_HEADERS` / `TRUSTED_PROXY_IPS` | Proxy trust policy (must be explicit) |

## Security Invariants (MUST)

- Admin routes (`/admin/*`) are restricted by `ALLOWED_IPS` **and** session auth. State-changing requests (POST/PUT/PATCH/DELETE) also require CSRF verification — both checks must be present simultaneously.
- `SECRET_KEY` and password hashes must never appear in logs or API responses. `VWORLD_WMTS_KEY` is the only key allowed in browser responses (public tile API).
- Proxy trust (`TRUST_PROXY_HEADERS`) must be explicitly configured — do not assume defaults.
- Rate limiting is in-memory only; multi-instance deployments do not share limits.

## Change Control

When modifying features, update the corresponding docs:

| Change type | Update |
|---|---|
| Structure/data flow | `docs/architecture.md` |
| Operations/procedures | `docs/maintenance.md` |
| Security controls | `docs/stride-lite.md` |
| User/ops summary | `README.MD` |
| Hub links | `docs/index.md` |
| Risks/improvements | `docs/TODO.MD` — 상태(`todo/doing/blocked/done`), 목표일, 리뷰 로그 최신화 필수 |

## Operational Notes

- `.env` 변경은 서버 재시작 없이 반영되지 않는다. 변경 작업 설명에 재시작 필요 여부를 명시한다.
- 로그인 실패 횟수 및 이벤트 레이트리밋은 인메모리 기반이다. 다중 인스턴스 배포 시 인스턴스 간 공유되지 않는다.
- Admin FGB 업로드(`/admin/upload/cadastral-fgb`)는 완료 즉시 서버 측 render cache를 재구축한다.

## Testing Requirements

Tests are marked `unit` / `integration` / `e2e`. Add tests matching the scope of each change. Coverage threshold is 70%. High-regression-risk flows (auth, upload, CSRF) must have integration tests.
