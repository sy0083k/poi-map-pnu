from __future__ import annotations

import math
from typing import Any

WEB_MERCATOR_HALF_WORLD = 20037508.34


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


def mercator_to_wgs84(x: float, y: float) -> tuple[float, float]:
    lon = (x / WEB_MERCATOR_HALF_WORLD) * 180
    lat = math.degrees(math.atan(math.sinh((y / WEB_MERCATOR_HALF_WORLD) * math.pi)))
    return (lon, lat)


def wgs84_to_mercator(lon: float, lat: float) -> tuple[float, float]:
    bounded_lat = max(min(lat, 89.999999), -89.999999)
    x = (lon * WEB_MERCATOR_HALF_WORLD) / 180
    y = WEB_MERCATOR_HALF_WORLD * math.log(math.tan((math.pi / 4) + math.radians(bounded_lat) / 2)) / math.pi
    return (x, y)


def transform_bbox_to_crs(
    bbox: tuple[float, float, float, float],
    *,
    source_crs: str,
    target_crs: str,
) -> tuple[float, float, float, float]:
    if source_crs == target_crs:
        return bbox
    if source_crs == "EPSG:4326" and target_crs == "EPSG:3857":
        min_x, min_y = wgs84_to_mercator(bbox[0], bbox[1])
        max_x, max_y = wgs84_to_mercator(bbox[2], bbox[3])
        return (min(min_x, max_x), min(min_y, max_y), max(min_x, max_x), max(min_y, max_y))
    if source_crs == "EPSG:3857" and target_crs == "EPSG:4326":
        min_x, min_y = mercator_to_wgs84(bbox[0], bbox[1])
        max_x, max_y = mercator_to_wgs84(bbox[2], bbox[3])
        return (min(min_x, max_x), min(min_y, max_y), max(min_x, max_x), max(min_y, max_y))
    raise ValueError(f"Unsupported CRS transform: {source_crs} -> {target_crs}")


def transform_geometry_to_wgs84(geometry: Any, *, source_crs: str) -> dict[str, Any] | None:
    if not isinstance(geometry, dict):
        return None

    geometry_type = geometry.get("type")
    if not isinstance(geometry_type, str):
        return None

    if source_crs == "EPSG:4326":
        return geometry

    if source_crs != "EPSG:3857":
        return None

    if geometry_type == "GeometryCollection":
        geometries = geometry.get("geometries")
        if not isinstance(geometries, list):
            return None
        transformed = []
        for item in geometries:
            next_geometry = transform_geometry_to_wgs84(item, source_crs=source_crs)
            if next_geometry is None:
                return None
            transformed.append(next_geometry)
        return {"type": geometry_type, "geometries": transformed}

    coordinates = geometry.get("coordinates")
    transformed_coordinates = transform_coordinates_to_wgs84(coordinates)
    if transformed_coordinates is None:
        return None
    return {"type": geometry_type, "coordinates": transformed_coordinates}


def transform_coordinates_to_wgs84(node: Any) -> Any:
    if isinstance(node, (list, tuple)):
        if len(node) >= 2 and isinstance(node[0], (int, float)) and isinstance(node[1], (int, float)):
            lon, lat = mercator_to_wgs84(float(node[0]), float(node[1]))
            return [lon, lat, *node[2:]]
        transformed_children = []
        for item in node:
            transformed = transform_coordinates_to_wgs84(item)
            if transformed is None:
                return None
            transformed_children.append(transformed)
        return transformed_children
    return None
