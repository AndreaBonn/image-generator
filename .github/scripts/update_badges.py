"""Write the shields.io endpoint badges from CI test and coverage reports.

Usage: python update_badges.py <reports_dir> <badges_dir>

Reads JUnit XML files and coverage summaries from <reports_dir> and writes
test-badge.json, coverage-backend-badge.json and coverage-frontend-badge.json.
A missing report yields a grey "N/A" badge instead of failing, so the badges
still update when one of the jobs crashed before producing its report.
"""

import json
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

JUNIT_FILES = ("backend-junit.xml", "frontend-junit.xml", "scripts-junit.xml")
BACKEND_COVERAGE = "backend-coverage.json"
FRONTEND_COVERAGE = "frontend-coverage-summary.json"
COLOR_THRESHOLDS = ((90.0, "brightgreen"), (80.0, "green"), (60.0, "yellow"))
GREY = "lightgrey"


def count_junit(path: Path) -> tuple[int, int] | None:
    """Return (total, failed) for one JUnit XML file, or None if missing or unreadable.

    Errors count as failures; skipped tests are left out of the total.
    """
    if not path.is_file():
        return None
    try:
        root = ET.parse(path).getroot()
    except ET.ParseError:
        return None
    suites = root.findall("testsuite") if root.tag == "testsuites" else [root]
    total = sum(int(suite.get("tests", 0)) - int(suite.get("skipped", 0)) for suite in suites)
    failed = sum(int(suite.get("failures", 0)) + int(suite.get("errors", 0)) for suite in suites)
    return total, failed


def build_test_badge(reports: list[Path]) -> dict[str, object]:
    """Badge summing the expected JUnit reports.

    A missing report means its job stopped before the tests ran (lint or type
    errors, a crash), so the badge turns red instead of counting the rest.
    """
    counts = [count_junit(path=path) for path in reports]
    present = [count for count in counts if count is not None]
    if not present:
        return badge(label="tests", message="N/A", color=GREY)
    if len(present) < len(counts):
        message = f"incomplete ({len(present)}/{len(counts)} suites ran)"
        return badge(label="tests", message=message, color="red")
    total = sum(count[0] for count in present)
    failed = sum(count[1] for count in present)
    if failed:
        return badge(label="tests", message=f"{total - failed}/{total} passed", color="red")
    return badge(label="tests", message=f"{total} passed", color="brightgreen")


def coverage_color(percent: float) -> str:
    for threshold, color in COLOR_THRESHOLDS:
        if percent >= threshold:
            return color
    return "red"


def coverage_badge(label: str, percent: float | None) -> dict[str, object]:
    if percent is None:
        return badge(label=label, message="N/A", color=GREY)
    # Round once so the shown number and the color agree (89.6 shows 90%, brightgreen).
    shown = round(percent)
    return badge(label=label, message=f"{shown}%", color=coverage_color(percent=shown))


def read_percent(path: Path, keys: tuple[str, ...]) -> float | None:
    """Follow `keys` into a JSON report; None if missing, truncated or malformed."""
    if not path.is_file():
        return None
    try:
        value: object = json.loads(path.read_text(encoding="utf-8"))
    except ValueError:
        return None
    for key in keys:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    if isinstance(value, bool) or not isinstance(value, int | float):
        return None
    return float(value)


def backend_percent(path: Path) -> float | None:
    """coverage.py JSON report: totals.percent_covered."""
    return read_percent(path=path, keys=("totals", "percent_covered"))


def frontend_percent(path: Path) -> float | None:
    """Vitest json-summary report: total.lines.pct."""
    return read_percent(path=path, keys=("total", "lines", "pct"))


def badge(label: str, message: str, color: str) -> dict[str, object]:
    return {"schemaVersion": 1, "label": label, "message": message, "color": color}


def main(argv: list[str]) -> int:
    reports_dir, badges_dir = Path(argv[0]), Path(argv[1])
    outputs = {
        "test-badge.json": build_test_badge(reports=[reports_dir / name for name in JUNIT_FILES]),
        "coverage-backend-badge.json": coverage_badge(
            label="coverage (backend)", percent=backend_percent(path=reports_dir / BACKEND_COVERAGE)
        ),
        "coverage-frontend-badge.json": coverage_badge(
            label="coverage (frontend)",
            percent=frontend_percent(path=reports_dir / FRONTEND_COVERAGE),
        ),
    }
    badges_dir.mkdir(parents=True, exist_ok=True)
    for filename, content in outputs.items():
        (badges_dir / filename).write_text(json.dumps(content) + "\n", encoding="utf-8")
        print(f"{filename}: {content['message']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(argv=sys.argv[1:]))
