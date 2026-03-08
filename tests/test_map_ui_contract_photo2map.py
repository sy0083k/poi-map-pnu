from pathlib import Path

from tests.helpers import assert_contains_all, assert_not_contains_all


def test_photo2map_entry_contract() -> None:
    map_ts = Path("frontend/src/map.ts").read_text(encoding="utf-8")
    init_ts = Path("frontend/src/map/land-map-init.ts").read_text(encoding="utf-8")
    index_template = Path("templates/index.html").read_text(encoding="utf-8")

    assert "bootstrapPhotoMode" in map_ts
    assert "bootstrapPersistedPhotoOverlay" in init_ts
    assert "await bootstrapPersistedPhotoOverlay({" in init_ts
    assert_contains_all(
        index_template,
        [
            "data-map-mode",
            "webkitdirectory",
            "photo-prev-btn",
            "photo-next-btn",
            "sidebar-filter-section",
            "sidebar-list-container",
            "sidebar-nav-footer",
            "photo-info-panel",
            "land-info-panel",
            "land-info-content",
        ],
    )
    assert_not_contains_all(index_template, ["photo-lightbox", 'aria-haspopup="dialog"'])


def test_photo_mode_module_contract() -> None:
    photo_mode_ts = Path("frontend/src/map/photo-mode.ts").read_text(encoding="utf-8")
    photo_mode_import_ts = Path("frontend/src/map/photo-mode-import.ts").read_text(encoding="utf-8")
    photo_mode_photos_ts = Path("frontend/src/map/photo-mode-photos.ts").read_text(encoding="utf-8")
    photo_mode_land_ts = Path("frontend/src/map/photo-mode-land.ts").read_text(encoding="utf-8")
    photo_mode_contract_text = "\n".join(
        [photo_mode_ts, photo_mode_import_ts, photo_mode_photos_ts, photo_mode_land_ts]
    )
    assert_contains_all(
        photo_mode_contract_text,
        [
            "parseJpegExifGps",
            "selectPhoto",
            "savePersistedPhotoMarkers",
            "loadPersistedPhotoMarkers",
            "clearPersistedPhotoMarkers",
            "createPhotoLightbox",
            "URL.createObjectURL(selected.file)",
            "currentIndex < 0",
            'selectPhoto(0, { shouldMoveMap: true, source: "nav" });',
            'button.className = "photo-list-btn list-item";',
            'button.classList.add("is-active", "selected");',
            "openSelectedPhotoInLightbox",
            "createPanelOverlapGuard",
            "overlapGuard.open()",
            "overlapGuard.close()",
            "photo_marker_id",
            "loadPersistedFile2MapUpload",
            "loadUploadedHighlights",
            "land-info-panel",
            "content.scrollTop = 0;",
        ],
    )
    assert_not_contains_all(photo_mode_ts, ['id="photo-folder-input"', "createPhotoLightboxZoomController", 'event.key === "Escape"'])


def test_photo_overlay_and_lightbox_contract() -> None:
    photo_overlay_ts = Path("frontend/src/map/persisted-photo-overlay.ts").read_text(encoding="utf-8")
    photo_lightbox_ts = Path("frontend/src/map/photo-lightbox.ts").read_text(encoding="utf-8")
    panel_overlap_guard_ts = Path("frontend/src/map/panel-overlap-guard.ts").read_text(encoding="utf-8")
    photo_persistence_ts = Path("frontend/src/map/photo-persistence.ts").read_text(encoding="utf-8")

    assert_contains_all(
        photo_overlay_ts,
        [
            "loadPersistedPhotoMarkers",
            "photo_marker_id",
            "createPanelOverlapGuard",
            "createPhotoLightbox",
            "overlapGuard.open()",
            "overlapGuard.close()",
        ],
    )
    assert "createPhotoLightboxZoomController" not in photo_overlay_ts

    assert_contains_all(
        photo_lightbox_ts,
        [
            'import Viewer from "viewerjs";',
            "viewerjs/dist/viewer.css",
            "viewer.view(startIndex);",
            "rotatable: true",
            "flipHorizontal: 1",
            "flipVertical: 1",
            "rotateLeft: 1",
            "rotateRight: 1",
            "prev: 1",
            "play: 1",
            "next: 1",
        ],
    )
    assert_not_contains_all(photo_lightbox_ts, ["fullscreen: true", "fullscreen: 1"])
    assert photo_lightbox_ts.index("prev: 1") < photo_lightbox_ts.index("play: 1") < photo_lightbox_ts.index("next: 1")

    assert_contains_all(
        panel_overlap_guard_ts,
        [
            "ResizeObserver",
            "--photo-panel-runtime-height",
            "--photo-panel-runtime-bottom-offset",
        ],
    )
    assert 'const STORE_NAME = "photo_markers";' in photo_persistence_ts


def test_photo_css_and_security_contract() -> None:
    css_text = Path("static/css/style.css").read_text(encoding="utf-8")
    main_py = Path("app/main.py").read_text(encoding="utf-8")
    assert_contains_all(
        css_text,
        [
            "bottom: 20px;",
            "--land-panel-max-safe: calc(",
            "--photo-panel-runtime-height: var(--photo-panel-safe-height);",
            "--photo-panel-runtime-bottom-offset: var(--photo-panel-bottom-offset);",
            "body.photo2map-mode #land-info-panel",
            "body.photo-panel-open #land-info-panel",
            "var(--photo-panel-runtime-height)",
            "var(--photo-panel-runtime-bottom-offset)",
            "max-height: clamp(220px, var(--land-panel-max-safe), 560px);",
            "--photo-panel-bottom-offset: calc(50vh + 12px);",
            ".photo-list-item {",
            "border-bottom: 1px solid #eee;",
        ],
    )
    assert ".photo-lightbox {" not in css_text
    assert "img-src 'self' data: blob:" in main_py


def test_photo_legacy_cleanup_contract() -> None:
    local_upload_ts = Path("frontend/src/map/local-upload.ts").read_text(encoding="utf-8")
    cadastral_layer_ts = Path("frontend/src/map/cadastral-fgb-layer.ts").read_text(encoding="utf-8")
    exif_parser_ts = Path("frontend/src/photo/exif-gps.ts").read_text(encoding="utf-8")
    vite_config_ts = Path("frontend/vite.config.ts").read_text(encoding="utf-8")

    assert "loadPersistedFile2MapUpload" in local_upload_ts
    assert "loadUploadedHighlights" in cadastral_layer_ts
    assert_contains_all(exif_parser_ts, ["TAG_GPS_LAT", "TAG_GPS_LON"])
    assert not Path("templates/photo2map.html").exists()
    assert not Path("frontend/src/photo-map.ts").exists()
    assert_not_contains_all(vite_config_ts, ["photoMap:", "src/photo-map.ts"])
    assert not Path("frontend/src/map/photo-lightbox-zoom.ts").exists()
