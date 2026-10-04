import json
import logging
from pathlib import Path

from pydantic import TypeAdapter

from app.models.style import Style

logger = logging.getLogger(name=__name__)
STYLE_LIST = TypeAdapter(list[Style])
EXCLUDED_STYLE = "Fooocus V2"


def load_styles(directory: Path) -> tuple[Style, ...]:
    if not directory.is_dir():
        logger.warning("Style directory is missing: %s", directory)
        return ()
    styles: dict[str, Style] = {}
    for path in sorted(directory.glob(pattern="*.json")):
        entries = STYLE_LIST.validate_python(json.loads(s=path.read_text(encoding="utf-8")))
        for entry in entries:
            if entry.name == EXCLUDED_STYLE:
                continue
            if entry.name in styles:
                raise ValueError(f"Duplicate style name: {entry.name}")
            styles[entry.name] = entry.model_copy(update={"source_file": path.name})
    return tuple(styles.values())
