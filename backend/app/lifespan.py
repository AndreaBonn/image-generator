import asyncio
import json
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast

import httpx
from fastapi import FastAPI

from app.config import Settings
from app.engine.comfy_client import ComfyClient
from app.engine.comfy_engine import ComfyEngine
from app.engine.fake_engine import FakeEngine
from app.repositories.database import Database
from app.repositories.generation_repository import GenerationRepository
from app.repositories.image_repository import ImageRepository
from app.repositories.job_repository import JobRepository
from app.repositories.style_repository import load_styles
from app.repositories.upload_repository import UploadRepository
from app.services.generation_service import GenerationService
from app.services.job_resolution import SUPPORTED_TASKS
from app.services.job_resources import JobResources
from app.services.job_service import JobService
from app.services.style_service import StyleService
from app.services.task_catalog import load_catalog
from app.services.upload_service import UploadService

ENGINE_HTTP_TIMEOUT_S = 30


def initialize_resources(config: Settings) -> JobResources:
    catalog = load_catalog(settings=config)
    styles = StyleService(styles=load_styles(directory=config.fooocus_dir / "sdxl_styles"))
    database = Database(data_dir=config.data_dir)
    database.migrate()
    repository = JobRepository(database=database)
    repository.reconcile()
    UploadService(
        repository=UploadRepository(database=database), data_dir=config.data_dir
    ).cleanup()
    templates = {
        task.workflow: json.loads(
            (config.workflows_dir / task.workflow).read_text(encoding="utf-8")
        )
        for task in catalog.tasks
        if task.id in SUPPORTED_TASKS and (config.workflows_dir / task.workflow).is_file()
    }
    return JobResources(
        settings=config,
        catalog=catalog,
        styles=styles,
        repository=repository,
        images=ImageRepository(data_dir=config.data_dir),
        templates=templates,
    )


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    config = cast(Settings, application.state.settings)
    resources = await asyncio.to_thread(initialize_resources, config=config)
    application.state.database = resources.repository.database
    application.state.task_catalog = resources.catalog
    application.state.style_service = resources.styles
    initialize_image_services(application=application, resources=resources)
    service = JobService(resources=resources)
    application.state.job_service = service
    async with httpx.AsyncClient(
        base_url=config.comfy_url, timeout=ENGINE_HTTP_TIMEOUT_S, trust_env=False
    ) as http:
        application.state.engine = (
            FakeEngine(model_switch_eta_s=config.model_switch_eta_s)
            if config.engine_mode == "fake"
            else ComfyEngine(client=ComfyClient(http=http), url=config.comfy_url)
        )
        try:
            yield
        finally:
            await service.close()
            await asyncio.to_thread(resources.repository.database.close)


def initialize_image_services(application: FastAPI, resources: JobResources) -> None:
    database = resources.repository.database
    application.state.upload_service = UploadService(
        repository=UploadRepository(database=database),
        data_dir=resources.settings.data_dir,
    )
    application.state.generation_service = GenerationService(
        repository=GenerationRepository(database=database),
        jobs=resources.repository,
        data_dir=resources.settings.data_dir,
    )
