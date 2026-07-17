from __future__ import annotations

import argparse
import json
from pathlib import Path

from ai_pdf_api.db.session import SessionLocal
from ai_pdf_api.services.providers import get_embedding_provider
from ai_pdf_api.services.retrieval_eval import load_evaluation_cases
from ai_pdf_api.services.retrieval_production_eval import evaluate_production_strategies

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DATASET = REPO_ROOT / "docs" / "evals" / "retrieval-v1.jsonl"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate production PostgreSQL dense and hybrid retrieval paths."
    )
    parser.add_argument("--workspace-id", required=True)
    parser.add_argument("--dataset", type=Path, default=DEFAULT_DATASET)
    parser.add_argument("--top-k", type=int, default=6)
    parser.add_argument("--candidate-k", type=int, default=24)
    parser.add_argument("--rrf-constant", type=int, default=60)
    parser.add_argument("--warmup-runs", type=int, default=1)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--concurrency-repetitions", type=int, default=1)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    report = evaluate_production_strategies(
        SessionLocal,
        args.workspace_id,
        load_evaluation_cases(args.dataset),
        get_embedding_provider(),
        top_k=args.top_k,
        candidate_k=args.candidate_k,
        rrf_constant=args.rrf_constant,
        warmup_runs=args.warmup_runs,
        concurrency=args.concurrency,
        concurrency_repetitions=args.concurrency_repetitions,
    )
    report["dataset"] = str(args.dataset)
    encoded = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(encoded + "\n", encoding="utf-8")
    print(encoded)
    if report["concurrency"]["strategies"]["dense"]["errorCount"] or report[
        "concurrency"
    ]["strategies"]["hybrid"]["errorCount"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
