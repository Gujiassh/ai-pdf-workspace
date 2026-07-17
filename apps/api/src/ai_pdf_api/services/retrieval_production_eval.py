from __future__ import annotations

import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ai_pdf_api.core.settings import RetrievalStrategy
from ai_pdf_api.models import Document
from ai_pdf_api.services.providers import EmbeddingProvider
from ai_pdf_api.services.retrieval import RetrievedChunk, retrieve_query_chunks
from ai_pdf_api.services.retrieval_eval import (
    EvaluationCase,
    EvaluationDataError,
    PageKey,
    calculate_case_metrics,
    summarize_latencies,
    summarize_metrics,
)

SessionFactory = Callable[[], Session]


@dataclass(frozen=True)
class PreparedCase:
    case: EvaluationCase
    relevant_keys: frozenset[PageKey]
    query_embedding: list[float]
    embedding_latency_ms: float


def evaluate_production_strategies(
    session_factory: SessionFactory,
    workspace_id: str,
    cases: list[EvaluationCase],
    provider: EmbeddingProvider,
    *,
    top_k: int,
    candidate_k: int,
    rrf_constant: int,
    warmup_runs: int,
    concurrency: int,
    concurrency_repetitions: int,
) -> dict[str, Any]:
    _validate_options(
        cases,
        top_k=top_k,
        candidate_k=candidate_k,
        rrf_constant=rrf_constant,
        warmup_runs=warmup_runs,
        concurrency=concurrency,
        concurrency_repetitions=concurrency_repetitions,
    )
    relevant_by_case = _resolve_relevant_keys(session_factory, workspace_id, cases)
    _warm_up(
        session_factory,
        workspace_id,
        cases[0],
        provider,
        top_k=top_k,
        candidate_k=candidate_k,
        rrf_constant=rrf_constant,
        runs=warmup_runs,
    )
    prepared_cases = _prepare_cases(cases, relevant_by_case, provider)

    strategy_reports: dict[RetrievalStrategy, dict[str, Any]] = {}
    expected_results: dict[RetrievalStrategy, dict[str, tuple[PageKey, ...]]] = {}
    for strategy in ("dense", "hybrid"):
        report, signatures = _evaluate_strategy(
            session_factory,
            workspace_id,
            prepared_cases,
            provider,
            strategy=strategy,
            top_k=top_k,
            candidate_k=candidate_k,
            rrf_constant=rrf_constant,
        )
        strategy_reports[strategy] = report
        expected_results[strategy] = signatures

    concurrency_reports = {
        strategy: _evaluate_concurrency(
            session_factory,
            workspace_id,
            prepared_cases,
            provider,
            strategy=strategy,
            top_k=top_k,
            candidate_k=candidate_k,
            rrf_constant=rrf_constant,
            concurrency=concurrency,
            repetitions=concurrency_repetitions,
            expected_results=expected_results[strategy],
        )
        for strategy in ("dense", "hybrid")
    }
    verdict = _build_verdict(strategy_reports, concurrency_reports)

    return {
        "schemaVersion": "production-retrieval-eval-v1",
        "workspaceId": workspace_id,
        "topK": top_k,
        "candidateK": candidate_k,
        "rrfConstant": rrf_constant,
        "queryCount": len(cases),
        "warmupRuns": warmup_runs,
        "embedding": {
            "provider": provider.provider,
            "model": provider.model,
            "dimensions": provider.dimensions,
            "version": provider.version,
            "latencyMs": summarize_latencies(
                [prepared.embedding_latency_ms for prepared in prepared_cases]
            ),
        },
        "strategies": strategy_reports,
        "concurrency": {
            "workers": concurrency,
            "repetitions": concurrency_repetitions,
            "strategies": concurrency_reports,
        },
        "verdict": verdict,
    }


def _validate_options(
    cases: list[EvaluationCase],
    *,
    top_k: int,
    candidate_k: int,
    rrf_constant: int,
    warmup_runs: int,
    concurrency: int,
    concurrency_repetitions: int,
) -> None:
    if not cases:
        raise ValueError("evaluation cases must not be empty")
    if top_k < 1 or candidate_k < top_k:
        raise ValueError("candidate_k must be greater than or equal to positive top_k")
    if rrf_constant < 1:
        raise ValueError("rrf_constant must be positive")
    if warmup_runs < 0:
        raise ValueError("warmup_runs must not be negative")
    if concurrency < 1 or concurrency_repetitions < 1:
        raise ValueError("concurrency and concurrency_repetitions must be positive")


