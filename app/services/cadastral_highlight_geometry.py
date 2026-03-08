from __future__ import annotations

from typing import Any


def extract_pnu_from_properties(properties: Any, pnu_field: str) -> Any:
    if not isinstance(properties, dict):
        return ""
    return (
        properties.get(pnu_field)
        or properties.get(pnu_field.lower())
        or properties.get(pnu_field.upper())
        or properties.get("JIBUN")
        or properties.get("jibun")
        or ""
    )


def geometry_intersects_bbox(geometry: Any, bbox: tuple[float, float, float, float]) -> bool:
    bounds = geometry_bounds(geometry)
    if bounds is None:
        return False
    g_min_x, g_min_y, g_max_x, g_max_y = bounds
    b_min_x, b_min_y, b_max_x, b_max_y = bbox
    return not (g_max_x < b_min_x or g_min_x > b_max_x or g_max_y < b_min_y or g_min_y > b_max_y)


def geometry_bounds(geometry: Any) -> tuple[float, float, float, float] | None:
    if not isinstance(geometry, dict):
        return None
    coordinates = geometry.get("coordinates")
    if coordinates is None:
        return None
    points: list[tuple[float, float]] = []
    collect_points(coordinates, points)
    if not points:
        return None
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    return (min(xs), min(ys), max(xs), max(ys))


def collect_points(node: Any, bucket: list[tuple[float, float]]) -> None:
    if isinstance(node, (list, tuple)):
        if len(node) >= 2 and isinstance(node[0], (int, float)) and isinstance(node[1], (int, float)):
            bucket.append((float(node[0]), float(node[1])))
            return
        for item in node:
            collect_points(item, bucket)
