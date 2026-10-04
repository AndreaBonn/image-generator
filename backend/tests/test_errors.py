import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel

from app import errors
from app.main import create_app

ERROR_CASES = [
    (errors.AppError, 500, "INTERNAL_ERROR"),
    (errors.ValidationError, 422, "VALIDATION_ERROR"),
    (errors.NotFoundError, 404, "NOT_FOUND"),
    (errors.ModelNotInstalledError, 409, "MODEL_NOT_INSTALLED"),
    (errors.EngineUnavailableError, 503, "ENGINE_UNAVAILABLE"),
    (errors.EngineRejectedError, 502, "ENGINE_REJECTED"),
    (errors.OutOfMemoryError, 507, "OUT_OF_MEMORY"),
    (errors.JobTimeoutError, 504, "JOB_TIMEOUT"),
    (errors.EngineRestartedError, 500, "ENGINE_RESTARTED"),
    (errors.DiskFullError, 507, "DISK_FULL"),
]


@pytest.mark.parametrize("error_type,status,code", ERROR_CASES)
def test_app_error_envelope(error_type: type[errors.AppError], status: int, code: str) -> None:
    app = create_app()
    error = error_type()

    @app.get("/error")
    def fail() -> None:
        raise error

    with TestClient(app) as client:
        response = client.get("/error")
    assert response.status_code == status
    assert response.json() == {"error": {"code": code, "message": error.message, "details": []}}


class Payload(BaseModel):
    count: int


def add_validation_route(app: FastAPI) -> None:
    @app.post("/validate")
    def validate(payload: Payload) -> Payload:
        return payload


@pytest.mark.parametrize(
    "body,message",
    [({}, "Campo obbligatorio."), ({"count": "secret/path"}, "Inserisci un numero intero valido.")],
)
def test_request_validation_translated(body: dict[str, object], message: str) -> None:
    app = create_app()
    add_validation_route(app=app)
    with TestClient(app) as client:
        response = client.post("/validate", json=body)
    assert response.status_code == 422
    assert response.json() == {
        "error": {
            "code": "VALIDATION_ERROR",
            "message": "Controlla i campi indicati.",
            "details": [{"field": "count", "message": message}],
        }
    }


def test_unexpected_error_hides_internal_information() -> None:
    app = create_app()

    @app.get("/unexpected")
    def fail() -> None:
        raise RuntimeError("secret/path")

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/unexpected")
    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "INTERNAL_ERROR",
            "message": "Si è verificato un errore interno.",
            "details": [],
        }
    }
