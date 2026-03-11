from __future__ import annotations

import argparse
import json
from collections.abc import Iterable
from pathlib import Path
from typing import Any

from app.db.connection import db_connection
from app.repositories import parcel_render_repository
from app.services import cadastral_fgb_service, cadastral_highlight_service
from app.services.cadastral_highlight_cache import build_file_etag
from app.services.cadastral_highlight_geometry import collect_points, geometry_bounds

MID_SIMPLIFY_STEP = 2
LOW_SIMPLIFY_STEP = 4
SUPPORTED_CRS = {"EPSG:3857", "EPSG:4326"}


def ensure_render_items_current(
    *,
    base_dir: str,
    configured_path: str,
    pnu_field: str,
    cadastral_crs: str,
) -> bool:
    file_path = cadastral_fgb_service.resolve_fgb_path_for_health(
        base_dir=base_dir,
        configured_path=configured_path,
    )
    if not file_path.exists() or not file_path.is_file():
        return False

    current_etag = build_file_etag(file_path)
    with db_connection(row_factory=True) as conn:
        parcel_render_repository.init_schema(conn)
        row_count = parcel_render_repository.count_rows(conn)
        stored_etag = parcel_render_repository.fetch_source_etag(conn)
        conn.commit()

    if row_count > 0 and stored_etag == current_etag:
        return False

    rebuild_render_items(
        base_dir=base_dir,
        configured_path=configured_path,
        pnu_field=pnu_field,
        cadastral_crs=cadastral_crs,
    )
    return True


def rebuild_render_items(
    *,
    base_dir: str,
    configured_path: str,
    pnu_field: str,
    cadastral_crs: str,
) -> int:
    file_path = cadastral_fgb_service.resolve_fgb_path_for_health(
        base_dir=base_dir,
        configured_path=configured_path,
    )
    return rebuild_render_items_for_path(
        file_path=file_path,
        source_path=configured_path,
        pnu_field=pnu_field,
        cadastral_crs=cadastral_crs,
    )


def rebuild_render_items_for_path(
    *,
    file_path: Path,
    source_path: str,
    pnu_field: str,
    cadastral_crs: str,
) -> int:
    if cadastral_crs not in SUPPORTED_CRS:
        raise ValueError(f"Unsupported cadastral CRS: {cadastral_crs}")
    if not file_path.exists() or not file_path.is_file():
        raise FileNotFoundError(f"FGB file not found: {file_path}")

    rows = list(
        _build_render_rows(
            file_path=file_path,
            source_path=source_path,
            pnu_field=pnu_field,
            cadastral_crs=cadastral_crs,
        )
    )
    with db_connection() as conn:
        parcel_render_repository.init_schema(conn)
        parcel_render_repository.prepare_staging_table(conn)
        parcel_render_repository.bulk_insert_staging(conn, rows)
        parcel_render_repository.swap_staging_table(conn)
        conn.commit()
    return len(rows)


def _build_render_rows(
    *,
    file_path: Path,
    source_path: str,
    pnu_field: str,
    cadastral_crs: str,
) -> Iterable[dict[str, Any]]:
    fgb_etag = build_file_etag(file_path)
    for feature in cadastral_highlight_service.load_features_from_fgb(file_path):
        if not isinstance(feature, dict):
            continue
        geometry = feature.get("geometry")
        properties = feature.get("properties", {})
        pnu = cadastral_highlight_service.normalize_pnu(
            cadastral_highlight_service.extract_pnu_from_properties(properties, pnu_field)
        )
        if len(pnu) != 19 or not isinstance(geometry, dict):
            continue
        bounds = geometry_bounds(geometry)
        if bounds is None:
            continue
        center = _compute_center(bounds)
        full_geometry = _normalize_geometry(geometry, source_crs=cadastral_crs)
        if full_geometry is None:
            continue
        mid_geometry = _simplify_geometry(full_geometry, MID_SIMPLIFY_STEP) or full_geometry
        low_geometry = _simplify_geometry(full_geometry, LOW_SIMPLIFY_STEP) or mid_geometry
        yield {
            "pnu": pnu,
            "bbox_minx": bounds[0],
            "bbox_miny": bounds[1],
            "bbox_maxx": bounds[2],
            "bbox_maxy": bounds[3],
            "center_x": center[0],
            "center_y": center[1],
            "area_m2": _estimate_area(bounds),
            "vertex_count": _count_vertices(full_geometry),
            "geom_geojson_full": json.dumps(full_geometry, ensure_ascii=False, separators=(",", ":")),
            "geom_geojson_mid": json.dumps(mid_geometry, ensure_ascii=False, separators=(",", ":")),
            "geom_geojson_low": json.dumps(low_geometry, ensure_ascii=False, separators=(",", ":")),
            "label_x": center[0],
            "label_y": center[1],
            "source_fgb_etag": fgb_etag,
            "source_fgb_path": source_path,
            "source_crs": cadastral_crs,
        }


