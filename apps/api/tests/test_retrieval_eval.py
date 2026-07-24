import json
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from ai_pdf_api.db.base import Base
from ai_pdf_api.models import (
    Asset,
    AssetRepresentation,
    ContentUnit,
    ContentUnitEmbedding,
    EvidenceLocator,
    PdfLocatorDetail,
    PdfPage,
    User,
    Workspace,
)
from ai_pdf_api.services.retrieval_experiments import Candidate, LexicalCorpus, LexicalRecord, _tokenize, rrf_merge
from ai_pdf_api.services.retrieval_eval import (
    EvaluationDataError,
    EvaluationCase,
    EvaluationLabel,
    calculate_case_metrics,
    load_evaluation_cases,
    summarize_metrics,
)
from ai_pdf_api.services.retrieval_production_eval import (
    _build_verdict,
    evaluate_production_strategies,
)


class FakeProductionEmbeddingProvider:
    provider = "fake"
    model = "fake-embedding"
    dimensions = 3
    version = "fake-v1"

    def embed_query(self, _text: str) -> list[float]:
        return [1.0, 0.0, 0.0]

    def embed_assets(self, texts: list[str]) -> list[list[float]]:
        return [[1.0, 0.0, 0.0] for _ in texts]


def test_calculate_case_metrics_deduplicates_pages_before_scoring() -> None:
    metrics = calculate_case_metrics(
        [("doc-a", 1), ("doc-a", 1), ("doc-b", 2), ("doc-a", 3)],
        {("doc-a", 1), ("doc-a", 3)},
        top_k=3,
    )

    assert metrics["recallAtK"] == 1.0
    assert metrics["mrr"] == 1.0
    assert metrics["citationHitAtK"] == 1.0
    assert 0.9 < metrics["ndcgAtK"] < 1.0


def test_summarize_metrics_reports_mean_and_tail_latency() -> None:
    summary = summarize_metrics(
        [
            {"recallAtK": 1.0, "mrr": 1.0, "ndcgAtK": 1.0, "citationHitAtK": 1.0},
            {"recallAtK": 0.0, "mrr": 0.0, "ndcgAtK": 0.0, "citationHitAtK": 0.0},
        ],
        [10.0, 30.0],
    )

    assert summary["recallAtK"] == 0.5
    assert summary["mrr"] == 0.5
    assert summary["latencyMs"] == {"mean": 20.0, "p50": 10.0, "p95": 30.0, "max": 30.0}


def test_load_evaluation_cases_validates_jsonl_labels(tmp_path) -> None:
    dataset = tmp_path / "eval.jsonl"
    dataset.write_text(
        json.dumps(
            {
                "id": "case-1",
                "query": "What is the answer?",
                "relevant": [{"sourceFilename": "source.pdf", "pages": [2, 4]}],
            }
        )
        + "\n",
        encoding="utf-8",
    )

    cases = load_evaluation_cases(dataset)

    assert cases[0].case_id == "case-1"
    assert cases[0].relevant[0].pages == frozenset({2, 4})


def test_load_evaluation_cases_rejects_duplicate_ids(tmp_path) -> None:
    dataset = tmp_path / "eval.jsonl"
    row = {
        "id": "case-1",
        "query": "Question",
        "relevant": [{"sourceFilename": "source.pdf", "pages": [1]}],
    }
    dataset.write_text(json.dumps(row) + "\n" + json.dumps(row) + "\n", encoding="utf-8")

    with pytest.raises(EvaluationDataError, match="Duplicate evaluation case id"):
        load_evaluation_cases(dataset)


def test_lexical_corpus_ranks_exact_terms_and_cjk_bigrams() -> None:
    corpus = LexicalCorpus(
        [
            LexicalRecord(
                content_unit_id="chunk-a",
                asset_id="doc-a",
                source_filename="a.pdf",
                page_number=1,
                tokens=tuple(_tokenize("需求工程的核心活动")),
            ),
            LexicalRecord(
                content_unit_id="chunk-b", asset_id="doc-b", source_filename="b.pdf", page_number=1, tokens=("项目", "管理")
            ),
        ]
    )

    results = corpus.rank("需求工程", limit=2)

    assert results[0].page_key == ("doc-a", 1)


def test_rrf_promotes_candidates_shared_by_dense_and_lexical() -> None:
    dense = [
        Candidate("doc-a", "a.pdf", 1, 0.9),
        Candidate("doc-b", "b.pdf", 1, 0.8),
    ]
    lexical = [
        Candidate("doc-b", "b.pdf", 1, 4.0),
        Candidate("doc-c", "c.pdf", 1, 3.0),
    ]

    merged = rrf_merge(dense, lexical, limit=3)

    assert [candidate.page_key for candidate in merged] == [("doc-b", 1), ("doc-a", 1), ("doc-c", 1)]


