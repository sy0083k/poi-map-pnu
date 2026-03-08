import sqlite3
from typing import Sequence

from app.repositories.land_repository_schema import TABLE_NAME, init_land_schema


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
    table_name: str = TABLE_NAME,
) -> Sequence[sqlite3.Row]:
    init_land_schema(conn, table_name=table_name)
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
