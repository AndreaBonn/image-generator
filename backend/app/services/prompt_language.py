import re

ITALIAN_WORDS = frozenset(
    "il lo la i gli le un uno una di del dello della dei degli delle da dal "
    "dallo dalla dai dagli dalle a al allo alla ai agli alle con su sul sulla "
    "per tra fra che non è".split()
)
ENGLISH_WORDS = frozenset(
    "a an the of from to in on at by for with without and or but if as is are "
    "was were be been being this that these those it its his her their our "
    "your my not over under into through".split()
)
WORD_PATTERN = re.compile(pattern=r"\b[^\W\d_]+\b", flags=re.UNICODE)
MIN_ITALIAN_WORDS = 2


def looks_italian(text: str) -> bool:
    words = WORD_PATTERN.findall(string=text.casefold())
    italian_count = sum(word in ITALIAN_WORDS for word in words)
    english_count = sum(word in ENGLISH_WORDS for word in words)
    return italian_count >= MIN_ITALIAN_WORDS and italian_count > english_count
