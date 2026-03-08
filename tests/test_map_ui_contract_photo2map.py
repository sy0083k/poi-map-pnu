from pathlib import Path


def test_photo2map_contract_for_local_exif_markers() -> None:
    map_ts = Path("frontend/src/map.ts").read_text(encoding="utf-8")
    photo_mode_ts = Path("frontend/src/map/photo-mode.ts").read_text(encoding="utf-8")
    photo_overlay_ts = Path("frontend/src/map/persisted-photo-overlay.ts").read_text(encoding="utf-8")
    photo_lightbox_ts = Path("frontend/src/map/photo-lightbox.ts").read_text(encoding="utf-8")
    photo_persistence_ts = Path("frontend/src/map/photo-persistence.ts").read_text(encoding="utf-8")
    panel_overlap_guard_ts = Path("frontend/src/map/panel-overlap-guard.ts").read_text(encoding="utf-8")
    exif_parser_ts = Path("frontend/src/photo/exif-gps.ts").read_text(encoding="utf-8")
    local_upload_ts = Path("frontend/src/map/local-upload.ts").read_text(encoding="utf-8")
    cadastral_layer_ts = Path("frontend/src/map/cadastral-fgb-layer.ts").read_text(encoding="utf-8")
    main_py = Path("app/main.py").read_text(encoding="utf-8")
    css_text = Path("static/css/style.css").read_text(encoding="utf-8")
    index_template = Path("templates/index.html").read_text(encoding="utf-8")
    assert "bootstrapPhotoMode" in map_ts
    assert "bootstrapPersistedPhotoOverlay" in map_ts
    assert "data-map-mode" in index_template
    assert "parseJpegExifGps" in photo_mode_ts
    assert "selectPhoto" in photo_mode_ts
    assert "savePersistedPhotoMarkers" in photo_mode_ts
    assert "loadPersistedPhotoMarkers" in photo_mode_ts
    assert "clearPersistedPhotoMarkers" in photo_mode_ts
    assert "createPhotoLightbox" in photo_mode_ts
    assert 'id="photo-folder-input"' not in photo_mode_ts
    assert "webkitdirectory" in index_template
    assert "URL.createObjectURL(selected.file)" in photo_mode_ts
    assert "currentIndex < 0" in photo_mode_ts
    assert "selectPhoto(0, { shouldMoveMap: true, source: \"nav\" });" in photo_mode_ts
    assert 'button.className = "photo-list-btn list-item";' in photo_mode_ts
    assert 'button.classList.add("selected");' in photo_mode_ts
    assert "openSelectedPhotoInLightbox" in photo_mode_ts
    assert "createPanelOverlapGuard" in photo_mode_ts
    assert "createPhotoLightboxZoomController" not in photo_mode_ts
    assert "overlapGuard.open()" in photo_mode_ts
    assert "overlapGuard.close()" in photo_mode_ts
    assert "loadPersistedPhotoMarkers" in photo_overlay_ts
    assert "photo_marker_id" in photo_overlay_ts
    assert "createPanelOverlapGuard" in photo_overlay_ts
    assert "createPhotoLightboxZoomController" not in photo_overlay_ts
    assert "createPhotoLightbox" in photo_overlay_ts
    assert "overlapGuard.open()" in photo_overlay_ts
    assert "overlapGuard.close()" in photo_overlay_ts
    assert "import Viewer from \"viewerjs\";" in photo_lightbox_ts
    assert "viewerjs/dist/viewer.css" in photo_lightbox_ts
    assert "viewer.view(startIndex);" in photo_lightbox_ts
    assert "fullscreen: true" not in photo_lightbox_ts
    assert "rotatable: true" in photo_lightbox_ts
    assert "flipHorizontal: 1" in photo_lightbox_ts
    assert "flipVertical: 1" in photo_lightbox_ts
    assert "rotateLeft: 1" in photo_lightbox_ts
    assert "rotateRight: 1" in photo_lightbox_ts
    assert "fullscreen: 1" not in photo_lightbox_ts
    prev_idx = photo_lightbox_ts.index("prev: 1")
    play_idx = photo_lightbox_ts.index("play: 1")
    next_idx = photo_lightbox_ts.index("next: 1")
    assert prev_idx < play_idx < next_idx
    assert not Path("frontend/src/map/photo-lightbox-zoom.ts").exists()
    assert "ResizeObserver" in panel_overlap_guard_ts
    assert "--photo-panel-runtime-height" in panel_overlap_guard_ts
    assert "--photo-panel-runtime-bottom-offset" in panel_overlap_guard_ts
    assert 'const STORE_NAME = "photo_markers";' in photo_persistence_ts
    assert "event.key === \"Escape\"" not in photo_mode_ts
    assert "photo_marker_id" in photo_mode_ts
    assert "loadPersistedFile2MapUpload" in photo_mode_ts
    assert "loadUploadedHighlights" in photo_mode_ts
    assert "land-info-panel" in photo_mode_ts
    assert "landInfoContent.scrollTop = 0;" in photo_mode_ts
    assert "photo-prev-btn" in index_template
    assert "photo-next-btn" in index_template
    assert "sidebar-filter-section" in index_template
    assert "sidebar-list-container" in index_template
    assert "sidebar-nav-footer" in index_template
    assert "photo-info-panel" in index_template
    assert "photo-lightbox" not in index_template
    assert "land-info-panel" in index_template
    assert "land-info-content" in index_template
    assert "aria-haspopup=\"dialog\"" not in index_template
    assert "bottom: 20px;" in css_text
    assert "--land-panel-max-safe: calc(" in css_text
    assert "--photo-panel-runtime-height: var(--photo-panel-safe-height);" in css_text
    assert "--photo-panel-runtime-bottom-offset: var(--photo-panel-bottom-offset);" in css_text
    assert "body.photo2map-mode #land-info-panel" in css_text
    assert "body.photo-panel-open #land-info-panel" in css_text
    assert "var(--photo-panel-runtime-height)" in css_text
    assert "var(--photo-panel-runtime-bottom-offset)" in css_text
    assert "max-height: clamp(220px, var(--land-panel-max-safe), 560px);" in css_text
    assert "--photo-panel-bottom-offset: calc(50vh + 12px);" in css_text
    assert ".photo-list-item {" in css_text
    assert "border-bottom: 1px solid #eee;" in css_text
    assert ".photo-lightbox {" not in css_text
    assert "img-src 'self' data: blob:" in main_py
    assert "loadPersistedFile2MapUpload" in local_upload_ts
    assert "loadUploadedHighlights" in cadastral_layer_ts
    assert "TAG_GPS_LAT" in exif_parser_ts
    assert "TAG_GPS_LON" in exif_parser_ts
    assert not Path("templates/photo2map.html").exists()
    assert not Path("frontend/src/photo-map.ts").exists()
    vite_config_ts = Path("frontend/vite.config.ts").read_text(encoding="utf-8")
    assert "photoMap:" not in vite_config_ts
    assert "src/photo-map.ts" not in vite_config_ts
