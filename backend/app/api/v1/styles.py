from typing import cast

from fastapi import APIRouter, Request

from app.models.style import StylesResponse, StyleSummary
from app.services.style_service import StyleService

router = APIRouter()


@router.get(path="/styles", response_model=StylesResponse)
def list_styles(request: Request, q: str = "") -> StylesResponse:
    service = cast(StyleService, request.app.state.style_service)
    return StylesResponse(
        data=[
            StyleSummary(id=style.name, name=style.name, source_file=style.source_file)
            for style in service.search_styles(query=q)
        ]
    )