def _resolve_relevant_keys(
    session_factory: SessionFactory,
    workspace_id: str,
    cases: list[EvaluationCase],
) -> dict[str, frozenset[PageKey]]:
    with session_factory() as db:
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

    resolved: dict[str, frozenset[PageKey]] = {}
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
        resolved[case.case_id] = frozenset(relevant_keys)
    return resolved


def _warm_up(
    session_factory: SessionFactory,
    workspace_id: str,
    case: EvaluationCase,
    provider: EmbeddingProvider,
    *,
    top_k: int,
    candidate_k: int,
    rrf_constant: int,
    runs: int,
) -> None:
    for _ in range(runs):
        query_embedding = provider.embed_query(case.query)
        for strategy in ("dense", "hybrid"):
            with session_factory() as db:
                retrieve_query_chunks(
                    db,
                    workspace_id,
                    case.query,
                    query_embedding,
                    embedding_provider=provider,
                    limit=top_k,
                    strategy=strategy,
                    candidate_limit=candidate_k,
                    rrf_constant=rrf_constant,
                )


def _prepare_cases(
    cases: list[EvaluationCase],
    relevant_by_case: dict[str, frozenset[PageKey]],
    provider: EmbeddingProvider,
) -> list[PreparedCase]:
    prepared: list[PreparedCase] = []
    for case in cases:
        started = time.perf_counter()
        query_embedding = provider.embed_query(case.query)
        prepared.append(
            PreparedCase(
                case=case,
                relevant_keys=relevant_by_case[case.case_id],
                query_embedding=query_embedding,
                embedding_latency_ms=_elapsed_ms(started),
            )
        )
    return prepared


def _evaluate_strategy(
    session_factory: SessionFactory,
    workspace_id: str,
    prepared_cases: list[PreparedCase],
    provider: EmbeddingProvider,
    *,
    strategy: RetrievalStrategy,
    top_k: int,
    candidate_k: int,
    rrf_constant: int,
) -> tuple[dict[str, Any], dict[str, tuple[PageKey, ...]]]:
    metrics: list[dict[str, float]] = []
    retrieval_latencies: list[float] = []
    end_to_end_latencies: list[float] = []
    case_reports: list[dict[str, Any]] = []
    signatures: dict[str, tuple[PageKey, ...]] = {}
    for prepared in prepared_cases:
        with session_factory() as db:
            started = time.perf_counter()
            chunks = retrieve_query_chunks(
                db,
                workspace_id,
                prepared.case.query,
                prepared.query_embedding,
                embedding_provider=provider,
                limit=top_k,
                strategy=strategy,
                candidate_limit=candidate_k,
                rrf_constant=rrf_constant,
            )
            retrieval_latency_ms = _elapsed_ms(started)
            ranked_pages = _ranked_pages(chunks)
            ranked_results = [
                {
                    "rank": rank,
                    "documentId": item.document.id,
                    "sourceFilename": item.document.source_filename,
                    "pageNumber": item.page.page_number,
                    "distance": float(item.distance),
                    "relevant": (item.document.id, item.page.page_number)
                    in prepared.relevant_keys,
                }
                for rank, item in enumerate(ranked_pages, start=1)
            ]
        page_keys = tuple(
            (item.document.id, item.page.page_number) for item in ranked_pages
        )
        signatures[prepared.case.case_id] = page_keys
        case_metrics = calculate_case_metrics(
            list(page_keys),
            set(prepared.relevant_keys),
            top_k=top_k,
        )
        metrics.append(case_metrics)
        retrieval_latencies.append(retrieval_latency_ms)
        end_to_end_latency_ms = prepared.embedding_latency_ms + retrieval_latency_ms
        end_to_end_latencies.append(end_to_end_latency_ms)
        case_reports.append(
            {
                "id": prepared.case.case_id,
                "query": prepared.case.query,
                "metrics": case_metrics,
                "embeddingLatencyMs": prepared.embedding_latency_ms,
                "retrievalLatencyMs": retrieval_latency_ms,
                "endToEndLatencyMs": end_to_end_latency_ms,
                "results": ranked_results,
            }
        )
    summary = summarize_metrics(metrics, retrieval_latencies)
    summary["retrievalLatencyMs"] = summary.pop("latencyMs")
    summary["endToEndLatencyMs"] = summarize_latencies(end_to_end_latencies)
    return {"metrics": summary, "cases": case_reports}, signatures


