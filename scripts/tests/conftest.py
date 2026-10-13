import pytest


def pytest_configure(config: pytest.Config) -> None:
    # CI deselects these with -m "not local_install": they assert on the engine,
    # models and style files of a machine where the app is already installed.
    config.addinivalue_line(
        "markers",
        "local_install: needs this repo's engine, models and data/styles installed",
    )