def test_production_evaluation_uses_independent_sessions_and_reports_concurrency(tmp_path) -> None:
    engine = create_engine(
        f"sqlite:///{tmp_path / 'retrieval-eval.db'}",
        connect_args={"check_same_thread": False},
        future=True,
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, future=True)
    now = datetime.now(UTC)
    user = User(
        id=str(uuid4()),
        email="eval@example.com",
        name="Eval",
        password_hash="hash",
        avatar_url="https://example.com/avatar.svg",
    )
    workspace = Workspace(
        id=str(uuid4()),
        name="Eval workspace",
        created_by_user_id=user.id,
        created_at=now,
        updated_at=now,
    )
    asset = Asset(
        id=str(uuid4()),
        asset_kind="pdf",
        workspace_id=workspace.id,
        created_by_user_id=user.id,
        title="source.pdf",
        source_filename="source.pdf",
        object_key="source.pdf",
        mime_type="application/pdf",
        byte_size=10,
        status="ready",
        current_index_version=1,
        created_at=now,
        updated_at=now,
    )
    representation = AssetRepresentation(
        id=str(uuid4()),
        workspace_id=workspace.id,
        asset_id=asset.id,
        representation_kind="pdf_text_legacy",
        processing_generation=1,
        generator_version="fixture-parser-v1",
        created_at=now,
    )
    page = PdfPage(
        id=str(uuid4()),
        workspace_id=workspace.id,
        asset_id=asset.id,
        representation_id=representation.id,
        page_number=1,
        extracted_text="retrieval evidence",
        char_count=18,
        created_at=now,
    )
    locator = EvidenceLocator(
        id=str(uuid4()),
        workspace_id=workspace.id,
        asset_id=asset.id,
        locator_kind="pdf_page",
        locator_version=1,
        processing_generation_snapshot=1,
        representation_id_snapshot=representation.id,
        created_at=now,
    )
    detail = PdfLocatorDetail(locator_id=locator.id, page_id=page.id, page_number=1)
    chunk = ContentUnit(
        id=str(uuid4()),
        workspace_id=workspace.id,
        asset_id=asset.id,
        representation_id=representation.id,
        source_locator_id=locator.id,
        unit_kind="pdf_text_chunk",
        unit_order=0,
        text_content="retrieval evidence",
        token_count=2,
        char_start=0,
        char_end=18,
        index_version=1,
        created_at=now,
    )
    embedding = ContentUnitEmbedding(
        workspace_id=workspace.id,
        asset_id=asset.id,
        content_unit_id=chunk.id,
        processing_generation=1,
        index_version=1,
        is_current=True,
        embedding_space="text",
        provider="fake",
        model="fake-embedding",
        dimensions=3,
        version="fake-v1",
        embedding=[1.0, 0.0, 0.0],
        created_at=now,
    )
    workspace_id = workspace.id
    with factory() as db:
        db.add_all([user, workspace, asset, representation, page, locator, detail, chunk, embedding])
        db.commit()

    report = evaluate_production_strategies(
        factory,
        workspace_id,
        [
            EvaluationCase(
                case_id="case-1",
                query="retrieval evidence",
                relevant=(
                    EvaluationLabel(
                        source_filename="source.pdf",
                        pages=frozenset({1}),
                    ),
                ),
            )
        ],
        FakeProductionEmbeddingProvider(),
        top_k=1,
        candidate_k=2,
        rrf_constant=60,
        warmup_runs=1,
        concurrency=2,
        concurrency_repetitions=2,
    )

    assert report["strategies"]["dense"]["metrics"]["recallAtK"] == 1.0
    assert report["strategies"]["hybrid"]["metrics"]["recallAtK"] == 1.0
    assert report["concurrency"]["strategies"]["dense"]["requestCount"] == 2
    assert report["concurrency"]["strategies"]["hybrid"]["errorCount"] == 0
    assert report["concurrency"]["strategies"]["hybrid"]["resultDriftCount"] == 0
    for strategy in ("dense", "hybrid"):
        metrics = report["strategies"][strategy]["metrics"]
        assert metrics["retrievalLatencyMs"]["p95"] >= 0
        assert metrics["endToEndLatencyMs"]["p95"] >= metrics["retrievalLatencyMs"]["p95"]


def test_production_verdict_uses_deterministic_quality_latency_and_stability_thresholds() -> None:
    def strategy(recall: float, citation_hit: float, p95: float) -> dict[str, object]:
        return {
            "metrics": {
                "recallAtK": recall,
                "citationHitAtK": citation_hit,
                "endToEndLatencyMs": {"p95": p95},
            }
        }

    stable = {
        "dense": {"errorCount": 0, "resultDriftCount": 0},
        "hybrid": {"errorCount": 0, "resultDriftCount": 0},
    }
    passing = _build_verdict(
        {
            "dense": strategy(0.70, 0.80, 100.0),
            "hybrid": strategy(0.74, 0.84, 200.0),
        },
        stable,
    )
    too_slow = _build_verdict(
        {
            "dense": strategy(0.70, 0.80, 100.0),
            "hybrid": strategy(0.74, 0.84, 200.001),
        },
        stable,
    )
    unstable = _build_verdict(
        {
            "dense": strategy(0.70, 0.80, 100.0),
            "hybrid": strategy(0.74, 0.84, 150.0),
        },
        {
            **stable,
            "hybrid": {"errorCount": 0, "resultDriftCount": 1},
        },
    )

    assert passing["qualityPassed"] is True
    assert passing["latencyPassed"] is True
    assert passing["concurrencyPassed"] is True
    assert passing["eligibleForDefaultHybrid"] is True
    assert too_slow["latencyPassed"] is False
    assert too_slow["eligibleForDefaultHybrid"] is False
    assert unstable["concurrencyPassed"] is False
    assert unstable["eligibleForDefaultHybrid"] is False
