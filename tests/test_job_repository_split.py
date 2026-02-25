from app.db.connection import db_connection
from app.repositories import job_repository


def test_job_repository_lifecycle(db_path: object) -> None:
    with db_connection(row_factory=True) as conn:
        job_repository.init_job_schema(conn)
        job_id = job_repository.create_geom_update_job(conn)
        job_repository.mark_geom_job_running(conn, job_id)
        job_repository.mark_geom_job_done(conn, job_id, updated_count=3, failed_count=1)
        conn.commit()

        row = conn.execute(
            "SELECT status, updated_count, failed_count FROM geom_update_jobs WHERE id = ?",
            (job_id,),
        ).fetchone()
        assert row is not None
        assert str(row["status"]) == "done"
        assert int(row["updated_count"]) == 3
        assert int(row["failed_count"]) == 1


def test_job_repository_fetch_active_and_single_job(db_path: object) -> None:
    with db_connection(row_factory=True) as conn:
        job_repository.init_job_schema(conn)
        first_job_id = job_repository.create_geom_update_job(conn)
        second_job_id = job_repository.create_geom_update_job(conn)
        conn.commit()

        active = job_repository.fetch_latest_active_geom_job(conn)
        assert active is not None
        assert int(active["id"]) == second_job_id
        assert str(active["status"]) == "pending"

        job_repository.mark_geom_job_running(conn, second_job_id)
        job_repository.mark_geom_job_done(conn, second_job_id, updated_count=1, failed_count=0)
        conn.commit()

        fetched = job_repository.fetch_geom_job(conn, second_job_id)
        assert fetched is not None
        assert str(fetched["status"]) == "done"

        active_after_done = job_repository.fetch_latest_active_geom_job(conn)
        assert active_after_done is not None
        assert int(active_after_done["id"]) == first_job_id
