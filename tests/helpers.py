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


def assert_contains_all(text: str, expected: list[str]) -> None:
    for snippet in expected:
        assert snippet in text


def assert_not_contains_all(text: str, forbidden: list[str]) -> None:
    for snippet in forbidden:
        assert snippet not in text


def assert_has_keys(payload: dict[str, object], keys: list[str]) -> None:
    for key in keys:
        assert key in payload
