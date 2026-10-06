from typing import Annotated, cast

from fastapi import APIRouter, Depends, Request
from fastapi.responses import FileResponse

from app.models.style import StylesResponse, StyleSummary
from app.repositories.asset_repository import AssetRepository, preview_id
from app.services.style_service import StyleService

router = APIRouter()
PREVIEW_CACHE_CONTROL = "public, max-age=31536000, immutable"


def get_asset_repository(request: Request) -> AssetRepository:
    return cast(AssetRepository, request.app.state.asset_repository)


AssetRepositoryDependency = Annotated[AssetRepository, Depends(get_asset_repository)]


def _preview_url(style_name: str, repository: AssetRepository) -> str | None:
    if not repository.exists(style_name=style_name):
        return None
    return f"/api/v1/styles/previews/{preview_id(style_name=style_name)}"


@router.get(path="/styles", response_model=StylesResponse)
def list_styles(
    request: Request, repository: AssetRepositoryDependency, q: str = ""
) -> StylesResponse:
    service = cast(StyleService, request.app.state.style_service)
    return StylesResponse(
        data=[
            StyleSummary(
                id=style.name,
                name=style.name,
                source_file=style.source_file,
                preview_url=_preview_url(style_name=style.name, repository=repository),
            )
            for style in service.search_styles(query=q)
        ]
    )


@router.get(path="/styles/previews/{asset_id}")
def get_style_preview(asset_id: str, repository: AssetRepositoryDependency) -> FileResponse:
    path = repository.lookup(asset_id=asset_id)
    return FileResponse(
        path=path, media_type="image/webp", headers={"Cache-Control": PREVIEW_CACHE_CONTROL}
    )
