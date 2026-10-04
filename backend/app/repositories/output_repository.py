import os
import stat
from pathlib import Path

from app.errors import NotFoundError

BYTES_PER_MB = 1024**2
DIRECTORY_FLAGS = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW


def clear_directory(directory_fd: int) -> tuple[int, int]:
    count, size = 0, 0
    with os.scandir(path=directory_fd) as entries:
        for entry in entries:
            info = entry.stat(follow_symlinks=False)
            if stat.S_ISREG(info.st_mode):
                os.unlink(path=entry.name, dir_fd=directory_fd)
                count, size = count + 1, size + info.st_size
            elif stat.S_ISDIR(info.st_mode):
                child_fd = os.open(path=entry.name, flags=DIRECTORY_FLAGS, dir_fd=directory_fd)
                try:
                    child_count, child_size = clear_directory(directory_fd=child_fd)
                    count, size = count + child_count, size + child_size
                finally:
                    os.close(fd=child_fd)
    return count, size


def clear_engine_output(output_dir: Path) -> dict[str, int | float]:
    root = output_dir.resolve()
    studio = root / "studio"
    if studio.is_symlink() or not studio.resolve().is_relative_to(root):
        raise NotFoundError()
    if not studio.exists():
        return {"removed_files": 0, "freed_mb": 0.0}
    directory_fd = os.open(path=studio, flags=DIRECTORY_FLAGS)
    try:
        count, size = clear_directory(directory_fd=directory_fd)
    finally:
        os.close(fd=directory_fd)
    return {"removed_files": count, "freed_mb": size / BYTES_PER_MB}
