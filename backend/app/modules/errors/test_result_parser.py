"""Mirrors: backend/src/modules/errors/test-result-parser.ts"""
import re
from dataclasses import dataclass

_SUMMARY_RE = re.compile(r"(\d+)\s+tests?.*?(\d+)\s+passed.*?(\d+)\s+failed", re.IGNORECASE | re.DOTALL)

# pytest -v output lines look like:
#   tests/integration/test_checkout.py::test_full_order PASSED [ 40%]
#   tests/unit/test_math.py::test_add FAILED
_PYTEST_VERBOSE_LINE_RE = re.compile(
    r"^(?P<path>[\w\-/\\.]+\.py)::(?P<name>[\w\[\]\-.]+)\s+(?P<outcome>PASSED|FAILED|SKIPPED|ERROR)\b",
    re.MULTILINE,
)


@dataclass
class TestSummary:
    total: int
    passed: int
    failed: int
    skipped: int
    status: str


@dataclass
class TestCategoryCounts:
    total: int = 0
    passed: int = 0
    failed: int = 0


def parse_generic_test_output(stdout: str, stderr: str, exit_code: int) -> TestSummary:
    combined = f"{stdout}\n{stderr}"
    if re.search(r"(?:Ran\s+0\s+tests?|NO\s+TESTS\s+RAN|no\s+tests?\s+(?:found|ran))", combined, re.IGNORECASE):
        return TestSummary(total=0, passed=0, failed=0, skipped=0, status="NO_TESTS")

    match = _SUMMARY_RE.search(combined)
    status = "PASSED" if exit_code == 0 else "FAILED"

    if match:
        return TestSummary(
            total=int(match.group(1)),
            passed=int(match.group(2)),
            failed=int(match.group(3)),
            skipped=0,
            status=status,
        )

    return TestSummary(
        total=1,
        passed=1 if exit_code == 0 else 0,
        failed=0 if exit_code == 0 else 1,
        skipped=0,
        status=status,
    )


def _category_for_path(path: str) -> str:
    """Heuristic, path-based only -- no marker/tag parsing (that would need
    reading the project's own pytest.ini/pyproject.toml marker registry,
    which varies per project). Honest gap: a project that doesn't follow
    the tests/integration/, tests/api/, tests/unit/ (or test_integration_*,
    test_api_*) naming convention falls into "unit" by default rather than
    being miscategorized as something more specific than we can tell."""
    lowered = path.lower()
    if "integration" in lowered:
        return "integration"
    if "e2e" in lowered or "/api/" in lowered or "test_api" in lowered or lowered.startswith("api"):
        return "api"
    return "unit"


def categorize_test_output(stdout: str) -> dict[str, TestCategoryCounts]:
    """Phase 8 (Job: test-type categorization): buckets pytest -v's
    per-test result lines by unit/integration/api using the path heuristic
    above. Returns {} (not fabricated zeros) when the output isn't in
    pytest -v's format at all -- e.g. Go/Rust/JS test commands, or Python
    output when pytest wasn't actually used -- so the UI can show "not
    available for this test runner" honestly instead of a fake all-zero
    breakdown."""
    matches = list(_PYTEST_VERBOSE_LINE_RE.finditer(stdout))
    if not matches:
        return {}

    buckets: dict[str, TestCategoryCounts] = {
        "unit": TestCategoryCounts(), "integration": TestCategoryCounts(), "api": TestCategoryCounts(),
    }
    for m in matches:
        category = _category_for_path(m.group("path"))
        counts = buckets[category]
        counts.total += 1
        if m.group("outcome") == "PASSED":
            counts.passed += 1
        elif m.group("outcome") == "FAILED":
            counts.failed += 1
    return buckets
