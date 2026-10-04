from dataclasses import dataclass

from app.config import Settings
from app.engine.workflow_builder import Graph
from app.repositories.image_repository import ImageRepository
from app.repositories.job_repository import JobRepository
from app.services.style_service import StyleService
from app.services.task_catalog import TaskCatalog


@dataclass(frozen=True, kw_only=True)
class JobResources:
    settings: Settings
    catalog: TaskCatalog
    styles: StyleService
    repository: JobRepository
    images: ImageRepository
    templates: dict[str, Graph]
