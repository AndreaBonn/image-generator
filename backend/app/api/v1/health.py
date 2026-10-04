import httpx
from fastapi import APIRouter, Request

from app.repositories.engine_health import fetch_engine_health

router = APIRouter()


@router.get("/health")
async def get_health(request: Request) -> dict[str, dict[str, str]]:
    try:
        await fetch_engine_health(comfy_url=request.app.state.settings.comfy_url)
        engine = "ok"
    except httpx.HTTPError:
        engine = "unreachable"
    return {"data": {"backend": "ok", "engine": engine}}
