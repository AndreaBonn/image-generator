from typing import Annotated, Any, Literal, cast

from fastapi import APIRouter, Depends, Form, Request, UploadFile

from app.services.upload_service import UploadService

router = APIRouter(prefix="/uploads")


def get_upload_service(request: Request) -> UploadService:
    return cast(UploadService, request.app.state.upload_service)


@router.post(path="", status_code=201)
def create_upload(
    file: UploadFile,
    kind: Annotated[Literal["image", "mask"], Form()],
    service: Annotated[UploadService, Depends(get_upload_service)],
) -> dict[str, dict[str, Any]]:
    result = service.save(content=file.file, kind=kind)
    record = result.record
    return {
        "data": {
            "upload_id": record.id,
            "width": record.width,
            "height": record.height,
            "recipe": result.recipe.model_dump(mode="json") if result.recipe is not None else None,
        }
    }
