from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import FileResponse, PlainTextResponse, Response
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException

from app.config import REPO_ROOT
from app.errors import NotFoundError, error_response
from app.services.spa_service import resolve_spa_file


def serve_spa(directory: Path, path: str) -> Response:
    file = resolve_spa_file(directory=directory, path=path)
    if file is None:
        return PlainTextResponse(content="Compila l'interfaccia con: cd frontend && npm run build")
    return FileResponse(path=file)


def register_spa(application: FastAPI) -> None:
    directory = REPO_ROOT / "frontend/dist"

    @application.exception_handler(HTTPException)
    async def fallback(request: Request, exc: HTTPException) -> Response:
        path = request.url.path.lstrip("/")
        is_api = path == "api" or path.startswith("api/")
        if exc.status_code == 404 and is_api and "route" not in request.scope:
            return error_response(error=NotFoundError(message="Indirizzo API inesistente."))
        if exc.status_code != 404 or request.method != "GET" or "route" in request.scope or is_api:
            return await http_exception_handler(request=request, exc=exc)
        try:
            return await run_in_threadpool(serve_spa, directory=directory, path=path)
        except NotFoundError as error:
            return error_response(error=error)
