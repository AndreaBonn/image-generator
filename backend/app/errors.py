import logging
from typing import ClassVar

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)


class AppError(Exception):
    code: ClassVar[str] = "INTERNAL_ERROR"
    http_status: ClassVar[int] = 500
    default_message: ClassVar[str] = "Si è verificato un errore interno."

    def __init__(
        self, message: str | None = None, *, details: list[dict[str, str]] | None = None
    ) -> None:
        self.message = message if message is not None else self.default_message
        self.details = [dict(detail) for detail in details] if details else []
        super().__init__(self.message)


class ValidationError(AppError):
    code = "VALIDATION_ERROR"
    http_status = 422
    default_message = "Controlla i campi indicati."


class NotFoundError(AppError):
    code = "NOT_FOUND"
    http_status = 404
    default_message = "Generazione non trovata."


class ModelNotInstalledError(AppError):
    code = "MODEL_NOT_INSTALLED"
    http_status = 409
    default_message = "Il modello per questo compito non è installato."


class EngineUnavailableError(AppError):
    code = "ENGINE_UNAVAILABLE"
    http_status = 503
    default_message = (
        "Il motore che crea le immagini non risponde: dal menu delle applicazioni scegli "
        '"Chiudi Image Generator" e poi riaprilo, oppure avvialo con scripts/start.sh.'
    )


class EngineRejectedError(AppError):
    code = "ENGINE_REJECTED"
    http_status = 502
    default_message = "Il motore ha rifiutato la richiesta di generazione."


class EngineExecutionError(AppError):
    code = "ENGINE_EXECUTION_FAILED"
    http_status = 502
    default_message = "Il motore non è riuscito a completare la generazione."


class OutOfMemoryError(AppError):
    code = "OUT_OF_MEMORY"
    http_status = 507
    default_message = (
        "Memoria della GPU esaurita. Prova un formato più piccolo o 1 immagine alla volta."
    )


class JobTimeoutError(AppError):
    code = "JOB_TIMEOUT"
    http_status = 504
    default_message = "La generazione ha superato il tempo massimo ed è stata interrotta."


class EngineRestartedError(AppError):
    code = "ENGINE_RESTARTED"
    http_status = 500
    default_message = "Il motore si è riavviato durante la generazione."


class DiskFullError(AppError):
    code = "DISK_FULL"
    http_status = 507
    default_message = (
        "Spazio su disco esaurito: libera spazio o svuota la cartella output del motore."
    )


class AssetGenerationInProgressError(AppError):
    code = "ASSET_GENERATION_IN_PROGRESS"
    http_status = 409
    default_message = "Sta già creando esempi o anteprime. Attendi che finisca o annulla."


class DownloadInProgressError(AppError):
    code = "DOWNLOAD_IN_PROGRESS"
    http_status = 409
    default_message = (
        "È già in corso un altro download di un modello. Attendi che finisca o annullalo."
    )


class DownloadFailedError(AppError):
    code = "DOWNLOAD_FAILED"
    http_status = 502
    default_message = (
        "Download del modello non riuscito: rete assente o il server ha risposto con un errore."
    )


class ChecksumMismatchError(AppError):
    code = "CHECKSUM_MISMATCH"
    http_status = 502
    default_message = (
        "Il file scaricato non corrisponde al checksum atteso: il download è stato annullato "
        "automaticamente."
    )


VALIDATION_MESSAGES = {
    "missing": "Campo obbligatorio.",
    "int_parsing": "Inserisci un numero intero valido.",
    "int_type": "Inserisci un numero intero valido.",
    "string_type": "Inserisci un testo valido.",
    "string_too_long": "Il testo supera la lunghezza massima consentita.",
    "json_invalid": "Il corpo della richiesta non è un JSON valido.",
    "extra_forbidden": "Campo non previsto.",
}


def error_response(error: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=error.http_status,
        content={
            "error": {
                "code": error.code,
                "message": error.message,
                "details": error.details,
            }
        },
    )


async def handle_app_error(request: Request, exc: Exception) -> JSONResponse:
    if isinstance(exc, AppError):
        return error_response(error=exc)
    return await handle_unexpected_error(request=request, exc=exc)


async def handle_validation_error(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RequestValidationError):
        return await handle_unexpected_error(request=request, exc=exc)
    details = [
        {
            "field": ".".join(
                str(part) for part in item["loc"] if part not in {"body", "query", "path", "header"}
            ),
            "message": VALIDATION_MESSAGES.get(item["type"], "Valore non valido per questo campo."),
        }
        for item in exc.errors()
    ]
    return error_response(error=ValidationError(details=details))


async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    logger.error("Unhandled request error", exc_info=exc)
    return error_response(error=AppError())
