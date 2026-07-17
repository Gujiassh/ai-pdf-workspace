from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from math import sqrt

from sqlalchemy import Select, and_, bindparam, case, desc, func, literal, or_, select
from sqlalchemy.orm import Session

from ai_pdf_api.core.settings import RetrievalStrategy, settings
from ai_pdf_api.core.metrics import observe_retrieval
from ai_pdf_api.models import Document, DocumentChunk, DocumentPage
from ai_pdf_api.services.providers import EmbeddingProvider

logger = logging.getLogger(__name__)

_CJK_RUN = re.compile(r"[\u3400-\u9fff]+")
_LATIN_WORD = re.compile(r"[A-Za-z0-9]+")


@dataclass(frozen=True)
class RetrievedChunk:
    chunk: DocumentChunk
    document: Document
    page: DocumentPage
    distance: float


def retrieve_chunks(
    db: Session,
    workspace_id: str,
    query_embedding: list[float],
    *,
    embedding_provider: EmbeddingProvider | None = None,
    limit: int = 6,
) -> list[RetrievedChunk]:
    if limit < 1:
        raise ValueError("limit must be positive")
    provider = embedding_provider
    provider_name = provider.provider if provider is not None else settings.embedding_provider
    provider_model = provider.model if provider is not None else settings.embedding_model
    provider_version = provider.version if provider is not None else settings.embedding_version
    provider_dimensions = provider.dimensions if provider is not None else settings.embedding_dimensions

    statement: Select[tuple[DocumentChunk, Document, DocumentPage]] = (
        select(DocumentChunk, Document, DocumentPage)
        .join(Document, Document.id == DocumentChunk.document_id)
        .join(DocumentPage, DocumentPage.id == DocumentChunk.page_id)
        .where(
            DocumentChunk.workspace_id == workspace_id,
            Document.workspace_id == workspace_id,
            DocumentPage.workspace_id == workspace_id,
            DocumentChunk.index_version == Document.current_index_version,
            DocumentChunk.embedding_provider == provider_name,
            DocumentChunk.embedding_model == provider_model,
            DocumentChunk.embedding_version == provider_version,
            DocumentChunk.embedding_dimensions == provider_dimensions,
            DocumentChunk.embedding.is_not(None),
            Document.status == "ready",
            Document.deleted_at.is_(None),
        )
    )
    if db.bind is not None and db.bind.dialect.name == "sqlite":
        return _retrieve_sqlite(db, statement, query_embedding, limit)

    distance = DocumentChunk.embedding.cosine_distance(query_embedding).label("distance")
    rows = db.execute(
        statement.add_columns(distance).order_by(distance, DocumentChunk.id).limit(limit)
    ).all()
    return [
        RetrievedChunk(chunk=chunk, document=document, page=page, distance=float(distance_value))
        for chunk, document, page, distance_value in rows
    ]


def retrieve_lexical_chunks(
    db: Session,
    workspace_id: str,
    query: str,
    *,
    limit: int = 24,
) -> list[RetrievedChunk]:
    if limit < 1:
        raise ValueError("limit must be positive")
    terms = _lexical_terms(query)
    if not terms:
        return []

    scoped_statement: Select[tuple[DocumentChunk, Document, DocumentPage]] = (
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
    )
    if db.bind is not None and db.bind.dialect.name == "sqlite":
        return _retrieve_lexical_sqlite(db, scoped_statement, query, terms, limit)

    document_versions = db.execute(
        select(Document.id, Document.current_index_version).where(
            Document.workspace_id == workspace_id,
            Document.status == "ready",
            Document.deleted_at.is_(None),
        )
    ).all()
    if not document_versions:
        return []

    current_version_scope = or_(
        *(
            and_(
                DocumentChunk.document_id == document_id,
                DocumentChunk.index_version == index_version,
            )
            for document_id, index_version in document_versions
        )
    )

    query_value = bindparam("lexical_query", value=query)
    latin_terms = _unique_latin_terms(query)
    if latin_terms:
        text_vector = func.to_tsvector("simple", DocumentChunk.chunk_text)
        text_query = func.to_tsquery(
            "simple",
            bindparam("lexical_ts_query", value=" | ".join(latin_terms)),
        )
        term_matches = [DocumentChunk.chunk_text.ilike(f"%{term}%") for term in latin_terms]
        term_coverage = sum(
            (case((term_match, 1.0), else_=0.0) for term_match in term_matches),
            start=literal(0.0),
        ) / len(latin_terms)
        lexical_score = (
            term_coverage + func.ts_rank_cd(text_vector, text_query)
        ).label("lexical_score")
        candidate_statement = select(DocumentChunk.id, lexical_score).where(
            DocumentChunk.workspace_id == workspace_id,
            current_version_scope,
            text_vector.op("@@")(text_query),
        )
        ordering = (desc(lexical_score), DocumentChunk.id)
        candidate_rows = db.execute(
            candidate_statement.order_by(*ordering).limit(limit)
        ).all()
        return _load_lexical_candidates(db, scoped_statement, candidate_rows, limit)
    else:
        lexical_distance = DocumentChunk.chunk_text.op("<->>")(query_value).label(
            "lexical_distance"
        )
        lexical_score = (literal(1.0) - lexical_distance).label("lexical_score")
        candidate_statement = select(DocumentChunk.id, lexical_score).where(
            DocumentChunk.workspace_id == workspace_id,
        )
        candidate_limit = limit * 2
        while True:
            candidate_rows = db.execute(
                candidate_statement.order_by(lexical_distance).limit(candidate_limit)
            ).all()
            loaded = _load_lexical_candidates(
                db,
                scoped_statement,
                candidate_rows,
                limit,
            )
            if len(loaded) >= limit or len(candidate_rows) < candidate_limit:
                return loaded
            candidate_limit *= 2


