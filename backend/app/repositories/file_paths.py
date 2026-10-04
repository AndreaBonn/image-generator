from pathlib import Path

from app.errors import NotFoundError


def resolve_data_path(root: Path, relative: str, must_exist: bool = True) -> Path:
    try:
        path = (root / relative).resolve()
        if not path.is_relative_to(root.resolve()) or (must_exist and not path.is_file()):
            raise NotFoundError()
        return path
    except (OSError, RuntimeError) as error:
        raise NotFoundError() from error
