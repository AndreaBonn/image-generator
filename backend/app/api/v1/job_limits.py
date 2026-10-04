from collections import deque
from time import monotonic

from fastapi import Request

from app.errors import AppError

RATE_WINDOW_S = 60
MAX_REQUESTS_PER_WINDOW = 600


class RateLimitError(AppError):
    code = "RATE_LIMITED"
    http_status = 429
    default_message = "Troppe richieste. Attendi un minuto prima di riprovare."


async def enforce_job_rate_limit(request: Request) -> None:
    if not hasattr(request.app.state, "job_request_times"):
        request.app.state.job_request_times = deque[float]()
    timestamps: deque[float] = request.app.state.job_request_times
    now = monotonic()
    while timestamps and timestamps[0] <= now - RATE_WINDOW_S:
        timestamps.popleft()
    if len(timestamps) >= MAX_REQUESTS_PER_WINDOW:
        raise RateLimitError()
    timestamps.append(now)
