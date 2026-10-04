from alembic import context
from sqlalchemy import engine_from_config, pool

from app.models.records import Base


def run_migrations() -> None:
    engine = engine_from_config(
        configuration=context.config.get_section("alembic", {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


run_migrations()
