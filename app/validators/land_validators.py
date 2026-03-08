from __future__ import annotations

from typing import Any, cast

import pandas as pd

REQUIRED_COLUMNS = [
    "고유번호",
    "소재지",
    "지목",
    "실면적",
    "재산관리관",
]

MAX_ERROR_REPORT = 100

SourceFields = list[dict[str, str]]


def validate_required_columns(df: pd.DataFrame) -> list[str]:
    return [col for col in REQUIRED_COLUMNS if col not in df.columns]


def normalize_upload_rows(
    df: pd.DataFrame,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], int]:
    normalized: list[dict[str, Any]] = []
    errors: list[dict[str, Any]] = []
    total_errors = 0

    for idx, row in df.iterrows():
        row_num = int(cast(Any, idx)) + 1
        pnu = _normalize_pnu(row.get("고유번호"))
        address = _to_str(row.get("소재지"))
        land_type = _to_str(row.get("지목"))
        area_raw = row.get("실면적")
        property_manager = _to_str(row.get("재산관리관"))
        property_usage = _to_str(row.get("재산용도"))

        if not pnu:
            total_errors += 1
            _append_error(errors, row_num, "pnu", "missing", row.get("고유번호"))
            continue
        if len(pnu) != 19 or not pnu.isdigit():
            total_errors += 1
            _append_error(errors, row_num, "pnu", "invalid", row.get("고유번호"))
            continue

        if not address:
            total_errors += 1
            _append_error(errors, row_num, "address", "missing", address)
            continue

        area = _parse_area(area_raw, row_num, errors)
        if area is None:
            total_errors += 1
            continue

        normalized.append(
            {
                "pnu": pnu,
                "address": address,
                "land_type": land_type,
                "area": area,
                "property_manager": property_manager,
                "property_usage": property_usage,
                "source_fields": _build_source_fields(row, df.columns),
            }
        )

    return normalized, errors, total_errors


def _parse_area(value: Any, row_num: int, errors: list[dict[str, Any]]) -> float | None:
    if pd.isna(value):
        _append_error(errors, row_num, "area", "missing", value)
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        _append_error(errors, row_num, "area", "invalid", value)
        return None


def _to_str(value: Any) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def _normalize_pnu(value: Any) -> str:
    raw = _to_str(value)
    if not raw:
        return ""
    return "".join(ch for ch in raw if ch.isdigit())


def _append_error(
    errors: list[dict[str, Any]], row_num: int, field: str, code: str, value: Any
) -> None:
    if len(errors) >= MAX_ERROR_REPORT:
        return
    errors.append(
        {
            "row": row_num,
            "field": field,
            "code": code,
            "value": "" if value is None else str(value),
        }
    )


def _build_source_fields(row: pd.Series, columns: pd.Index) -> SourceFields:
    fields: SourceFields = []
    for column in columns:
        label = str(column).strip()
        if not label:
            continue
        value = row.get(column)
        if value is None or (isinstance(value, float) and pd.isna(value)):
            normalized_value = ""
        else:
            normalized_value = str(value).strip()
        fields.append({"key": label, "label": label, "value": normalized_value})
    return fields
