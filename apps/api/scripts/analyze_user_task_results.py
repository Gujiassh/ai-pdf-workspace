from __future__ import annotations

import argparse
import json
from pathlib import Path

from ai_pdf_api.services.user_task_validation import (
    UserTaskValidationDataError,
    load_user_task_results,
    summarize_user_task_results,
)

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATASET = REPO_ROOT / "docs" / "research" / "user-task-results.csv"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate and summarize the anonymous complex-PDF user task CSV."
    )
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    try:
        report = summarize_user_task_results(load_user_task_results(args.dataset))
    except (OSError, UserTaskValidationDataError) as error:
        parser.error(str(error))

    report["dataset"] = str(args.dataset)
    encoded = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)


if __name__ == "__main__":
    main()
