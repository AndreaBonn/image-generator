from pathlib import Path
from sqlite3 import Connection

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import ConnectionPoolEntry

MIGRATIONS_DIR = Path(__file__).resolve().parents[2] / "migrations"
# Seconds a writer waits on a locked SQLite file before failing (job worker + API writes).
SQLITE_BUSY_TIMEOUT_S = 15


def enable_foreign_keys(connection: Connection, record: ConnectionPoolEntry) -> None:
    connection.execute("PRAGMA foreign_keys=ON")


class Database:
    def __init__(self, data_dir: Path) -> None:
        data_dir.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(
            url=f"sqlite:///{data_dir / 'studio.db'}",
            connect_args={"check_same_thread": False, "timeout": SQLITE_BUSY_TIMEOUT_S},
        )
        self.sessions = sessionmaker(bind=self.engine, expire_on_commit=False)
        event.listen(target=self.engine, identifier="connect", fn=enable_foreign_keys)

    def alembic_config(self) -> Config:
        config = Config()
        config.set_main_option(name="script_location", value=str(MIGRATIONS_DIR))
        config.set_main_option(name="sqlalchemy.url", value=str(self.engine.url).replace("%", "%%"))
        return config

    def migrate(self) -> None:
        command.upgrade(config=self.alembic_config(), revision="head")

    def close(self) -> None:
        self.engine.dispose()
