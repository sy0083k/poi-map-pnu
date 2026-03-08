from __future__ import annotations

from typing import Any, Literal

import pandas as pd
from fastapi import HTTPException, UploadFile

REQUIRED_COLUMNS = ("고유번호", "소재지", "지목", "실면적", "재산관리관")


def parse_file2map_upload(file: UploadFile) -> dict[str, Any]:
    filename = (file.filename or "").strip()
    lowered = filename.lower()
    if not lowered.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.")

    df = _read_first_sheet(file=file, lowered_filename=lowered)
    items = _parse_rows_to_items(df)
    return {
        "success": True,
        "items": items,
        "summary": {
            "fileName": filename or "upload.xlsx",
            "rowCount": len(items),
            "uniquePnuCount": len({item["pnu"] for item in items}),
        },
    }


def _read_first_sheet(*, file: UploadFile, lowered_filename: str) -> pd.DataFrame:
    excel_engine: Literal["xlrd", "openpyxl"] = "xlrd" if lowered_filename.endswith(".xls") else "openpyxl"
    try:
        excel_book = pd.ExcelFile(file.file, engine=excel_engine)
        if not excel_book.sheet_names:
            raise HTTPException(status_code=400, detail="엑셀 시트를 찾을 수 없습니다.")
        first_sheet_name = excel_book.sheet_names[0]
        return pd.read_excel(excel_book, sheet_name=first_sheet_name)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"엑셀 파일을 읽을 수 없습니다: {exc}") from exc


def _parse_rows_to_items(df: pd.DataFrame) -> list[dict[str, Any]]:
    rows = df.to_dict(orient="records")
    if not rows:
        return []

    headers = _collect_headers(df)
    _ensure_required_columns(headers)

    items: list[dict[str, Any]] = []
    for index, raw_row in enumerate(rows):
        items.append(_parse_row_to_item(raw_row=raw_row, index=index, headers=headers))
    return items


def _build_source_fields(row: dict[str, Any], headers: list[str]) -> list[dict[str, str]]:
    fields: list[dict[str, str]] = []
    for header in headers:
        fields.append({"key": header, "label": header, "value": _to_text(row.get(header))})
    return fields


def _normalize_pnu(raw: Any) -> str:
    return "".join(ch for ch in str(raw or "") if ch.isdigit())


def _to_text(raw: Any) -> str:
    if raw is None:
        return ""
    return str(raw).strip()


def _parse_area(raw: Any) -> float | None:
    text = _to_text(raw)
    if text == "":
        return None
    try:
        value = float(text)
    except (TypeError, ValueError):
        return None
    if not pd.notna(value):
        return None
    return value


def _collect_headers(df: pd.DataFrame) -> list[str]:
    return [str(header).strip() for header in df.columns if str(header).strip()]


def _ensure_required_columns(headers: list[str]) -> None:
    missing = [column for column in REQUIRED_COLUMNS if column not in headers]
    if missing:
        raise HTTPException(status_code=400, detail=f"필수 컬럼 누락: {', '.join(missing)}")


def _parse_row_to_item(*, raw_row: dict[Any, Any], index: int, headers: list[str]) -> dict[str, Any]:
    row = {str(key): value for key, value in raw_row.items()}
    row_number = index + 2

    pnu = _parse_row_pnu(row=row, row_number=row_number)
    address = _parse_row_address(row=row, row_number=row_number)
    area = _parse_row_area(row=row, row_number=row_number)
    return {
        "id": index + 1,
        "pnu": pnu,
        "address": address,
        "land_type": _to_text(row.get("지목")),
        "area": area,
        "property_manager": _to_text(row.get("재산관리관")),
        "sourceFields": _build_source_fields(row, headers),
    }


def _parse_row_pnu(*, row: dict[str, Any], row_number: int) -> str:
    pnu = _normalize_pnu(row.get("고유번호"))
    if not pnu or len(pnu) != 19:
        raise HTTPException(status_code=400, detail=f"{row_number}행 고유번호(PNU)가 올바르지 않습니다.")
    return pnu


def _parse_row_address(*, row: dict[str, Any], row_number: int) -> str:
    address = _to_text(row.get("소재지"))
    if not address:
        raise HTTPException(status_code=400, detail=f"{row_number}행 소재지가 비어 있습니다.")
    return address


def _parse_row_area(*, row: dict[str, Any], row_number: int) -> float:
    area = _parse_area(row.get("실면적"))
    if area is None:
        raise HTTPException(status_code=400, detail=f"{row_number}행 실면적이 숫자가 아닙니다.")
    return area
