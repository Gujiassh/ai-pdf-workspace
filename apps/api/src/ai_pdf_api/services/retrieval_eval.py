from __future__ import annotations

import json
import math
import time
from dataclasses import dataclass
from pathlib import Path
from statistics import fmean
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ai_pdf_api.models import Document
from ai_pdf_api.services.providers import EmbeddingProvider
from ai_pdf_api.services.retrieval import RetrievedChunk, retrieve_chunks


PageKey = tuple[str, int]


@dataclass(frozen=True)
class EvaluationLabel:
    source_filename: str
    pages: frozenset[int]


@dataclass(frozen=True)
class EvaluationCase:
    case_id: str
    query: str
    relevant: tuple[EvaluationLabel, ...]


class EvaluationDataError(ValueError):
    pass


def load_evaluation_cases(path: Path) -> list[EvaluationCase]:
    cases: list[EvaluationCase] = []
    seen_ids: set[str] = set()
    for line_number, raw_line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not raw_line.strip():
            continue
        try:
            payload = json.loads(raw_line)
        except json.JSONDecodeError as error:
            raise EvaluationDataError(f"Invalid JSON at {path}:{line_number}.") from error
        if not isinstance(payload, dict):
            raise EvaluationDataError(f"Evaluation case at {path}:{line_number} must be an object.")

        case_id = payload.get("id")
        query = payload.get("query")
        raw_relevant = payload.get("relevant")
        if not isinstance(case_id, str) or not case_id.strip():
            raise EvaluationDataError(f"Evaluation case at {path}:{line_number} has no non-empty id.")
        if case_id in seen_ids:
            raise EvaluationDataError(f"Duplicate evaluation case id {case_id!r} at {path}:{line_number}.")
        if not isinstance(query, str) or not query.strip():
            raise EvaluationDataError(f"Evaluation case {case_id!r} has no non-empty query.")
        if not isinstance(raw_relevant, list) or not raw_relevant:
            raise EvaluationDataError(f"Evaluation case {case_id!r} must contain relevant labels.")

        labels: list[EvaluationLabel] = []
        seen_sources: set[str] = set()
        for label in raw_relevant:
            if not isinstance(label, dict):
                raise EvaluationDataError(f"Evaluation case {case_id!r} has an invalid relevant label.")
            source_filename = label.get("sourceFilename")
            pages = label.get("pages")
            if not isinstance(source_filename, str) or not source_filename.strip():
                raise EvaluationDataError(f"Evaluation case {case_id!r} has an invalid sourceFilename.")
            if source_filename in seen_sources:
                raise EvaluationDataError(f"Evaluation case {case_id!r} repeats sourceFilename {source_filename!r}.")
            if (
                not isinstance(pages, list)
                or not pages
                or any(isinstance(page, bool) or not isinstance(page, int) or page < 1 for page in pages)
                or len(set(pages)) != len(pages)
            ):
                raise EvaluationDataError(f"Evaluation case {case_id!r} has invalid page labels.")
            labels.append(EvaluationLabel(source_filename=source_filename, pages=frozenset(pages)))
            seen_sources.add(source_filename)

        cases.append(EvaluationCase(case_id=case_id, query=query.strip(), relevant=tuple(labels)))
        seen_ids.add(case_id)

    if not cases:
        raise EvaluationDataError(f"Evaluation dataset {path} is empty.")
    return cases


def calculate_case_metrics(
    retrieved: list[PageKey],
    relevant: set[PageKey],
    *,
    top_k: int,
) -> dict[str, float]:
    if top_k < 1:
        raise ValueError("top_k must be positive")
    if not relevant:
        raise ValueError("relevant labels must not be empty")

    unique_retrieved = list(dict.fromkeys(retrieved))
    ranked = unique_retrieved[:top_k]
    hits = [rank for rank, key in enumerate(ranked, start=1) if key in relevant]
    recall = len(set(ranked) & relevant) / len(relevant)
    reciprocal_rank = 1.0 / hits[0] if hits else 0.0
    dcg = sum(1.0 / math.log2(rank + 1) for rank in hits)
    ideal_hit_count = min(top_k, len(relevant))
    ideal_dcg = sum(1.0 / math.log2(rank + 1) for rank in range(1, ideal_hit_count + 1))
    ndcg = dcg / ideal_dcg if ideal_dcg else 0.0
    return {
        "recallAtK": recall,
        "mrr": reciprocal_rank,
        "ndcgAtK": ndcg,
        "citationHitAtK": 1.0 if hits else 0.0,
    }


