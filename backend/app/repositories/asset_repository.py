import hashlib
import os
import re
import tempfile
from pathlib import Path

from app.errors import NotFoundError

HASH_LENGTH = 16
_HEX_ID_PATTERN = re.compile(rf"^[0-9a-f]{{{HASH_LENGTH}}}$")
PREVIEWS_DIRNAME = "style_previews"


def atomic_write_bytes(path: Path, content: bytes) -> None:
    """Write via a uniquely named temporary file in the same directory, then rename.

    A fixed `<name>.tmp` let two processes (two CLI runs) clobber each other's
    temporary file before the rename.
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(handle, "wb") as tmp_file:
            tmp_file.write(content)
        tmp_path.replace(path)
    except BaseException:
        tmp_path.unlink(missing_ok=True)
        raise


def preview_id(style_name: str) -> str:
    """Stable, filesystem-safe id for a style's preview file.

    Hashing (rather than slugifying the name) makes path traversal impossible by
    construction: the result is always exactly HASH_LENGTH hex characters.
    """
    return hashlib.sha256(style_name.encode("utf-8")).hexdigest()[:HASH_LENGTH]


class AssetRepository:
    def __init__(self, data_dir: Path) -> None:
        self.previews_dir = data_dir / PREVIEWS_DIRNAME

    def exists(self, style_name: str) -> bool:
        return self.path_for(style_name=style_name).is_file()

    def path_for(self, style_name: str) -> Path:
        return self._path_for_id(asset_id=preview_id(style_name=style_name))

    def save(self, style_name: str, content: bytes) -> None:
        atomic_write_bytes(path=self.path_for(style_name=style_name), content=content)

    def lookup(self, asset_id: str) -> Path:
        """Resolve an id received from the API (never a style name) to its file.

        Only exactly HASH_LENGTH lowercase hex characters are accepted: anything
        else (including `../` or path separators) is rejected before it ever
        touches the filesystem, same 404 as a missing preview.
        """
        if not _HEX_ID_PATTERN.fullmatch(asset_id):
            raise NotFoundError(message="Anteprima non trovata.")
        path = self._path_for_id(asset_id=asset_id)
        if not path.is_file():
            raise NotFoundError(message="Anteprima non trovata.")
        return path

    def _path_for_id(self, asset_id: str) -> Path:
        return self.previews_dir / f"{asset_id}.webp"
