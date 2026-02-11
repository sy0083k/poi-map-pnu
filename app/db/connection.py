import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

from app.core import get_settings


def _database_path() -> Path:
    settings = get_settings()
    return Path(settings.base_dir) / "data" / "database.db"


@contextmanager
def db_connection(*, row_factory: bool = False) -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(_database_path())
    if row_factory:
        conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