def _evaluate_concurrency(
    session_factory: SessionFactory,
    workspace_id: str,
    prepared_cases: list[PreparedCase],
    provider: EmbeddingProvider,
    *,
    strategy: RetrievalStrategy,
    top_k: int,
    candidate_k: int,
    rrf_constant: int,
    concurrency: int,
    repetitions: int,
    expected_results: dict[str, tuple[PageKey, ...]],
) -> dict[str, Any]:
    jobs = [prepared for _ in range(repetitions) for prepared in prepared_cases]
    latencies: list[float] = []
    errors: list[str] = []
    result_drift_count = 0
    wall_started = time.perf_counter()
    with ThreadPoolExecutor(max_workers=concurrency) as executor:
        futures = {
            executor.submit(
                _run_concurrent_query,
                session_factory,
                workspace_id,
                prepared,
                provider,
                strategy=strategy,
                top_k=top_k,
                candidate_k=candidate_k,
                rrf_constant=rrf_constant,
            ): prepared.case.case_id
            for prepared in jobs
        }
        for future in as_completed(futures):
            case_id = futures[future]
            try:
                latency_ms, page_keys = future.result()
            except Exception as error:  # noqa: BLE001 - the report must retain worker failures
                errors.append(type(error).__name__)
                continue
            latencies.append(latency_ms)
            if page_keys != expected_results[case_id]:
                result_drift_count += 1
    wall_ms = _elapsed_ms(wall_started)
    completed = len(latencies)
    return {
        "requestCount": len(jobs),
        "completedCount": completed,
        "errorCount": len(errors),
        "errorTypes": sorted(set(errors)),
        "resultDriftCount": result_drift_count,
        "latencyMs": summarize_latencies(latencies) if latencies else None,
        "wallMs": wall_ms,
        "throughputPerSecond": completed / (wall_ms / 1000) if wall_ms > 0 else 0.0,
    }


def _run_concurrent_query(
    session_factory: SessionFactory,
    workspace_id: str,
    prepared: PreparedCase,
    provider: EmbeddingProvider,
    *,
    strategy: RetrievalStrategy,
    top_k: int,
    candidate_k: int,
    rrf_constant: int,
) -> tuple[float, tuple[PageKey, ...]]:
    with session_factory() as db:
        started = time.perf_counter()
        chunks = retrieve_query_chunks(
            db,
            workspace_id,
            prepared.case.query,
            prepared.query_embedding,
            embedding_provider=provider,
            limit=top_k,
            strategy=strategy,
            candidate_limit=candidate_k,
            rrf_constant=rrf_constant,
        )
        latency_ms = _elapsed_ms(started)
        page_keys = tuple(
            (item.document.id, item.page.page_number) for item in _ranked_pages(chunks)
        )
    return latency_ms, page_keys


def _ranked_pages(chunks: list[RetrievedChunk]) -> list[RetrievedChunk]:
    pages: dict[PageKey, RetrievedChunk] = {}
    for item in chunks:
        pages.setdefault((item.document.id, item.page.page_number), item)
    return list(pages.values())


def _build_verdict(
    strategy_reports: dict[RetrievalStrategy, dict[str, Any]],
    concurrency_reports: dict[RetrievalStrategy, dict[str, Any]],
) -> dict[str, Any]:
    dense_metrics = strategy_reports["dense"]["metrics"]
    hybrid_metrics = strategy_reports["hybrid"]["metrics"]
    recall_gain = hybrid_metrics["recallAtK"] - dense_metrics["recallAtK"]
    citation_gain = hybrid_metrics["citationHitAtK"] - dense_metrics["citationHitAtK"]
    dense_p95 = dense_metrics["endToEndLatencyMs"]["p95"]
    hybrid_p95 = hybrid_metrics["endToEndLatencyMs"]["p95"]
    quality_passed = (
        hybrid_metrics["recallAtK"] >= dense_metrics["recallAtK"]
        and hybrid_metrics["citationHitAtK"] >= dense_metrics["citationHitAtK"]
        and recall_gain >= 0.03
        and citation_gain >= 0.03
    )
    latency_passed = hybrid_p95 <= dense_p95 * 2 and hybrid_p95 - dense_p95 <= 100
    concurrency_passed = all(
        report["errorCount"] == 0 and report["resultDriftCount"] == 0
        for report in concurrency_reports.values()
    )
    return {
        "recallGain": recall_gain,
        "citationHitGain": citation_gain,
        "hybridEndToEndP95Ratio": hybrid_p95 / dense_p95 if dense_p95 > 0 else None,
        "hybridEndToEndP95AbsoluteIncreaseMs": hybrid_p95 - dense_p95,
        "qualityPassed": quality_passed,
        "latencyPassed": latency_passed,
        "concurrencyPassed": concurrency_passed,
        "eligibleForDefaultHybrid": quality_passed and latency_passed and concurrency_passed,
    }


def _elapsed_ms(started: float) -> float:
    return (time.perf_counter() - started) * 1000
