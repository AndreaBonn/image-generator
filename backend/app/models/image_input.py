from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, kw_only=True)
class ImageInput:
    path: Path
    size: tuple[int, int]
    mask_path: Path | None = None
    parent_id: str | None = None