def _normalize_geometry(geometry: dict[str, Any], *, source_crs: str) -> dict[str, Any] | None:
    if source_crs == "EPSG:4326":
        return geometry
    if source_crs != "EPSG:3857":
        return None
    return geometry


def _compute_center(bounds: tuple[float, float, float, float]) -> tuple[float, float]:
    min_x, min_y, max_x, max_y = bounds
    return ((min_x + max_x) / 2, (min_y + max_y) / 2)


def _estimate_area(bounds: tuple[float, float, float, float]) -> float:
    min_x, min_y, max_x, max_y = bounds
    return max(max_x - min_x, 0.0) * max(max_y - min_y, 0.0)


def _count_vertices(geometry: dict[str, Any]) -> int:
    points: list[tuple[float, float]] = []
    collect_points(geometry.get("coordinates"), points)
    return len(points)


def _simplify_geometry(geometry: dict[str, Any], step: int) -> dict[str, Any] | None:
    geometry_type = geometry.get("type")
    if not isinstance(geometry_type, str):
        return None
    if geometry_type == "GeometryCollection":
        geometries = geometry.get("geometries")
        if not isinstance(geometries, list):
            return None
        simplified = [_simplify_geometry(item, step) for item in geometries]
        if any(item is None for item in simplified):
            return None
        return {"type": geometry_type, "geometries": simplified}
    coordinates = _simplify_coordinates(geometry.get("coordinates"), step)
    if coordinates is None:
        return None
    return {"type": geometry_type, "coordinates": coordinates}


def _simplify_coordinates(node: Any, step: int) -> Any:
    if isinstance(node, (list, tuple)):
        if len(node) >= 2 and isinstance(node[0], (int, float)) and isinstance(node[1], (int, float)):
            return [float(node[0]), float(node[1]), *node[2:]]

        children = [_simplify_coordinates(item, step) for item in node]
        if any(item is None for item in children):
            return None
        if children and _is_point_list(children):
            return _decimate_point_list(children, step)
        return children
    return None


def _is_point_list(items: list[Any]) -> bool:
    return all(
        isinstance(item, list)
        and len(item) >= 2
        and isinstance(item[0], (int, float))
        and isinstance(item[1], (int, float))
        for item in items
    )


def _decimate_point_list(points: list[Any], step: int) -> list[Any]:
    if len(points) <= 4 or step <= 1:
        return points
    reduced = [points[0], *points[1:-1:step], points[-1]]
    if points[0] == points[-1] and reduced[0] != reduced[-1]:
        reduced[-1] = reduced[0]
    return reduced


def cli(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Rebuild parcel_render_item from FlatGeobuf")
    parser.add_argument("--base-dir", default=None)
    parser.add_argument("--fgb-path", default=None)
    parser.add_argument("--pnu-field", default=None)
    parser.add_argument("--cadastral-crs", default=None)
    args = parser.parse_args(argv)

    from app.core import get_settings

    settings = get_settings()
    base_dir = args.base_dir or settings.base_dir
    configured_path = args.fgb_path or settings.cadastral_fgb_path
    pnu_field = args.pnu_field or settings.cadastral_fgb_pnu_field
    cadastral_crs = (args.cadastral_crs or settings.cadastral_fgb_crs).strip().upper()
    count = rebuild_render_items(
        base_dir=base_dir,
        configured_path=configured_path,
        pnu_field=pnu_field,
        cadastral_crs=cadastral_crs,
    )
    print(f"rebuilt parcel_render_item rows: {count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(cli())
