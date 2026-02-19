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


def enqueue_geom_update_job() -> int:
    with db_connection() as conn:
        job_id = idle_land_repository.create_geom_update_job(conn)
        conn.commit()
    return job_id


def run_geom_update_job(job_id: int, max_retries: int = 5) -> tuple[int, int]:
    with db_connection() as conn:
        idle_land_repository.mark_geom_job_running(conn, job_id)
        conn.commit()

    updated_count = 0
    failed_count = 0
    try:
        updated_count, failed_count = update_geoms(max_retries=max_retries)
        with db_connection() as conn:
            idle_land_repository.mark_geom_job_done(
                conn, job_id, updated_count=updated_count, failed_count=failed_count
            )
            conn.commit()
    except Exception as exc:
        with db_connection() as conn:
            idle_land_repository.mark_geom_job_failed(
                conn,
                job_id,
                updated_count=updated_count,
                failed_count=failed_count,
                error_message=str(exc)[:2000],
            )
            conn.commit()
        raise
    return updated_count, failed_count


def update_geoms(max_retries: int = 5) -> tuple[int, int]:
    settings = get_settings()
    client = VWorldClient(
        api_key=settings.vworld_geocoder_key,
        timeout_s=settings.vworld_timeout_s,
        retries=settings.vworld_retries,
        backoff_s=settings.vworld_backoff_s,
    )
    with db_connection() as conn:
        updated_count = 0
        batch_size = 50
        for attempt in range(1, max_retries + 1):
            failed_items = idle_land_repository.fetch_missing_geom(conn, limit=batch_size)

            if not failed_items:
                break

            updated_in_batch = 0
            for item_id, address in failed_items:
                geom_data = client.get_parcel_geometry(address)
                if geom_data:
                    idle_land_repository.update_geom(conn, item_id, geom_data)
                    updated_count += 1
                    updated_in_batch += 1
                else:
                    logger.warning("경계선 획득 실패 (%s)", address)
                    time.sleep(settings.vworld_backoff_s * attempt)

            if updated_in_batch:
                conn.commit()

        failed = idle_land_repository.count_missing_geom(conn)
    return updated_count, failed
