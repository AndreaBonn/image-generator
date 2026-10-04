from collections.abc import Sequence
from dataclasses import dataclass

from app.errors import ValidationError
from app.models.style import Style

MAX_STYLES = 5


def split_negative_terms(text: str) -> tuple[str, ...]:
    terms: list[str] = []
    depth = 0
    start = 0
    is_escaped = False
    for index, character in enumerate(text):
        if is_escaped:
            is_escaped = False
            continue
        if character == "\\":
            is_escaped = True
        elif character in "([":
            depth += 1
        elif character in ")]":
            depth = max(0, depth - 1)
        elif character == "," and depth == 0:
            terms.append(text[start:index].strip())
            start = index + 1
    terms.append(text[start:].strip())
    return tuple(term for term in terms if term)


@dataclass(frozen=True)
class StyleService:
    styles: tuple[Style, ...]

    def search_styles(self, query: str = "") -> tuple[Style, ...]:
        normalized = query.strip().casefold()
        return tuple(style for style in self.styles if normalized in style.name.casefold())

    def apply_styles(self, prompt: str, negative: str, style_ids: Sequence[str]) -> tuple[str, str]:
        if len(style_ids) > MAX_STYLES:
            raise ValidationError(message="Puoi selezionare al massimo 5 stili.")
        if not style_ids:
            return prompt, negative
        catalog = {style.name: style for style in self.styles}
        negative_terms = list(split_negative_terms(text=negative))
        for style_id in style_ids:
            if style_id not in catalog:
                raise ValidationError(message=f"Stile sconosciuto: {style_id}.")
            style = catalog[style_id]
            prompt = style.prompt.replace("{prompt}", prompt)
            negative_terms.extend(split_negative_terms(text=style.negative_prompt))
        return prompt, ", ".join(dict.fromkeys(negative_terms))
