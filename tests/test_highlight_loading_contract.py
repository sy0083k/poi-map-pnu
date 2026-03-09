from pathlib import Path


def test_land_workflow_uploaded_highlights_are_not_bbox_limited() -> None:
    text = Path("frontend/src/map/land-workflow-highlight.ts").read_text(encoding="utf-8")
    assert "const loaded = await loadUploadedHighlights({" in text
    assert "theme: deps.getCurrentTheme()," in text
    assert "bbox," not in text
    assert "bboxCrs:" not in text


def test_photo_mode_uploaded_land_highlights_are_not_bbox_limited() -> None:
    text = Path("frontend/src/map/photo-mode-land.ts").read_text(encoding="utf-8")
    assert "const loaded = await loadUploadedHighlights({" in text
    assert 'theme: "national_public",' in text
    assert "calculateExtent(" not in text
    assert "bbox:" not in text
    assert "bboxCrs:" not in text
