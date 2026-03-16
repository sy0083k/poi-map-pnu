# STRIDE-lite 위협 모델

프로젝트: 관심 필지 지도 (POI Map PNU)  
작성일: 2026-02-11  
최종 수정일: 2026-03-16

## 범위
- 공개 API: `/api/config`, `/api/cadastral/fgb`, `/api/cadastral/highlights`, `/api/lands`, `/api/lands/list`, `/api/file2map/upload/parse`, `/api/events`, `/api/web-events`, `/api/v1/*`
- 공개 페이지: `/siyu`, `/file2map`, `/photo2map`
- 관리자 API: `/admin/*`, `/login`, `/logout`(POST)
- 저장소: `data/database.db`, `data/*.fgb`
- 클라이언트 저장소: 브라우저 IndexedDB(`/file2map` 로컬 업로드 데이터), 브라우저 메모리(`/photo2map` 로컬 사진 미리보기 blob URL)

## 핵심 자산
- 관리자 세션/자격
- 업로드 데이터(관심 필지)
- FlatGeobuf 지적도 파일
- SQLite 렌더 인덱스(`parcel_render_item`)
- 이벤트 로그
- WMTS 공개 키

## 주요 위협과 통제
### Spoofing
- 위협: 관리자 세션 위조/재사용
- 통제: 세션 서명 + `SESSION_NAMESPACE` 검증 + 내부망 제한

### Tampering
- 위협: FGB 파일 변조
- 통제: 운영 파일 권한/배포 절차/무결성 점검 + 관리자 업로드(`POST /admin/upload/cadastral-fgb`)의 내부망/세션/CSRF 검증 + FlatGeobuf 파서 검증 + `parcel_render_item` 재생성 실패 시 기존 인덱스 유지
- 위협: 설정 hot-reload를 통한 보안 설정 변조
- 통제: `POST /admin/settings` 및 `POST /admin/password`는 내부망 + 세션 + CSRF + 현재 비밀번호 검증 후에만 실행됨. `SECRET_KEY` 변경은 hot-reload 범위 외(`SessionMiddleware` 재시작 필요). `SESSION_HTTPS_ONLY` 변경은 `app.state.config`에만 반영되고 실행 중인 `SessionMiddleware`의 Secure 쿠키 플래그는 재시작 전까지 적용되지 않음 — HTTPS 비활성화가 즉시 반영되지 않아 보안 수준이 유지됨.

### Information Disclosure
- 위협: 비밀 설정 노출
- 통제: `SECRET_KEY`, 비밀번호 해시 비노출, WMTS 키만 예외 공개
- 위협: 과도하게 넓은 CSP 완화로 공개 페이지 스크립트 실행 범위 확대
- 통제: `/siyu` MapLibre worker 동작에 필요한 `worker-src 'self' blob:`만 최소 허용하고, `script-src`·`img-src` 허용 범위는 별도 확대하지 않음
- 통제: `/siyu` PMTiles URL(`CADASTRAL_PMTILES_URL`)은 공개 클라이언트가 직접 접근 가능한 정적 자원만 가리키도록 유지하고, 내부 전용 저장소/비밀 토큰 URL을 사용하지 않음
- 위협: 웹 방문 로그 확장 필드(Referrer/UTM/클라이언트 컨텍스트) 과수집/2차 유출
- 통제: 길이 제한·선택 필드 중심 수집·운영 로그 반출 통제, `referrerUrl` 원문 미저장(서버에서 domain/path만 파생 저장, query/fragment 제거)
- 위협: `/file2map` 로컬 업로드 데이터가 브라우저 저장소에 잔존
- 통제: 업로드 초기화 버튼 제공, 민감 데이터 업로드 금지 운영 가이드
- 위협: `/photo2map` 우하단 미리보기 패널/이미지 뷰어와 우상단 토지 상세 패널에 업로드 정보가 표시되어 공용 단말에서 노출될 수 있음
- 통제: 공용 단말 사용 지양, 작업 후 마커 초기화 및 브라우저 세션 종료 운영 가이드
- 통제: Strict-Transport-Security(max-age=31536000; includeSubDomains), Referrer-Policy(strict-origin-when-cross-origin), Permissions-Policy(geolocation/microphone/camera/payment/usb 차단)로 전송 계층 보호 및 브라우저 기능 노출 최소화

### Denial of Service
- 위협: 대용량 요청/이벤트 남용
- 통제: 업로드 제한 + 이벤트 레이트리밋(인메모리)
- 위협: `/api/file2map/upload/parse` 대용량 파일 반복 업로드 남용
- 통제: 파일 확장자 검증 + 서버 파싱 예외 처리 + 클라이언트 로컬 폴백
- 위협: 대량 PNU 하이라이트 조회 남용
- 통제: `/api/cadastral/highlights` 입력 PNU 개수 상한(최대 10,000) + bbox 형식/범위 검증 + SQLite `parcel_render_item` 조회 + 서버 응답 캐시(TTL) + 클라이언트 폴백
- 위협: 관리자 FGB 초대형 파일 업로드로 디스크/처리 시간 소모
- 통제: 확장자/콘텐츠타입/파일크기 상한(1GB)/파서 검증 후 교체, 실패 시 기존 운영 파일 유지

### Elevation of Privilege
- 위협: 관리자 경로 우회 접근
- 통제: 내부망 + 세션 + CSRF
- 위협: 교차 사이트 로그아웃 요청(CSRF)
- 통제: `/logout`를 내부망 제한 + POST + CSRF 검증으로 운영

## 잔여 위험
- 인메모리 레이트리밋은 멀티 인스턴스에서 일관성 한계
- FGB 파일 또는 `parcel_render_item` 재생성 실수 시 지도 장애 가능
- 원시 로그 CSV 반출 후 2차 유출 위험
- 공용 단말 브라우저에서 `/file2map` 로컬 업로드 데이터 잔존 가능
- 공용 단말 브라우저에서 `/photo2map` 로컬 사진 열람 흔적(세션/캐시) 잔존 가능
