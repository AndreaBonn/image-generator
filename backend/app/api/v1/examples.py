from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app.api.v1.generations import get_generation_service
from app.repositories.asset_repository import AssetRepository
from app.services.examples_service import MANIFEST_FILENAME, available_examples, is_first_use
from app.services.generation_service import GenerationService
from app.services.task_catalog import TaskCatalog

router = APIRouter()
IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable"


class ExampleOut(BaseModel):
    id: str
    task_id: str
    prompt: str
    seed: int
    aspect_ratio: str
    width: int
    height: int
    image_url: str


class ExamplesData(BaseModel):
    first_use: bool
    examples: list[ExampleOut]


class ExamplesResponse(BaseModel):
    data: ExamplesData


def get_asset_repository(request: Request) -> AssetRepository:
    return cast(AssetRepository, request.app.state.asset_repository)


def get_task_catalog(request: Request) -> TaskCatalog:
    return cast(TaskCatalog, request.app.state.task_catalog)


AssetRepositoryDependency = Annotated[AssetRepository, Depends(get_asset_repository)]
TaskCatalogDependency = Annotated[TaskCatalog, Depends(get_task_catalog)]
GenerationServiceDependency = Annotated[GenerationService, Depends(get_generation_service)]


def _to_example_out(entry: dict[str, Any]) -> ExampleOut:
    return ExampleOut(
        id=cast(str, entry["id"]),
        task_id=cast(str, entry["task_id"]),
        prompt=cast(str, entry["prompt"]),
        seed=cast(int, entry["seed"]),
        aspect_ratio=cast(str, entry["aspect_ratio"]),
        width=cast(int, entry["width"]),
        height=cast(int, entry["height"]),
        image_url=f"/api/v1/examples/{entry['id']}/image",
    )


@router.get(path="/examples", response_model=ExamplesResponse)
def list_examples(
    repository: AssetRepositoryDependency,
    catalog: TaskCatalogDependency,
    generations: GenerationServiceDependency,
) -> ExamplesResponse:
    entries = available_examples(
        manifest_path=repository.examples_dir / MANIFEST_FILENAME,
        tasks=catalog.list_tasks(),
        examples_dir=repository.examples_dir,
    )
    return ExamplesResponse(
        data=ExamplesData(
            first_use=is_first_use(generations=generations.repository),
            examples=[_to_example_out(entry=entry) for entry in entries],
        )
    )


@router.get(path="/examples/{asset_id}/image")
def get_example_image(asset_id: str, repository: AssetRepositoryDependency) -> FileResponse:
    path = repository.lookup_example(asset_id=asset_id)
    return FileResponse(
        path=path, media_type="image/webp", headers={"Cache-Control": IMAGE_CACHE_CONTROL}
    )
