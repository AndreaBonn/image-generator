import asyncio
import json
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import cast

import httpx
from fastapi import FastAPI

from app.config import Settings
from app.engine.comfy_client import ComfyClient
from app.engine.comfy_engine import ComfyEngine
from app.engine.fake_engine import FakeEngine
from app.repositories.asset_repository import AssetRepository
from app.repositories.database import Database
from app.repositories.generation_repository import GenerationRepository
from app.repositories.image_repository import ImageRepository
from app.repositories.job_repository import JobRepository
from app.repositories.model_files import STAGING_DIRNAME, ModelFilesRepository
from app.repositories.style_repository import load_styles
from app.repositories.upload_repository import UploadRepository
from app.services.asset_jobs import AssetJobs
from app.services.generation_service import GenerationService
from app.services.job_resolution import GENERATION_TASKS, IMAGE_TASKS, is_reference_task
from app.services.job_resources import JobResources
from app.services.job_service import JobService
from app.services.model_downloads import ModelDownloads
from app.services.style_service import StyleService
from app.services.task_catalog import load_catalog, task_workflow_files
from app.services.upload_service import UploadService

ENGINE_HTTP_TIMEOUT_S = 30
logger = logging.getLogger(__name__)


def cleanup_stale_downloads(config: Settings) -> None:
    """Discard leftover .part/.lock files from MODELS_DIR/.downloads at startup.

    Resuming a download across a restart is not supported (SPEC § 7.2): any file
    found here belongs to a download that was interrupted by the previous process
    exiting, never to one still in progress.
    """
    staging_dir = config.models_dir / STAGING_DIRNAME
    if not staging_dir.is_dir():
        return
    for entry in staging_dir.iterdir():
        if entry.is_file():
            logger.warning("Removing stale download artifact %s", entry.name)
            entry.unlink()


def initialize_resources(config: Settings) -> JobResources:
    cleanup_stale_downloads(config=config)
    catalog = load_catalog(settings=config)
    styles = StyleService(styles=load_styles(directory=config.styles_dir))
    database = Database(data_dir=config.data_dir)
    database.migrate()
    repository = JobRepository(database=database)
    repository.reconcile()
    UploadService(
        repository=UploadRepository(database=database), data_dir=config.data_dir
    ).cleanup()
    templates = {
        filename: json.loads((config.workflows_dir / filename).read_text(encoding="utf-8"))
        for task in catalog.tasks
        if task.id in GENERATION_TASKS | IMAGE_TASKS or is_reference_task(task=task)
        for filename in task_workflow_files(task=task)
        if (config.workflows_dir / filename).is_file()
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
    application.state.asset_repository = AssetRepository(data_dir=config.data_dir)
    initialize_image_services(application=application, resources=resources)
    service = JobService(resources=resources)
    application.state.job_service = service
    asset_jobs = AssetJobs(settings=config, gpu_turn=service.runner.execution_lock)
    application.state.asset_jobs = asset_jobs
    async with httpx.AsyncClient(
        base_url=config.comfy_url, timeout=ENGINE_HTTP_TIMEOUT_S, trust_env=False
    ) as http:
        application.state.engine = (
            FakeEngine(model_switch_eta_s=config.model_switch_eta_s)
            if config.engine_mode == "fake"
            else ComfyEngine(client=ComfyClient(http=http, config=config), url=config.comfy_url)
        )
        async with httpx.AsyncClient(trust_env=False) as downloads_http:
            application.state.model_downloads = ModelDownloads(
                catalog=resources.catalog,
                files=ModelFilesRepository(http=downloads_http, config=config),
                config=config,
            )
            try:
                yield
            finally:
                await asset_jobs.cancel()
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