def _load_lexical_candidates(
    db: Session,
    scoped_statement: Select[tuple[DocumentChunk, Document, DocumentPage]],
    candidate_rows: list[tuple[str, float]],
    limit: int,
) -> list[RetrievedChunk]:
    if not candidate_rows:
        return []
    ordered_candidates = sorted(
        candidate_rows,
        key=lambda row: (-float(row[1]), row[0]),
    )
    candidate_scores = {
        chunk_id: float(score) for chunk_id, score in ordered_candidates
    }
    loaded_rows = db.execute(
        scoped_statement.where(DocumentChunk.id.in_(candidate_scores))
    ).all()
    loaded_by_id = {
        chunk.id: RetrievedChunk(
            chunk=chunk,
            document=document,
            page=page,
            distance=_lexical_score_to_distance(candidate_scores[chunk.id]),
        )
        for chunk, document, page in loaded_rows
    }
    return [
        loaded_by_id[chunk_id]
        for chunk_id, _score in ordered_candidates
        if chunk_id in loaded_by_id
    ][:limit]


def retrieve_query_chunks(
    db: Session,
    workspace_id: str,
    query: str,
    query_embedding: list[float],
    *,
    embedding_provider: EmbeddingProvider | None = None,
    limit: int = 6,
    strategy: RetrievalStrategy | None = None,
    candidate_limit: int | None = None,
    rrf_constant: int | None = None,
) -> list[RetrievedChunk]:
    if limit < 1:
        raise ValueError("limit must be positive")
    effective_strategy = strategy or settings.retrieval_strategy
    started = time.perf_counter()
    try:
        return _retrieve_query_chunks(
            db,
            workspace_id,
            query,
            query_embedding,
            embedding_provider=embedding_provider,
            limit=limit,
            strategy=effective_strategy,
            candidate_limit=candidate_limit,
            rrf_constant=rrf_constant,
            started=started,
        )
    except Exception as error:
        total_ms = _elapsed_ms(started)
        logger.error(
            "retrieval_failed strategy=%s workspace_id=%s error_type=%s total_ms=%.3f",
            effective_strategy,
            workspace_id,
            type(error).__name__,
            total_ms,
        )
        observe_retrieval(effective_strategy, "error", total_ms, 0)
        raise


def _retrieve_query_chunks(
    db: Session,
    workspace_id: str,
    query: str,
    query_embedding: list[float],
    *,
    embedding_provider: EmbeddingProvider | None,
    limit: int,
    strategy: RetrievalStrategy,
    candidate_limit: int | None,
    rrf_constant: int | None,
    started: float,
) -> list[RetrievedChunk]:
    dense_started = time.perf_counter()
    if strategy == "dense":
        results = retrieve_chunks(db, workspace_id, query_embedding, embedding_provider=embedding_provider, limit=limit)
        dense_ms = _elapsed_ms(dense_started)
        total_ms = _elapsed_ms(started)
        logger.info(
            "retrieval_complete strategy=dense workspace_id=%s candidate_k=%d dense_count=%d "
            "lexical_count=0 result_count=%d dense_ms=%.3f lexical_ms=0.000 merge_ms=0.000 total_ms=%.3f",
            workspace_id,
            limit,
            len(results),
            len(results),
            dense_ms,
            total_ms,
        )
        observe_retrieval("dense", "success", total_ms, len(results))
        return results

    effective_candidate_limit = max(
        limit,
        candidate_limit if candidate_limit is not None else settings.retrieval_candidate_k,
    )
    effective_rrf_constant = (
        rrf_constant if rrf_constant is not None else settings.retrieval_rrf_constant
    )
    if effective_rrf_constant < 1:
        raise ValueError("rrf_constant must be positive")
    dense_results = retrieve_chunks(
        db,
        workspace_id,
        query_embedding,
        embedding_provider=embedding_provider,
        limit=effective_candidate_limit,
    )
    dense_ms = _elapsed_ms(dense_started)
    lexical_started = time.perf_counter()
    lexical_results = retrieve_lexical_chunks(
        db,
        workspace_id,
        query,
        limit=effective_candidate_limit,
    )
    lexical_ms = _elapsed_ms(lexical_started)
    merge_started = time.perf_counter()
    results = _rrf_merge(
        dense_results,
        lexical_results,
        limit=limit,
        constant=effective_rrf_constant,
    )
    merge_ms = _elapsed_ms(merge_started)
    total_ms = _elapsed_ms(started)
    logger.info(
        "retrieval_complete strategy=hybrid workspace_id=%s candidate_k=%d dense_count=%d "
        "lexical_count=%d result_count=%d dense_ms=%.3f lexical_ms=%.3f merge_ms=%.3f total_ms=%.3f",
        workspace_id,
        effective_candidate_limit,
        len(dense_results),
        len(lexical_results),
        len(results),
        dense_ms,
        lexical_ms,
        merge_ms,
        total_ms,
    )
    observe_retrieval("hybrid", "success", total_ms, len(results))
    return results


