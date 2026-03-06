import os
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager

from app.repositories import event_repository, job_repository, land_repository, web_visit_repository


@contextmanager
def temp_env(values: dict[str, str]) -> Iterator[None]:
    original = {k: os.environ.get(k) for k in values}
    os.environ.update(values)
    try:
        yield
    finally:
        for key, value in original.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


def init_test_db(conn: sqlite3.Connection) -> None:
    land_repository.init_land_schema(conn)
    land_repository.init_land_schema(conn, table_name=land_repository.CITY_TABLE_NAME)
    job_repository.init_job_schema(conn)
    event_repository.init_event_schema(conn)
    web_visit_repository.init_web_visit_schema(conn)
    conn.commit()


def table_name_for_theme(theme: str) -> str:
    if theme == "city_owned":
        return land_repository.CITY_TABLE_NAME
    return land_repository.TABLE_NAME
