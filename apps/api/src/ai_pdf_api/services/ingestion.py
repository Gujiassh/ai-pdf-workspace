from __future__ import annotations

from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from io import BytesIO

from pypdf import PdfReader
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ai_pdf_api.models import Document, DocumentChunk, DocumentPage, IngestionJob
from ai_pdf_api.services.storage import download_bytes

CHUNK_SIZE = 1_200
CHUNK_OVERLAP = 200
INGESTION_LEASE_TIMEOUT = timedelta(minutes=15)
PageTextExtractor = Callable[[bytes], list[tuple[int, str]]]


class IngestionError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


def split_page_text(text: str) -> list[tuple[int, int, str]]:
    chunks: list[tuple[int, int, str]] = []
    start = 0
    text_length = len(text)
    while start < text_length:
        end = min(start + CHUNK_SIZE, text_length)
        if end < text_length:
            boundary = text.rfind("\n", start + CHUNK_SIZE // 2, end)
            if boundary <= start:
                boundary = text.rfind(" ", start + CHUNK_SIZE // 2, end)
            if boundary > start:
                end = boundary
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append((start, end, chunk_text))
        if end == text_length:
            break
        start = max(end - CHUNK_OVERLAP, start + 1)
    return chunks


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
            IngestionJob.job_type == "ingest",
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
            document.status = "uploaded"
            document.updated_at = now
    db.flush()


def claim_next_ingestion_job(db: Session) -> str | None:
    now = datetime.now(UTC)
    recover_stale_ingestion_jobs(db, now)
    job = db.scalar(
        select(IngestionJob)
        .where(IngestionJob.status == "queued", IngestionJob.job_type == "ingest")
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
    document.status = "parsing"
    document.last_error_code = None
    document.last_error_message = None
    document.updated_at = now
    db.commit()
    return job.id


def extract_pdf_page_texts(payload: bytes) -> list[tuple[int, str]]:
    reader = PdfReader(BytesIO(payload))
    return [(page_number, page.extract_text() or "") for page_number, page in enumerate(reader.pages, start=1)]


def process_ingestion_job(
    db: Session,
    job_id: str,
    ocr_extract_page_texts: PageTextExtractor | None = None,
) -> None:
    job = db.get(IngestionJob, job_id)
    if job is None or job.status != "running":
        return
    document = db.get(Document, job.document_id)
    if document is None:
        _mark_job_failed(db, job, None, "document_missing", "Document disappeared before processing.")
        return

    try:
        payload = download_bytes(document.object_key)
        page_texts = extract_pdf_page_texts(payload)
        if not page_texts:
            raise IngestionError("empty_pdf", "PDF has no pages.")
        if not any(text.strip() for _, text in page_texts):
            if ocr_extract_page_texts is None:
                raise IngestionError("no_extractable_text", "PDF has no extractable text.")
            try:
                page_texts = ocr_extract_page_texts(payload)
            except Exception as error:
                raise IngestionError("ocr_failed", str(error)) from error
        elif ocr_extract_page_texts is not None and any(not text.strip() for _, text in page_texts):
            try:
                ocr_page_texts = dict(ocr_extract_page_texts(payload))
            except Exception as error:
                raise IngestionError("ocr_failed", str(error)) from error
            page_texts = [
                (page_number, text if text.strip() else ocr_page_texts.get(page_number, ""))
                for page_number, text in page_texts
            ]
        if not any(text.strip() for _, text in page_texts):
            raise IngestionError("no_extractable_text", "PDF has no extractable text after OCR.")

        now = datetime.now(UTC)
        document.status = "chunking"
        document.page_count = len(page_texts)
        document.updated_at = now
        db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
        db.execute(delete(DocumentPage).where(DocumentPage.document_id == document.id))
        db.flush()

        for page_number, page_text in page_texts:
            page = DocumentPage(
                workspace_id=document.workspace_id,
                document_id=document.id,
                page_number=page_number,
                extracted_text=page_text,
                char_count=len(page_text),
                created_at=now,
            )
            db.add(page)
            db.flush()
            for chunk_index, (char_start, char_end, chunk_text) in enumerate(split_page_text(page_text)):
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

        document.status = "chunked"
        document.updated_at = now
        job.status = "succeeded"
        job.finished_at = now
        db.commit()
    except IngestionError as error:
        _mark_job_failed(db, job, document, error.code, str(error))
    except Exception as error:
        _mark_job_failed(db, job, document, "ingestion_failed", str(error))


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
