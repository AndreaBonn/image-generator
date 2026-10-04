from fastapi import APIRouter
from pydantic import BaseModel

from app.services.prompt_language import looks_italian

router = APIRouter()


class LanguageCheckRequest(BaseModel):
    text: str


class LanguageCheckResponse(BaseModel):
    looks_italian: bool


@router.post(path="/prompt/language-check", response_model=LanguageCheckResponse)
def check_language(body: LanguageCheckRequest) -> LanguageCheckResponse:
    return LanguageCheckResponse(looks_italian=looks_italian(text=body.text))
