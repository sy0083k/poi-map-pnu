# NSW Design System Reference

프로젝트: 관심 필지 지도 (POI Map PNU)  
작성일: 2026-04-10  
최종 수정일: 2026-04-10

## 문서 목적과 지위
- 이 문서는 Digital NSW의 NSW Design System을 이 웹앱 제작에 참고하기 위한 UI/UX 참고 자료이다.
- 현행 강제 규칙(Source of Truth)은 `docs/engineering-guidelines.md`이며, 이 문서는 프런트 UI 작업의 보조 기준으로 사용한다.
- NSW Government 브랜드 준수 문서가 아니며, NSW 로고/브랜드 자산/전용 시각 요소를 이 프로젝트에 직접 적용하는 근거로 사용하지 않는다.
- 외부 패키지 도입 여부는 이 문서만으로 결정하지 않고, 라이선스/보안/CSP/빌드 충돌 검토를 별도 변경으로 수행한다.

## 참고한 외부 자료
- NSW Design System 허브: <https://www.digital.nsw.gov.au/delivery/digital-service-toolkit/design-system>
- GitHub 저장소: <https://github.com/digitalnsw/nsw-design-system>
- 온라인 문서: <https://designsystem.nsw.gov.au>
- npm 패키지명: `nsw-design-system`
- 확인 시점 기준 저장소 메타:
  - 최신 패키지 버전: `3.24.6`
  - GitHub 표시 최신 릴리스: `v3.24.6` (2026-04-01)
  - 주요 구현 형태: SCSS, vanilla JavaScript, Handlebars 문서 사이트
  - 런타임 JS 초기화 방식: `window.NSW.initSite()` 또는 패키지 export의 `initSite()`

## 적용 원칙
- 지도 화면은 NSW Design System의 `Maps`, `Search and Filters`, `Data visualisation` 방법론을 참고하되, 현재 `/siyu` MapLibre 및 `/file2map`·`/photo2map` OpenLayers 런타임 분리를 유지한다.
- 검색/필터/결과 목록은 사용자가 입력, 결과 수 확인, 선택, 다운로드까지 끊기지 않도록 `Filters`, `Results bar`, `Pagination`, `Tables`, `Status labels` 패턴을 참고한다.
- 관리자 화면과 업로드 흐름은 `Forms`, `File upload`, `In-page alert`, `Tables` 패턴을 참고해 입력 오류, 진행 상태, 결과 확인을 명확히 한다.
- 상세 정보 패널, 상태바, 토스트는 긴 문자열과 동적 필드에서도 레이아웃이 깨지지 않아야 하며, 닫기/재표시 동작은 키보드와 스크린리더 사용자를 고려한다.
- 접근성 기준은 최소 WCAG 2.2 AA 수준을 목표로 삼고, 색상만으로 상태를 전달하지 않으며, `prefers-reduced-motion` 정책을 유지한다.
- JavaScript가 늦게 로드되거나 실패하는 경우에도 사용자가 핵심 상태와 오류를 이해할 수 있도록 서버/DOM 기본 텍스트와 명시적 오류 메시지를 유지한다.

## 도입 금지와 주의 사항
- NSW 로고, NSW Government 전용 색상 조합, pictogram, 브랜드 compliance 표시를 그대로 복제하지 않는다.
- `nsw-design-system`의 전체 CSS를 무검토 import하지 않는다. 전역 typography, form, button, table 스타일이 `static/css/style.css`와 Vite 산출 CSS를 덮어쓸 수 있다.
- `window.NSW.initSite()`를 지도 페이지에서 전역으로 호출하지 않는다. DOM class hook 기반 초기화가 지도 런타임의 이벤트 리스너, 동적 패널, 모바일 상태 전환과 중복될 수 있다.
- CDN 방식은 기본 채택하지 않는다. CSP, 오프라인/내부망 운영, Google Fonts/Material Icons 호출 정책을 먼저 확인해야 한다.
- React 컴포넌트 라이브러리처럼 취급하지 않는다. 저장소는 SCSS + vanilla JS 컴포넌트와 문서 예제 중심이다.
- 라이선스 표기가 GitHub `LICENSE`의 MIT 문구와 `package.json`의 `license: ISC`로 불일치하므로, 코드/패키지 재사용 전 법무 또는 운영 정책 관점의 확인이 필요하다.

## UI 작업 체크리스트
- 변경 대상 화면이 `지도`, `검색/필터`, `결과 목록`, `업로드`, `상세 패널`, `상태 메시지`, `관리자 폼/테이블` 중 어디에 해당하는지 먼저 분류한다.
- 관련 NSW 패턴을 참고하되, 이 프로젝트의 기존 용어와 DOM 계약(`#app-topbar`, `#sidebar`, `#map-status`, `#land-info-panel`)을 우선한다.
- 네트워크 호출은 `frontend/src/http.ts`를 사용하고, 지도 화면은 `frontend/src/map.ts` 오케스트레이션과 `frontend/src/map/*` 모듈 경계를 유지한다.
- 색상/강조는 기존 필지 하이라이트 의미 체계와 충돌하지 않아야 한다. 선택 강조, 관리관별 색, 오류/성공 상태 색을 혼동시키지 않는다.
- 모바일은 `mobile-home` -> `mobile-search` -> `mobile-results` 흐름을 유지하고, 새 UI가 바텀시트/검색 오버레이 전환을 가리지 않아야 한다.
- 키보드 포커스, 닫기 버튼, 상태 메시지 갱신, 모션 축소 환경을 수동 점검한다.
- UI 변경이 기능/운영 절차/API/보안 정책을 바꾸면 `docs/architecture.md`, `docs/maintenance.md`, `docs/stride-lite.md`, `README.MD` 중 해당 문서를 함께 갱신한다.

## 패키지 도입 검토 절차
직접 도입이 필요해질 때는 별도 이슈/변경으로 다음 순서를 따른다.

1. `nsw-design-system`의 현재 npm 배포 버전, tarball 내용, 라이선스 표기를 확인한다.
2. 필요한 컴포넌트를 하나만 선정해 SCSS/JS import 범위를 최소화한다.
3. `frontend` Vite 빌드에서 번들 크기, CSS 전역 충돌, source map, TypeScript declaration 호환성을 확인한다.
4. CSP(`style-src`, `script-src`, `font-src`, `connect-src`)와 외부 CDN/font 호출 필요성을 검토한다.
5. 지도 페이지에서는 전역 초기화 대신 선택 컴포넌트의 수명주기를 명시적으로 관리한다.
6. `cd frontend && npm run typecheck && npm run build`와 관련 UI 수동 테스트를 통과한 뒤, 필요 시 접근성 자동 점검 도구 도입을 별도 검토한다.

## 우선 참고 후보
- `/siyu`: `Maps`, `Search and Filters`, `Results bar`, `Status labels`, `In-page alert`
- `/file2map`: `File upload`, `Forms`, `Filters`, `Tables`, `In-page alert`
- `/photo2map`: `Maps`, `List items`, `Media`, `Dialog`, `Buttons`
- `/admin`: `Forms`, `Tables`, `Status labels`, `Pagination`, `In-page alert`

## 관련 문서
- 현재 UI에 이 참고 기준을 적용한 개선 후보: `docs/ui-ux-improvement-proposals.md`
