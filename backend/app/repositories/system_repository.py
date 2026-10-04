import csv
import logging
import subprocess
from io import StringIO

NVIDIA_TIMEOUT_S = 5
logger = logging.getLogger(__name__)


def parse_processes(output: str) -> list[dict[str, str | int]]:
    processes: list[dict[str, str | int]] = []
    for row in csv.reader(StringIO(output), skipinitialspace=True):
        if len(row) != 3 or "engine/ComfyUI" in row[1]:
            continue
        try:
            used = int(row[2])
        except ValueError:
            continue
        if used >= 0:
            processes.append({"name": row[1].strip(), "used_mb": used})
    return processes


def gpu_processes() -> list[dict[str, str | int]]:
    try:
        result = subprocess.run(
            args=[
                "nvidia-smi",
                "--query-compute-apps=pid,process_name,used_memory",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True,
            text=True,
            timeout=NVIDIA_TIMEOUT_S,
            check=True,
        )
    except (OSError, subprocess.SubprocessError) as error:
        logger.info("GPU process information unavailable: %s", error)
        return []
    return parse_processes(output=result.stdout)
