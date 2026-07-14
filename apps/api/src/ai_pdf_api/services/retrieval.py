from __future__ import annotations

from dataclasses import dataclass
from math import sqrt

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from ai_pdf_api.core.settings import settings
from ai_pdf_api.models import Document, DocumentChunk, DocumentPage
from ai_pdf_api.services.providers import EmbeddingProvider


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
    rows = db.execute(statement.add_columns(distance).order_by(distance).limit(limit)).all()
    return [
        RetrievedChunk(chunk=chunk, document=document, page=page, distance=float(distance_value))
        for chunk, document, page, distance_value in rows
    ]


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
    scored.sort(key=lambda item: item.distance)
    return scored[:limit]


def _cosine_distance(left: list[float], right: list[float]) -> float:
    if len(left) != len(right):
        return 1.0
    left_norm = sqrt(sum(value * value for value in left))
    right_norm = sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 1.0
    similarity = sum(a * b for a, b in zip(left, right, strict=True)) / (left_norm * right_norm)
    return 1.0 - similarity
