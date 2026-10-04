from pathlib import Path

from app.errors import NotFoundError
from app.repositories.file_paths import resolve_data_path


def resolve_spa_file(directory: Path, path: str) -> Path | None:
    if not directory.is_dir():
        if path:
            raise NotFoundError(message="Pagina non trovata.")
        return None
    try:
        asset = resolve_data_path(root=directory, relative=path, must_exist=False)
    except NotFoundError as error:
        raise NotFoundError(message="Pagina non trovata.") from error
    if asset.is_file():
        return asset
    if Path(path).suffix:
        # A missing file (e.g. /assets/old.js) must 404, not return index.html as JavaScript.
        raise NotFoundError(message="Risorsa non trovata.")
    return resolve_data_path(root=directory, relative="index.html")
