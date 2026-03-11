import sqlite3
from typing import Sequence

from app.repositories.land_repository_schema import TABLE_NAME, init_land_schema
from app.repositories.parcel_render_repository import TABLE_NAME as PARCEL_RENDER_TABLE_NAME


def fetch_lands_page_without_geom_filtered(
    conn: sqlite3.Connection,
    *,
    after_id: int | None,
    limit: int,
    search_term: str,
    min_area: float,
    max_area: float | None,
    property_manager_term: str,
    property_usage_term: str,
    land_type_term: str,
    bbox: tuple[float, float, float, float] | None = None,
    table_name: str = TABLE_NAME,
) -> Sequence[sqlite3.Row]:
    init_land_schema(conn, table_name=table_name)
    clauses, params = _build_filtered_geom_clauses(
        search_term=search_term,
        min_area=min_area,
        max_area=max_area,
        property_manager_term=property_manager_term,
        property_usage_term=property_usage_term,
        land_type_term=land_type_term,
        bbox=bbox,
        table_name=table_name,
        after_id=after_id,
    )

    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"""
        SELECT id, pnu, address, land_type, area, property_manager, source_fields_json
          FROM {table_name}
          {where_clause}
         ORDER BY id
         LIMIT ?
    """
    params.append(limit)
    cursor = conn.cursor()
    cursor.execute(query, tuple(params))
    return cursor.fetchall()


def count_lands_without_geom_filtered(
    conn: sqlite3.Connection,
    *,
    search_term: str,
    min_area: float,
    max_area: float | None,
    property_manager_term: str,
    property_usage_term: str,
    land_type_term: str,
    table_name: str = TABLE_NAME,
) -> int:
    init_land_schema(conn, table_name=table_name)
    clauses, params = _build_filtered_geom_clauses(
        search_term=search_term,
        min_area=min_area,
        max_area=max_area,
        property_manager_term=property_manager_term,
        property_usage_term=property_usage_term,
        land_type_term=land_type_term,
        bbox=None,
        table_name=table_name,
        after_id=None,
    )
    where_clause = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    query = f"""
        SELECT COUNT(*)
          FROM {table_name}
          {where_clause}
    """
    row = conn.execute(query, tuple(params)).fetchone()
    return int(row[0]) if row is not None else 0


def _build_filtered_geom_clauses(
    *,
    search_term: str,
    min_area: float,
    max_area: float | None,
    property_manager_term: str,
    property_usage_term: str,
    land_type_term: str,
    bbox: tuple[float, float, float, float] | None,
    table_name: str,
    after_id: int | None,
) -> tuple[list[str], list[object]]:
    clauses: list[str] = []
    params: list[object] = []

    if after_id is not None:
        clauses.append("id > ?")
        params.append(after_id)
    if search_term:
        clauses.append("instr(COALESCE(address, ''), ?) > 0")
        params.append(search_term)

    clauses.append("COALESCE(area, 0) >= ?")
    params.append(min_area)
    if max_area is not None:
        clauses.append("COALESCE(area, 0) <= ?")
        params.append(max_area)
    if property_manager_term:
        clauses.append("instr(COALESCE(property_manager, ''), ?) > 0")
        params.append(property_manager_term)
    if property_usage_term:
        clauses.append("COALESCE(property_usage, '') = ?")
        params.append(property_usage_term)
    if land_type_term:
        clauses.append("instr(COALESCE(land_type, ''), ?) > 0")
        params.append(land_type_term)
    clauses.append(
        f"""
        EXISTS (
            SELECT 1
              FROM {PARCEL_RENDER_TABLE_NAME} AS parcel
             WHERE parcel.pnu = {table_name}.pnu
        )
        """
    )
    if bbox is not None:
        clauses.append(
            f"""
            EXISTS (
                SELECT 1
                  FROM {PARCEL_RENDER_TABLE_NAME} AS parcel
                 WHERE parcel.pnu = {table_name}.pnu
                   AND parcel.bbox_minx <= ?
                   AND parcel.bbox_maxx >= ?
                   AND parcel.bbox_miny <= ?
                   AND parcel.bbox_maxy >= ?
            )
            """
        )
        params.extend([bbox[2], bbox[0], bbox[3], bbox[1]])
    return clauses, params