def _retrieve_sqlite(
    db: Session,
    statement: Select[tuple[DocumentChunk, Document, DocumentPage]],
    query_embedding: list[float],
    limit: int,
) -> list[RetrievedChunk]:
    scored: list[RetrievedChunk] = []
    for chunk, document, page in db.execute(statement).all():
        vector = chunk.embedding
        if not isinstance(vector, list):
            continue
        scored.append(
            RetrievedChunk(
                chunk=chunk,
                document=document,
                page=page,
                distance=_cosine_distance(query_embedding, vector),
            )
        )
    scored.sort(key=lambda item: (item.distance, item.chunk.id))
    return scored[:limit]


def _retrieve_lexical_sqlite(
    db: Session,
    statement: Select[tuple[DocumentChunk, Document, DocumentPage]],
    query: str,
    terms: list[str],
    limit: int,
) -> list[RetrievedChunk]:
    query_text = query.casefold()
    scored: list[tuple[float, RetrievedChunk]] = []
    for chunk, document, page in db.execute(statement).all():
        text = chunk.chunk_text.casefold()
        matched_terms = sum(term.casefold() in text for term in terms)
        if matched_terms == 0:
            continue
        score = matched_terms / len(terms)
        if query_text in text:
            score += 1.0
        scored.append(
            (
                score,
                RetrievedChunk(
                    chunk=chunk,
                    document=document,
                    page=page,
                    distance=_lexical_score_to_distance(score),
                ),
            )
        )
    scored.sort(key=lambda item: (-item[0], item[1].chunk.id))
    return [item for _score, item in scored[:limit]]


def _rrf_merge(
    dense_results: list[RetrievedChunk],
    lexical_results: list[RetrievedChunk],
    *,
    limit: int,
    constant: int,
) -> list[RetrievedChunk]:
    scores: dict[tuple[str, int], float] = {}
    items: dict[tuple[str, int], RetrievedChunk] = {}
    for rank, item in enumerate(_dedupe_pages(dense_results), start=1):
        page_key = _page_key(item)
        scores[page_key] = scores.get(page_key, 0.0) + 1.0 / (constant + rank)
        items.setdefault(page_key, item)
    for rank, item in enumerate(_dedupe_pages(lexical_results), start=1):
        page_key = _page_key(item)
        scores[page_key] = scores.get(page_key, 0.0) + 1.0 / (constant + rank)
        items.setdefault(page_key, item)
    ranked_pages = sorted(
        scores,
        key=lambda page_key: (-scores[page_key], page_key[0], page_key[1]),
    )[:limit]
    return [items[page_key] for page_key in ranked_pages]


def _page_key(item: RetrievedChunk) -> tuple[str, int]:
    return item.document.id, item.page.page_number


def _dedupe_pages(items: list[RetrievedChunk]) -> list[RetrievedChunk]:
    pages: dict[tuple[str, int], RetrievedChunk] = {}
    for item in items:
        pages.setdefault(_page_key(item), item)
    return list(pages.values())


def _lexical_terms(query: str) -> list[str]:
    terms: list[str] = []
    seen: set[str] = set()

    def add(term: str) -> None:
        normalized = term.casefold().strip()
        if normalized and normalized not in seen:
            terms.append(normalized)
            seen.add(normalized)

    latin_words = _unique_latin_terms(query)
    for word in latin_words:
        add(word)
    if latin_words:
        return terms
    for run in _CJK_RUN.findall(query):
        if len(run) <= 12:
            add(run)
        for index in range(len(run) - 1):
            add(run[index : index + 2])
    return terms


def _unique_latin_terms(query: str) -> list[str]:
    return list(dict.fromkeys(word.casefold() for word in _LATIN_WORD.findall(query)))


def _lexical_score_to_distance(score: float) -> float:
    return 1.0 - min(1.0, max(0.0, float(score)))


def _elapsed_ms(started: float) -> float:
    return (time.perf_counter() - started) * 1000


def _cosine_distance(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        return 1.0
    left_norm = sqrt(sum(value * value for value in left))
    right_norm = sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 1.0
    similarity = sum(a * b for a, b in zip(left, right, strict=True)) / (left_norm * right_norm)
    return 1.0 - similarity