def summarize_metrics(case_metrics: list[dict[str, float]], latencies_ms: list[float]) -> dict[str, Any]:
    if not case_metrics or not latencies_ms or len(case_metrics) != len(latencies_ms):
        raise ValueError("case metrics and latencies must have the same non-zero length")
    return {
        "recallAtK": fmean(item["recallAtK"] for item in case_metrics),
        "mrr": fmean(item["mrr"] for item in case_metrics),
        "ndcgAtK": fmean(item["ndcgAtK"] for item in case_metrics),
        "citationHitAtK": fmean(item["citationHitAtK"] for item in case_metrics),
        "latencyMs": summarize_latencies(latencies_ms),
    }


def summarize_latencies(latencies_ms: list[float]) -> dict[str, float]:
    if not latencies_ms:
        raise ValueError("latencies must not be empty")
    return {
        "mean": fmean(latencies_ms),
        "p50": _percentile(latencies_ms, 50),
        "p95": _percentile(latencies_ms, 95),
        "max": max(latencies_ms),
    }


def evaluate_dataset(
    db: Session,
    workspace_id: str,
    cases: list[EvaluationCase],
    provider: EmbeddingProvider,
    *,
    top_k: int,
) -> dict[str, Any]:
    if top_k < 1:
        raise ValueError("top_k must be positive")
    documents = db.scalars(
        select(Document).where(
            Document.workspace_id == workspace_id,
            Document.status == "ready",
            Document.deleted_at.is_(None),
        )
    ).all()
    documents_by_filename: dict[str, list[Document]] = {}
    for document in documents:
        documents_by_filename.setdefault(document.source_filename, []).append(document)

    case_results: list[dict[str, Any]] = []
    case_metrics: list[dict[str, float]] = []
    latencies_ms: list[float] = []
    for case in cases:
        relevant_keys: set[PageKey] = set()
        for label in case.relevant:
            matches = documents_by_filename.get(label.source_filename, [])
            if len(matches) != 1:
                raise EvaluationDataError(
                    f"Expected exactly one ready document named {label.source_filename!r} "
                    f"in workspace {workspace_id}; found {len(matches)}."
                )
            relevant_keys.update((matches[0].id, page) for page in label.pages)

        started = time.perf_counter()
        query_embedding = provider.embed_query(case.query)
        retrieved_chunks = retrieve_chunks(
            db,
            workspace_id,
            query_embedding,
            embedding_provider=provider,
            limit=top_k,
        )
        latency_ms = (time.perf_counter() - started) * 1000
        latencies_ms.append(latency_ms)

        ranked_page_keys: list[PageKey] = []
        ranked_results: list[dict[str, Any]] = []
        seen_page_keys: set[PageKey] = set()
        for item in retrieved_chunks:
            page_key = (item.document.id, item.page.page_number)
            if page_key in seen_page_keys:
                continue
            seen_page_keys.add(page_key)
            ranked_page_keys.append(page_key)
            ranked_results.append(
                {
                    "rank": len(ranked_results) + 1,
                    "documentId": item.document.id,
                    "sourceFilename": item.document.source_filename,
                    "pageNumber": item.page.page_number,
                    "distance": float(item.distance),
                    "relevant": page_key in relevant_keys,
                }
            )

        metrics = calculate_case_metrics(ranked_page_keys, relevant_keys, top_k=top_k)
        case_metrics.append(metrics)
        case_results.append(
            {
                "id": case.case_id,
                "query": case.query,
                "metrics": metrics,
                "latencyMs": latency_ms,
                "results": ranked_results,
            }
        )

    return {
        "schemaVersion": "retrieval-eval-v1",
        "workspaceId": workspace_id,
        "topK": top_k,
        "queryCount": len(cases),
        "embedding": {
            "provider": provider.provider,
            "model": provider.model,
            "dimensions": provider.dimensions,
            "version": provider.version,
        },
        "metrics": summarize_metrics(case_metrics, latencies_ms),
        "cases": case_results,
    }


def _percentile(values: list[float], percentile: int) -> float:
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(percentile / 100 * len(ordered)) - 1))
    return ordered[index]
