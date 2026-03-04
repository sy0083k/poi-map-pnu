# 문서 포털 (Documentation Hub)

프로젝트: 관심 필지 지도 (POI Map Geo)  
작성일: 2026-02-22  
최종 수정일: 2026-03-04

## 빠른 시작 경로
1. 왜 만드는가: [`goals.md`](goals.md)
2. 어떻게 동작하는가: [`architecture.md`](architecture.md)
3. 어떤 기준으로 구현하는가: [`engineering-guidelines.md`](engineering-guidelines.md)
4. 어떻게 운영하는가: [`maintenance.md`](maintenance.md)
5. 어떤 보안 위협을 관리하는가: [`stride-lite.md`](stride-lite.md)
6. 어떤 리스크를 우선 개선하는가: [`TODO.MD`](TODO.MD)

## 현행 기준 요약
- 지도 데이터 소스: FlatGeobuf 파일(`data/LSMD_CONT_LDREG_44210_202512.fgb`)
- 좌표계 기준: `CADASTRAL_FGB_CRS` (`EPSG:3857` 기본)
- 공개 지도 API: `/api/cadastral/fgb` (`/api/v1/cadastral/fgb` alias)
- 지도 표시 정책: 업로드 하이라이트 대상 필지만 렌더링(비하이라이트 배경 필지 미표시)
- 상세 정보 UI: 선택 필지 정보를 우상단 패널의 2열(속성/값) 동적 필드(`sourceFields`)로 동일 라인 정렬해 표시하며, `X` 버튼으로 닫기 지원
- 선택 강조 UI: 현재 선택된 필지는 노란색 경계선으로 표시
- 베이스맵: VWorld WMTS (`VWORLD_WMTS_KEY`), 기본 배경은 위성 지도(사용자 전환 버튼 미노출)
- 관리자 통계: `totalLands` + 이벤트 통계(경계선 실패 재조회 기능 제거)

## 기능 변경 시 동시 갱신 대상
- 구조/흐름 변경: `docs/architecture.md`
- 운영/절차 변경: `docs/maintenance.md`
- 보안 통제 변경: `docs/stride-lite.md`
- 사용자/운영 요약: `README.MD`
- 리스크/개선 항목 영향: `docs/TODO.MD`

## Archive / 참고 문서
- `refactoring-strategy.md`: 아카이브 문서(현행 운영 기준 아님)
- `reports/*`: 단계별 점검 보고서 보관용 문서(현행 운영 기준 아님)
