from __future__ import annotations

import math
import re
import time
from collections import Counter
from dataclasses import dataclass
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ai_pdf_api.models import Document, DocumentChunk, DocumentPage
from ai_pdf_api.services.providers import EmbeddingProvider
from ai_pdf_api.services.retrieval import retrieve_chunks
from ai_pdf_api.services.retrieval_eval import (
    EvaluationCase,
    PageKey,
    calculate_case_metrics,
    summarize_metrics,
)


_CJK_RUN = re.compile(r"[\u3400-\u9fff]+")
_LATIN_WORD = re.compile(r"[A-Za-z0-9]+")


@dataclass(frozen=True)
class Candidate:
    document_id: str
    source_filename: str
    page_number: int
    score: float

    @property
    def page_key(self) -> PageKey:
        return self.document_id, self.page_number


@dataclass(frozen=True)
class LexicalRecord:
    chunk_id: str
    document_id: str
    source_filename: str
    page_number: int
    tokens: tuple[str, ...]


class LexicalCorpus:
    def __init__(self, records: list[LexicalRecord]) -> None:
        if not records:
            raise ValueError("lexical corpus must not be empty")
        self.records = records
        self.term_frequencies = [Counter(record.tokens) for record in records]
        self.document_frequency = Counter(
            token
            for frequencies in self.term_frequencies
            for token in frequencies
        )
        self.average_document_length = sum(len(record.tokens) for record in records) / len(records)

    @classmethod
    def from_database(cls, db: Session, workspace_id: str) -> LexicalCorpus:
        rows = db.execute(
            select(DocumentChunk, Document, DocumentPage)
            .join(Document, Document.id == DocumentChunk.document_id)
            .join(DocumentPage, DocumentPage.id == DocumentChunk.page_id)
            .where(
                DocumentChunk.workspace_id == workspace_id,
                Document.workspace_id == workspace_id,
                DocumentPage.workspace_id == workspace_id,
                DocumentChunk.index_version == Document.current_index_version,
                Document.status == "ready",
                Document.deleted_at.is_(None),
            )
        ).all()
        return cls(
            [
                LexicalRecord(
                    chunk_id=chunk.id,
                    document_id=document.id,
                    source_filename=document.source_filename,
                    page_number=page.page_number,
                    tokens=tuple(_tokenize(chunk.chunk_text)),
                )
                for chunk, document, page in rows
            ]
        )

    def rank(self, query: str, limit: int) -> list[Candidate]:
        if limit < 1:
            raise ValueError("limit must be positive")
        query_tokens = Counter(_tokenize(query))
        if not query_tokens:
            return []
        document_count = len(self.records)
        scored: list[tuple[float, LexicalRecord]] = []
        for record, term_frequencies in zip(self.records, self.term_frequencies, strict=True):
            document_length = len(record.tokens)
            if document_length == 0:
                continue
            score = 0.0
            for token in query_tokens:
                term_frequency = term_frequencies.get(token, 0)
                if term_frequency == 0:
                    continue
                document_frequency = self.document_frequency[token]
                idf = math.log(1.0 + (document_count - document_frequency + 0.5) / (document_frequency + 0.5))
                denominator = term_frequency + 1.2 * (
                    1.0 - 0.75 + 0.75 * document_length / self.average_document_length
                )
                score += idf * term_frequency * 2.2 / denominator
            if score > 0:
                scored.append((score, record))

        scored.sort(key=lambda item: (-item[0], item[1].chunk_id))
        pages: dict[PageKey, Candidate] = {}
        for score, record in scored:
            candidate = Candidate(
                document_id=record.document_id,
                source_filename=record.source_filename,
                page_number=record.page_number,
                score=score,
            )
            previous = pages.get(candidate.page_key)
            if previous is None or candidate.score > previous.score:
                pages[candidate.page_key] = candidate
        return sorted(pages.values(), key=lambda item: (-item.score, item.document_id, item.page_number))[:limit]


def rrf_merge(
    dense: list[Candidate],
    lexical: list[Candidate],
    *,
    limit: int,
    constant: int = 60,
) -> list[Candidate]:
    if limit < 1 or constant < 1:
        raise ValueError("limit and constant must be positive")
    scores: Counter[PageKey] = Counter()
    candidates: dict[PageKey, Candidate] = {}
    for rank, candidate in enumerate(dense, start=1):
        scores[candidate.page_key] += 1.0 / (constant + rank)
        candidates.setdefault(candidate.page_key, candidate)
    for rank, candidate in enumerate(lexical, start=1):
        scores[candidate.page_key] += 1.0 / (constant + rank)
        candidates.setdefault(candidate.page_key, candidate)
    return [
        Candidate(
            document_id=candidates[key].document_id,
            source_filename=candidates[key].source_filename,
            page_number=candidates[key].page_number,
            score=scores[key],
        )
        for key in sorted(scores, key=lambda item: (-scores[item], item[0], item[1]))[:limit]
    ]


