import logging
import time

from app.clients.vworld_client import VWorldClient
from app.core import get_settings
from app.db.connection import db_connection
from app.logging_utils import RequestIdFilter
from app.repositories import idle_land_repository

logger = logging.getLogger(__name__)
logger.addFilter(RequestIdFilter())


def init_db() -> None:
    with db_connection() as conn:
        idle_land_repository.init_db(conn)


def update_geoms(max_retries: int = 5) -> tuple[int, int]:
    settings = get_settings()
    client = VWorldClient(
        api_key=settings.vworld_geocoder_key,
        timeout_s=settings.vworld_timeout_s,
        retries=settings.vworld_retries,
        backoff_s=settings.vworld_backoff_s,
    )
    with db_connection() as conn:
        retry_count = 0
        for _ in range(1, max_retries + 1):
            failed_items = idle_land_repository.fetch_missing_geom(conn)

            if not failed_items:
                break

            for item_id, address in failed_items:
                time.sleep(0.5)
                geom_data = client.get_parcel_geometry(address)
                if geom_data:
                    idle_land_repository.update_geom(conn, item_id, geom_data)
                    retry_count += 1
                else:
                    logger.warning("경계선 획득 실패 (%s)", address)
                conn.commit()

        failed = idle_land_repository.count_missing_geom(conn)
    return retry_count, failed
