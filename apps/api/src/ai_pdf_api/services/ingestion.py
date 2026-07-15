from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from io import BytesIO

from pypdf import PdfReader
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ai_pdf_api.core.settings import settings
from ai_pdf_api.models import Document, DocumentChunk, DocumentPage, IngestionJob
from ai_pdf_api.services.providers import EmbeddingProvider, ModelProviderError
from ai_pdf_api.services.storage import download_bytes

CHUNK_SIZE = 1_200
CHUNK_OVERLAP = 200
INGESTION_LEASE_TIMEOUT = timedelta(minutes=15)


@dataclass(frozen=True)
class PageTextResult:
    page_number: int
    text: str
    ocr_blocks: list[dict[str, object]] = field(default_factory=list)


PageTextExtractor = Callable[[bytes], list[PageTextResult | tuple[int, str]]]


class IngestionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def split_page_text(text: str, chunk_size: int = CHUNK_SIZE) -> list[tuple[int, int, str]]:
    chunks: list[tuple[int, int, str]] = []
    start = 0
    text_length = len(text)
    overlap = min(CHUNK_OVERLAP, max(1, chunk_size // 2))
    while start < text_length:
        end = min(start + chunk_size, text_length)
        if end < text_length:
            boundary = text.rfind("\n", start + chunk_size // 2, end)
            if boundary <= start:
                boundary = text.rfind(" ", start + chunk_size // 2, end)
            if boundary > start:
                end = boundary
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append((start, end, chunk_text))
        if end == text_length:
            break
        start = max(end - overlap, start + 1)
    return chunks


def _get_job_chunk_size(snapshot: dict) -> int:
    value = snapshot.get("chunkSize", CHUNK_SIZE)
    if not isinstance(value, int) or isinstance(value, bool) or not 200 <= value <= 4000:
        raise IngestionError("invalid_chunk_size", "Ingestion job has an invalid chunk size.")
    return value


def estimate_token_count(text: str) -> int:
    """Estimate token-like units without assuming a specific model tokenizer."""
    count = 0
    in_word = False
    for character in text:
        if character.isspace():
            in_word = False
            continue
        if "\u3400" <= character <= "\u9fff":
            count += 1
            in_word = False
        elif character.isalnum():
            if not in_word:
                count += 1
            in_word = True
        else:
            count += 1
            in_word = False
    return max(1, count)


def recover_stale_ingestion_jobs(db: Session, now: datetime) -> None:
    cutoff = now - INGESTION_LEASE_TIMEOUT
    stale_jobs = db.scalars(
        select(IngestionJob)
        .where(
            IngestionJob.status == "running",
            IngestionJob.job_type.in_(("ingest", "embed_chunks")),
            (IngestionJob.started_at.is_(None)) | (IngestionJob.started_at < cutoff),
        )
        .with_for_update(skip_locked=True),
    ).all()

    for job in stale_jobs:
        document = db.get(Document, job.document_id)
        if (
            document is None
            or document.deleted_at is not None
            or document.latest_ingestion_job_id not in {None, job.id}
        ):
            job.status = "cancelled"
            job.finished_at = now
            continue

        job.status = "queued"
        job.queued_at = now
        job.started_at = None
        job.finished_at = None
        job.attempt_count += 1
        job.error_code = None
        job.error_message = None
        if document.status not in {"deleted", "deleting"}:
            document.status = "uploaded" if job.job_type == "ingest" else _available_document_status(db, document.id)
            document.updated_at = now
    db.flush()


def claim_next_ingestion_job(db: Session) -> str | None:
    now = datetime.now(UTC)
    recover_stale_ingestion_jobs(db, now)
    job = db.scalar(
        select(IngestionJob)
        .where(IngestionJob.status == "queued", IngestionJob.job_type.in_(("ingest", "embed_chunks")))
        .order_by(IngestionJob.queued_at)
        .with_for_update(skip_locked=True)
        .limit(1),
    )
    if job is None:
        db.commit()
        return None

    document = db.get(Document, job.document_id)
    if document is None or document.deleted_at is not None:
        job.status = "cancelled"
        job.finished_at = now
        db.commit()
        return None

    job.status = "running"
    job.started_at = now
    document.status = "parsing" if job.job_type == "ingest" else "embedding"
    document.last_error_code = None
    document.last_error_message = None
    document.updated_at = now
    db.commit()
    return job.id


def extract_pdf_page_texts(payload: bytes) -> list[tuple[int, str]]:
    reader = PdfReader(BytesIO(payload))
    return [(page_number, page.extract_text() or "") for page_number, page in enumerate(reader.pages, start=1)]


def _coerce_page_text_result(value: PageTextResult | tuple[int, str]) -> PageTextResult:
    if isinstance(value, PageTextResult):
        return value
    page_number, text = value
    return PageTextResult(page_number=page_number, text=text)


def _ocr_page_results(payload: bytes, extractor: PageTextExtractor) -> dict[int, PageTextResult]:
    return {
        result.page_number: result
        for result in (_coerce_page_text_result(item) for item in extractor(payload))
    }


def process_ingestion_job(
    db: Session,
    job_id: str,
    ocr_extract_page_texts: PageTextExtractor | None = None,
    embedding_provider: EmbeddingProvider | None = None,
) -> None:
    job = db.get(IngestionJob, job_id)
    if job is None or job.status != "running":
        return
    if job.job_type == "embed_chunks":
        process_embedding_job(db, job_id, embedding_provider)
        return

    document = db.get(Document, job.document_id)
    if document is None:
        _mark_job_failed(db, job, None, "document_missing", "Document disappeared before processing.")
        return

    try:
        if embedding_provider is not None:
            _validate_job_embedding_config(job, embedding_provider)
        payload = download_bytes(document.object_key)
        native_page_texts = [_coerce_page_text_result(item) for item in extract_pdf_page_texts(payload)]
        page_texts = native_page_texts
        if not page_texts:
            raise IngestionError("empty_pdf", "PDF has no pages.")
        if not any(page.text.strip() for page in page_texts):
            if ocr_extract_page_texts is None:
                raise IngestionError("no_extractable_text", "PDF has no extractable text.")
            try:
                ocr_pages = _ocr_page_results(payload, ocr_extract_page_texts)
                page_texts = [
                    ocr_pages.get(page.page_number, PageTextResult(page.page_number, ""))
                    for page in native_page_texts
                ]
            except Exception as error:
                raise IngestionError("ocr_failed", str(error)) from error
        elif ocr_extract_page_texts is not None and any(not page.text.strip() for page in page_texts):
            try:
                ocr_pages = _ocr_page_results(payload, ocr_extract_page_texts)
            except Exception as error:
                raise IngestionError("ocr_failed", str(error)) from error
            page_texts = [
                page
                if page.text.strip()
                else ocr_pages.get(page.page_number, PageTextResult(page.page_number, ""))
                for page in page_texts
            ]
        if not any(page.text.strip() for page in page_texts):
            raise IngestionError("no_extractable_text", "PDF has no extractable text after OCR.")

        snapshot = job.config_snapshot or {}
        chunk_size = _get_job_chunk_size(snapshot)
        now = datetime.now(UTC)
        document.status = "chunking"
        document.page_count = len(page_texts)
        document.updated_at = now
        db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
        db.execute(delete(DocumentPage).where(DocumentPage.document_id == document.id))
        db.flush()

        for page_result in page_texts:
            page = DocumentPage(
                workspace_id=document.workspace_id,
                document_id=document.id,
                page_number=page_result.page_number,
                extracted_text=page_result.text,
                char_count=len(page_result.text),
                ocr_blocks=page_result.ocr_blocks,
                created_at=now,
            )
            db.add(page)
            db.flush()
            for chunk_index, (char_start, char_end, chunk_text) in enumerate(
                split_page_text(page_result.text, chunk_size=chunk_size)
            ):
                db.add(
                    DocumentChunk(
                        workspace_id=document.workspace_id,
                        document_id=document.id,
                        page_id=page.id,
                        chunk_index=chunk_index,
                        chunk_text=chunk_text,
                        token_count=estimate_token_count(chunk_text),
                        char_start=char_start,
                        char_end=char_end,
                        index_version=document.current_index_version,
                        created_at=now,
                    ),
                )

        db.flush()
        if embedding_provider is None:
            document.status = "chunked"
        else:
            document.status = "embedding"
            document.updated_at = datetime.now(UTC)
            _embed_document_chunks(db, document, embedding_provider)
            document.status = "ready"
        document.updated_at = datetime.now(UTC)
        job.status = "succeeded"
        job.finished_at = datetime.now(UTC)
        db.commit()
    except IngestionError as error:
        _mark_job_failed(db, job, document, error.code, str(error))
    except ModelProviderError as error:
        _mark_job_failed(db, job, document, error.code, error.message)
    except Exception as error:
        _mark_job_failed(db, job, document, "ingestion_failed", str(error))


def process_embedding_job(
    db: Session,
    job_id: str,
    embedding_provider: EmbeddingProvider | None,
) -> None:
    job = db.get(IngestionJob, job_id)
    if job is None or job.status != "running":
        return
    document = db.get(Document, job.document_id)
    if document is None:
        _mark_job_failed(db, job, None, "document_missing", "Document disappeared before embedding.")
        return
    if embedding_provider is None:
        _mark_embedding_job_failed(db, job, document, "embedding_provider_missing", "Embedding provider is not configured.")
        return

    try:
        _validate_job_embedding_config(job, embedding_provider)
        document.status = "embedding"
        document.updated_at = datetime.now(UTC)
        _embed_document_chunks(db, document, embedding_provider)
        document.status = "ready"
        document.updated_at = datetime.now(UTC)
        job.status = "succeeded"
        job.finished_at = datetime.now(UTC)
        db.commit()
    except ModelProviderError as error:
        _mark_embedding_job_failed(db, job, document, error.code, error.message)
    except Exception as error:
        _mark_embedding_job_failed(db, job, document, "embedding_failed", str(error))


def _embed_document_chunks(db: Session, document: Document, embedding_provider: EmbeddingProvider) -> None:
    chunks = db.scalars(
        select(DocumentChunk)
        .where(
            DocumentChunk.document_id == document.id,
            DocumentChunk.workspace_id == document.workspace_id,
            DocumentChunk.index_version == document.current_index_version,
        )
        .order_by(DocumentChunk.page_id, DocumentChunk.chunk_index),
    ).all()
    if not chunks:
        raise IngestionError("no_chunks", "Document produced no non-empty chunks.")

    batch_size = settings.embedding_batch_size
    for offset in range(0, len(chunks), batch_size):
        batch = chunks[offset : offset + batch_size]
        vectors = embedding_provider.embed_documents([chunk.chunk_text for chunk in batch])
        if len(vectors) != len(batch):
            raise ModelProviderError("embedding_invalid_response", "Embedding provider returned an invalid vector count.")
        for chunk, vector in zip(batch, vectors, strict=True):
            chunk.embedding = vector
            chunk.embedding_dimensions = embedding_provider.dimensions
            chunk.embedding_provider = embedding_provider.provider
            chunk.embedding_model = embedding_provider.model
            chunk.embedding_version = embedding_provider.version
        db.flush()


def _validate_job_embedding_config(job: IngestionJob, embedding_provider: EmbeddingProvider) -> None:
    snapshot = job.config_snapshot or {}
    expected = {
        "embeddingProvider": embedding_provider.provider,
        "embeddingModel": embedding_provider.model,
        "embeddingDimensions": embedding_provider.dimensions,
        "embeddingVersion": embedding_provider.version,
    }
    if any(key in snapshot and snapshot[key] != value for key, value in expected.items()):
        raise ModelProviderError(
            "embedding_configuration_mismatch",
            "Embedding provider configuration does not match the job snapshot.",
        )


def _available_document_status(db: Session, document_id: str) -> str:
    chunks = db.scalars(
        select(DocumentChunk).where(DocumentChunk.document_id == document_id),
    ).all()
    if not chunks:
        return "chunked"
    return "ready" if all(
        chunk.embedding is not None
        and chunk.embedding_dimensions is not None
        and chunk.embedding_provider is not None
        and chunk.embedding_model is not None
        and chunk.embedding_version is not None
        for chunk in chunks
    ) else "chunked"


def _mark_embedding_job_failed(
    db: Session,
    job: IngestionJob,
    document: Document,
    error_code: str,
    error_message: str,
) -> None:
    db.rollback()
    now = datetime.now(UTC)
    job.status = "failed"
    job.error_code = error_code
    job.error_message = error_message
    job.finished_at = now
    document.status = _available_document_status(db, document.id)
    document.last_error_code = error_code
    document.last_error_message = error_message
    document.updated_at = now
    db.commit()


def _mark_job_failed(
    db: Session,
    job: IngestionJob,
    document: Document | None,
    error_code: str,
    error_message: str,
) -> None:
    db.rollback()
    now = datetime.now(UTC)
    job.status = "failed"
    job.error_code = error_code
    job.error_message = error_message
    job.finished_at = now
    if document is not None:
        document.status = "failed"
        document.last_error_code = error_code
        document.last_error_message = error_message
        document.updated_at = now
    db.commit()