def compare_strategies(
    db: Session,
    workspace_id: str,
    cases: list[EvaluationCase],
    provider: EmbeddingProvider,
    *,
    top_k: int,
    candidate_k: int,
) -> dict[str, Any]:
    if candidate_k < top_k:
        raise ValueError("candidate_k must be greater than or equal to top_k")
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
    corpus = LexicalCorpus.from_database(db, workspace_id)
    strategy_results: dict[str, list[dict[str, Any]]] = {"dense": [], "lexical": [], "rrf": []}
    strategy_metrics: dict[str, list[dict[str, float]]] = {key: [] for key in strategy_results}
    strategy_latencies: dict[str, list[float]] = {key: [] for key in strategy_results}

    for case in cases:
        relevant_keys: set[PageKey] = set()
        for label in case.relevant:
            matches = documents_by_filename.get(label.source_filename, [])
            if len(matches) != 1:
                raise ValueError(
                    f"Expected exactly one ready document named {label.source_filename!r}; found {len(matches)}."
                )
            relevant_keys.update((matches[0].id, page) for page in label.pages)

        started = time.perf_counter()
        query_embedding = provider.embed_query(case.query)
        dense_chunks = retrieve_chunks(
            db,
            workspace_id,
            query_embedding,
            embedding_provider=provider,
            limit=candidate_k,
        )
        dense_candidates = _dedupe_candidates(
            [
                Candidate(
                    document_id=item.document.id,
                    source_filename=item.document.source_filename,
                    page_number=item.page.page_number,
                    score=1.0 - float(item.distance),
                )
                for item in dense_chunks
            ]
        )
        dense_latency = (time.perf_counter() - started) * 1000

        lexical_started = time.perf_counter()
        lexical_candidates = corpus.rank(case.query, candidate_k)
        lexical_latency = (time.perf_counter() - lexical_started) * 1000
        rrf_candidates = rrf_merge(dense_candidates, lexical_candidates, limit=candidate_k)
        rrf_latency = (time.perf_counter() - started) * 1000

        for name, candidates, latency in (
            ("dense", dense_candidates, dense_latency),
            ("lexical", lexical_candidates, lexical_latency),
            ("rrf", rrf_candidates, rrf_latency),
        ):
            ranked = [candidate.page_key for candidate in candidates]
            metrics = calculate_case_metrics(ranked, relevant_keys, top_k=top_k)
            strategy_metrics[name].append(metrics)
            strategy_latencies[name].append(latency)
            strategy_results[name].append(
                {
                    "id": case.case_id,
                    "query": case.query,
                    "metrics": metrics,
                    "latencyMs": latency,
                    "results": [
                        {
                            "rank": rank,
                            "sourceFilename": candidate.source_filename,
                            "pageNumber": candidate.page_number,
                            "score": candidate.score,
                            "relevant": candidate.page_key in relevant_keys,
                        }
                        for rank, candidate in enumerate(candidates[:top_k], start=1)
                    ],
                }
            )

    return {
        "schemaVersion": "retrieval-experiment-v1",
        "workspaceId": workspace_id,
        "topK": top_k,
        "candidateK": candidate_k,
        "queryCount": len(cases),
        "embedding": {
            "provider": provider.provider,
            "model": provider.model,
            "dimensions": provider.dimensions,
            "version": provider.version,
        },
        "strategies": {
            name: {
                "metrics": summarize_metrics(strategy_metrics[name], strategy_latencies[name]),
                "cases": strategy_results[name],
            }
            for name in strategy_results
        },
    }


def _dedupe_candidates(candidates: list[Candidate]) -> list[Candidate]:
    pages: dict[PageKey, Candidate] = {}
    for candidate in candidates:
        previous = pages.get(candidate.page_key)
        if previous is None or candidate.score > previous.score:
            pages[candidate.page_key] = candidate
    return list(pages.values())


def _tokenize(text: str) -> list[str]:
    tokens: list[str] = [word.lower() for word in _LATIN_WORD.findall(text)]
    for run in _CJK_RUN.findall(text):
        tokens.extend(run)
        tokens.extend(run[index : index + 2] for index in range(len(run) - 1))
    return tokens
