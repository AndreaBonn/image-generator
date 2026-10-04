from pathlib import Path

from app.repositories.output_repository import clear_engine_output


class MaintenanceService:
    def __init__(self, output_dir: Path) -> None:
        self.output_dir = output_dir

    def clear_output(self) -> dict[str, int | float]:
        return clear_engine_output(output_dir=self.output_dir)
