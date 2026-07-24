from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

from ai_pdf_api.services.user_task_validation import (
    UserTaskValidationDataError,
    load_user_task_manifest,
    load_user_task_results,
    summarize_user_task_results,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATASET = REPO_ROOT / "docs" / "research" / "user-task-results-template.csv"
DEFAULT_MANIFEST = (
    REPO_ROOT / "docs" / "research" / "user-task-validation-manifest-template.json"
)

EXIT_CODES = {"pass": 0, "fail": 1, "not_evaluable": 2, "invalid": 3}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate M404 user-task qualifications and task-result evidence."
    )
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    try:
        report = summarize_user_task_results(
            load_user_task_results(args.dataset),
            load_user_task_manifest(args.manifest),
        )
    except (OSError, UserTaskValidationDataError) as error:
        report = {
            "schemaVersion": "user-task-validation-v2",
            "status": "invalid",
            "userValueValidated": False,
            "productStage": "internal_preview",
            "error": str(error),
        }

    report["dataset"] = _report_path(args.dataset)
    report["manifest"] = _report_path(args.manifest)
    encoded = _encode(report)
    if args.output:
        try:
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(encoded + "\n", encoding="utf-8")
        except OSError as error:
            report = {
                "schemaVersion": "user-task-validation-v2",
                "status": "invalid",
                "userValueValidated": False,
                "productStage": "internal_preview",
                "dataset": _report_path(args.dataset),
                "manifest": _report_path(args.manifest),
                "error": str(error),
            }
            encoded = _encode(report)
    print(encoded)
    return EXIT_CODES[report["status"]]


def _encode(report: dict[str, Any]) -> str:
    return json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)


def _report_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return resolved.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(resolved)


if __name__ == "__main__":
    sys.exit(main())
