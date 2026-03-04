import pandas as pd

from app.validators import land_validators


def test_validate_required_columns_missing() -> None:
    df = pd.DataFrame({"소재지": ["x"]})
    missing = land_validators.validate_required_columns(df)
    assert "고유번호" in missing
    assert "지목" in missing
    assert "실면적" in missing


def test_normalize_upload_rows_reports_errors() -> None:
    df = pd.DataFrame(
        {
            "고유번호": ["1111012345678901234", "1111012345678901235"],
            "소재지": ["", "addr"],
            "지목": ["답", "전"],
            "실면적": ["not-a-number", 12.5],
            "재산관리관": ["홍길동", "이몽룡"],
        }
    )
    normalized, errors, total_errors = land_validators.normalize_upload_rows(df)
    assert total_errors == 1
    assert len(normalized) == 1
    assert len(errors) == 1
    assert normalized[0]["source_fields"][0]["label"] == "고유번호"


def test_normalize_upload_rows_keeps_dynamic_columns() -> None:
    df = pd.DataFrame(
        {
            "고유번호": ["1111012345678901234"],
            "소재지": ["addr"],
            "지목": ["답"],
            "실면적": [12.5],
            "재산관리관": ["홍길동"],
            "비고": ["테스트"],
        }
    )
    normalized, errors, total_errors = land_validators.normalize_upload_rows(df)
    assert total_errors == 0
    assert errors == []
    assert len(normalized) == 1
    source_fields = normalized[0]["source_fields"]
    assert len(source_fields) == 6
    assert source_fields[-1] == {"key": "비고", "label": "비고", "value": "테스트"}
