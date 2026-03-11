from pathlib import Path


def test_land_workflow_uploaded_highlights_support_bbox_and_cap() -> None:
    highlight_text = Path("frontend/src/map/land-workflow-highlight.ts").read_text(encoding="utf-8")
    workflow_text = Path("frontend/src/map/land-workflow.ts").read_text(encoding="utf-8")
    assert "const loadHighlights = async (params?:" in highlight_text
    assert "theme: deps.getCurrentTheme()," in highlight_text
    assert "bbox: params?.bbox," in highlight_text
    assert "bboxCrs: params?.bboxCrs," in highlight_text
    assert "renderItems?: LandListItem[];" in highlight_text
    assert "const sourceItems = options?.renderItems ?? items;" in highlight_text
    assert "options?.maxPnus" in highlight_text
    assert "deps.mapView.setHighlightDebugInfo?.(loaded.debugInfo);" in highlight_text
    assert '하이라이트를 찾지 못해 전체 PNU로 다시 확인하는 중입니다' in highlight_text
    assert "let hasConsumedInitialViewportHighlightCap = false;" in workflow_text
    assert "const shouldCapViewport = options.isViewportContext && !hasConsumedInitialViewportHighlightCap;" in workflow_text
    assert "maxPnus: shouldCapViewport ? MAX_INITIAL_HIGHLIGHTS : undefined" in workflow_text
    assert "hasConsumedInitialViewportHighlightCap = true;" in workflow_text


def test_photo_mode_uploaded_land_highlights_are_not_bbox_limited() -> None:
    text = Path("frontend/src/map/photo-mode-land.ts").read_text(encoding="utf-8")
    assert "const loaded = await loadUploadedHighlights({" in text
    assert 'theme: "national_public",' in text
    assert "calculateExtent(" not in text
    assert "bbox:" not in text
    assert "bboxCrs:" not in text


def test_large_uploaded_highlights_use_chunked_api_before_worker_fallback() -> None:
    text = Path("frontend/src/map/cadastral-fgb-layer.ts").read_text(encoding="utf-8")
    assert "for (let start = 0; start < normalizedPnus.length; start += MAX_API_REQUEST_PNUS)" in text
    assert "const apiLoaded = await loadUploadedHighlightsFromApi({" in text
    assert 'source: "api",' in text
    assert 'source: "worker",' in text


def test_highlight_reload_uses_cached_bbox_and_delta_updates() -> None:
    highlight_text = Path("frontend/src/map/land-workflow-highlight.ts").read_text(encoding="utf-8")
    workflow_text = Path("frontend/src/map/land-workflow.ts").read_text(encoding="utf-8")
    assert "recordsByPnu: Map<string, HighlightGeometryRecord>" in highlight_text
    assert "feature.properties.bbox" in highlight_text
    assert "deps.mapView.applyFeatureDelta" in highlight_text
    assert "stagedByPnu.set(key, value);" in highlight_text
    assert "mergeRecordMaps" not in highlight_text
    assert 'const getRenderProjection = (_deps: HighlightDeps, config: MapConfig): MapConfig["cadastralCrs"] => config.cadastralCrs;' in highlight_text
    assert "append: Boolean(options?.append)," in workflow_text
    assert "preserveSelectedItem: Boolean(options?.fromMoveEnd)," in workflow_text
    assert "selectedItemToPreserve" in workflow_text


def test_maplibre_view_supports_delta_updates_and_geometry_cache() -> None:
    text = Path("frontend/src/map/map-view-maplibre.ts").read_text(encoding="utf-8")
    assert "const normalizedGeometryCache = new WeakMap<object" in text
    assert "const applyFeatureDelta = async (" in text
    assert "measureMapRender(`applyFeatureDelta(${delta.addOrUpdate.size})`" in text
    assert "source.updateData({ add: chunk.map(createFeatureUpdate) });" in text
