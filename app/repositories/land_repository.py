from app.repositories.land_repository_cache import (
    fetch_cached_cadastral_by_pnus,
    upsert_cadastral_cache,
)
from app.repositories.land_repository_queries import (
    count_all_lands,
    count_failed_geom,
    count_missing_geom,
    delete_all,
    fetch_distinct_pnu,
    fetch_failed_pnu,
    fetch_lands_by_ids,
    fetch_lands_page_without_geom,
    fetch_lands_with_geom,
    fetch_lands_with_geom_page,
    fetch_missing_geom,
    insert_land,
    mark_geom_failed_by_pnu,
    update_geom,
    update_geom_by_pnu,
)
from app.repositories.land_repository_query_filters import (
    count_lands_without_geom_filtered,
    fetch_lands_page_without_geom_filtered,
)
from app.repositories.land_repository_schema import (
    CACHE_TABLE_NAME,
    TABLE_NAME,
    init_land_schema,
)

CITY_TABLE_NAME = TABLE_NAME

__all__ = [
    "TABLE_NAME",
    "CITY_TABLE_NAME",
    "CACHE_TABLE_NAME",
    "init_land_schema",
    "fetch_lands_with_geom",
    "fetch_lands_with_geom_page",
    "fetch_lands_page_without_geom",
    "fetch_lands_page_without_geom_filtered",
    "count_lands_without_geom_filtered",
    "fetch_lands_by_ids",
    "delete_all",
    "insert_land",
    "fetch_missing_geom",
    "update_geom",
    "update_geom_by_pnu",
    "mark_geom_failed_by_pnu",
    "count_missing_geom",
    "count_all_lands",
    "fetch_distinct_pnu",
    "fetch_failed_pnu",
    "fetch_cached_cadastral_by_pnus",
    "upsert_cadastral_cache",
    "count_failed_geom",
]
