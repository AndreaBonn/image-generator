from collections.abc import Mapping
from urllib.parse import urlsplit

from starlette.types import ASGIApp, Receive, Scope, Send

from app.errors import AppError, error_response

SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
BLOCKED_FETCH_SITES = frozenset({"cross-site", "same-site"})


class CrossSiteRequestError(AppError):
    code = "CROSS_SITE_REQUEST"
    http_status = 403
    default_message = "Richiesta rifiutata: arriva da un sito diverso da Studio Immagini."


def is_cross_site(headers: Mapping[str, str]) -> bool:
    """Tell whether a browser sent this request on behalf of another site.

    Requests without browser headers (curl, scripts, tests) are allowed: the
    threat is a web page in the user's browser, which always sends at least
    one of ``Sec-Fetch-Site`` or ``Origin`` on a mutating request.
    """
    if headers.get("sec-fetch-site") in BLOCKED_FETCH_SITES:
        return True
    origin = headers.get("origin")
    if origin is None:
        return False
    # Checked even when Sec-Fetch-Site says same-origin: under DNS rebinding the
    # browser considers the attacker's hostname same-origin with the app.
    return urlsplit(origin).hostname not in LOOPBACK_HOSTS


class OriginGuardMiddleware:
    """Reject state-changing requests that a foreign web page triggered (CSRF).

    Pure ASGI rather than BaseHTTPMiddleware so SSE streams pass untouched.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] not in SAFE_METHODS:
            headers = {
                name.decode("latin-1"): value.decode("latin-1") for name, value in scope["headers"]
            }
            if is_cross_site(headers=headers):
                response = error_response(error=CrossSiteRequestError())
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
