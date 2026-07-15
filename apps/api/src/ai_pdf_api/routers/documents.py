from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ai_pdf_api.core.settings import settings
from ai_pdf_api.db.session import get_db
from ai_pdf_api.models import Document, DocumentChunk, DocumentPage, IngestionJob, User
from ai_pdf_api.routers.deps import get_accessible_workspace, require_existing_user, require_user_id
from ai_pdf_api.schemas.document import (
    CreateUploadSessionRequest,
    CreateUploadSessionResponse,
    DocumentDetailResponse,
    DocumentListResponse,
    DocumentPageContent,
    DocumentPageOcrBlock,
    DocumentSummary,
    FinalizeUploadRequest,
    FinalizeUploadResponse,
    UploadDescriptor,
)
from ai_pdf_api.schemas.job import JobStatus
from ai_pdf_api.services.storage import delete_object_if_exists, object_exists, stream_bytes, upload_bytes

router = APIRouter(prefix="/v1/workspaces/{workspace_id}/documents", tags=["documents"])


def to_document_summary(document: Document) -> DocumentSummary:
    return DocumentSummary(
        id=document.id,
        workspaceId=document.workspace_id,
        title=document.title,
        sourceFilename=document.source_filename,
        mimeType=document.mime_type,
        byteSize=document.byte_size,
        pageCount=document.page_count,
        status=document.status,
        currentIndexVersion=document.current_index_version,
        lastErrorCode=document.last_error_code,
        lastErrorMessage=document.last_error_message,
        createdAt=document.created_at.astimezone(UTC).isoformat(),
        updatedAt=document.updated_at.astimezone(UTC).isoformat(),
    )


def to_job_status(job: IngestionJob) -> JobStatus:
    return JobStatus(
        id=job.id,
        workspaceId=job.workspace_id,
        documentId=job.document_id,
        jobType=job.job_type,
        status=job.status,
        attemptCount=job.attempt_count,
        queuedAt=job.queued_at.astimezone(UTC).isoformat(),
        startedAt=job.started_at.astimezone(UTC).isoformat() if job.started_at else None,
        finishedAt=job.finished_at.astimezone(UTC).isoformat() if job.finished_at else None,
        errorCode=job.error_code,
        errorMessage=job.error_message,
    )


def get_workspace_document(db: Session, workspace_id: str, document_id: str) -> Document:
    document = db.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.workspace_id == workspace_id,
            Document.deleted_at.is_(None),
        ),
    )
    if document is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Document not found.",
        )
    return document


def build_object_key(workspace_id: str, document_id: str, source_filename: str) -> str:
    suffix = Path(source_filename).suffix.lower() or ".pdf"
    return f"workspaces/{workspace_id}/documents/{document_id}/original{suffix}"


@router.get("", response_model=DocumentListResponse)
def list_documents(
    workspace_id: str,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> DocumentListResponse:
    get_accessible_workspace(db, user_id, workspace_id)
    items = db.scalars(
        select(Document)
        .where(Document.workspace_id == workspace_id, Document.deleted_at.is_(None))
        .order_by(Document.created_at.desc())
    ).all()
    return DocumentListResponse(items=[to_document_summary(document) for document in items], nextCursor=None)


@router.get("/{document_id}", response_model=DocumentDetailResponse)
def get_document_detail(
    workspace_id: str,
    document_id: str,
    page_number: int = Query(1, alias="pageNumber", ge=1),
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> DocumentDetailResponse:
    get_accessible_workspace(db, user_id, workspace_id)
    document = get_workspace_document(db, workspace_id, document_id)
    page = db.scalar(
        select(DocumentPage)
        .where(DocumentPage.document_id == document.id, DocumentPage.page_number == page_number),
    )
    if page is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document page not found.")
    return DocumentDetailResponse(
        document=to_document_summary(document),
        pages=[
            DocumentPageContent(
                pageNumber=page.page_number,
                text=page.extracted_text,
                charCount=page.char_count,
                ocrBlocks=[DocumentPageOcrBlock.model_validate(block) for block in (page.ocr_blocks or [])],
            )
        ],
    )


@router.get("/{document_id}/file")
def get_document_file(
    workspace_id: str,
    document_id: str,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    get_accessible_workspace(db, user_id, workspace_id)
    document = get_workspace_document(db, workspace_id, document_id)
    if not object_exists(document.object_key):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document file not found.")

    return StreamingResponse(
        stream_bytes(document.object_key),
        media_type=document.mime_type,
        headers={
            "Cache-Control": "private, max-age=3600",
            "Content-Disposition": f"inline; filename*=UTF-8''{quote(document.source_filename)}",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.post("/upload-session", response_model=CreateUploadSessionResponse, status_code=status.HTTP_201_CREATED)
def create_upload_session(
    workspace_id: str,
    payload: CreateUploadSessionRequest,
    user: User = Depends(require_existing_user),
    db: Session = Depends(get_db),
) -> CreateUploadSessionResponse:
    get_accessible_workspace(db, user.id, workspace_id)
    if payload.mimeType != "application/pdf" or Path(payload.sourceFilename).suffix.lower() != ".pdf":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Only PDF uploads are supported.")
    now = datetime.now(UTC)
    title = (payload.title or Path(payload.sourceFilename).stem).strip()
    document = Document(
        workspace_id=workspace_id,
        created_by_user_id=user.id,
        title=title or payload.sourceFilename,
        source_filename=payload.sourceFilename,
        object_key="",
        mime_type=payload.mimeType,
        byte_size=payload.byteSize,
        status="pending_upload",
        current_index_version=1,
        created_at=now,
        updated_at=now,
    )
    db.add(document)
    db.flush()
    document.object_key = build_object_key(workspace_id, document.id, payload.sourceFilename)
    db.commit()
    db.refresh(document)
    return CreateUploadSessionResponse(
        document=to_document_summary(document),
        upload=UploadDescriptor(
            method="PUT",
            objectKey=document.object_key,
            headers={"Content-Type": payload.mimeType},
        ),
    )


@router.put("/{document_id}/upload", status_code=status.HTTP_204_NO_CONTENT)
async def upload_document_binary(
    workspace_id: str,
    document_id: str,
    request: Request,
    object_key: str = Query(..., alias="objectKey"),
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> Response:
    get_accessible_workspace(db, user_id, workspace_id)
    document = get_workspace_document(db, workspace_id, document_id)
    if document.status != "pending_upload":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document is not awaiting upload.",
        )
    if document.object_key != object_key:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Object key mismatch.",
        )

    payload = await request.body()
    if len(payload) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty upload body.")
    if len(payload) > settings.max_upload_bytes:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Upload exceeds max size.")

    content_type = request.headers.get("content-type", document.mime_type)
    upload_bytes(document.object_key, payload, content_type)
    document.updated_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{document_id}/finalize-upload", response_model=FinalizeUploadResponse)
def finalize_upload(
    workspace_id: str,
    document_id: str,
    payload: FinalizeUploadRequest,
    user: User = Depends(require_existing_user),
    db: Session = Depends(get_db),
) -> FinalizeUploadResponse:
    get_accessible_workspace(db, user.id, workspace_id)
    document = get_workspace_document(db, workspace_id, document_id)
    if document.status != "pending_upload":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document is not awaiting finalize upload.",
        )
    if document.object_key != payload.objectKey:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Object key mismatch.",
        )
    if not object_exists(document.object_key):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Uploaded object not found in storage.",
        )

    now = datetime.now(UTC)
    job = IngestionJob(
        workspace_id=workspace_id,
        document_id=document.id,
        job_type="ingest",
        status="queued",
        attempt_count=1,
        config_snapshot={
            "source": "finalize_upload",
            "embeddingProvider": settings.embedding_provider,
            "embeddingModel": settings.embedding_model,
            "embeddingDimensions": settings.embedding_dimensions,
            "embeddingVersion": settings.embedding_version,
        },
        requested_by_user_id=user.id,
        queued_at=now,
        created_at=now,
    )
    db.add(job)
    db.flush()

    document.status = "uploaded"
    document.latest_ingestion_job_id = job.id
    document.last_error_code = None
    document.last_error_message = None
    document.updated_at = now
    db.commit()
    db.refresh(document)
    db.refresh(job)

    return FinalizeUploadResponse(document=to_document_summary(document), job=to_job_status(job))


@router.post("/{document_id}/reindex", response_model=FinalizeUploadResponse)
def reindex_document(
    workspace_id: str,
    document_id: str,
    user: User = Depends(require_existing_user),
    db: Session = Depends(get_db),
) -> FinalizeUploadResponse:
    get_accessible_workspace(db, user.id, workspace_id)
    document = get_workspace_document(db, workspace_id, document_id)
    db.refresh(document, with_for_update=True)
    if document.status in {"pending_upload", "uploaded", "parsing", "chunking", "deleting", "deleted"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Document is not ready to reindex.",
        )
    if db.scalar(
        select(IngestionJob.id).where(
            IngestionJob.document_id == document.id,
            IngestionJob.job_type == "embed_chunks",
            IngestionJob.status.in_(("queued", "running")),
        )
    ) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document reindex is already running.")
    if db.scalar(select(DocumentChunk.id).where(DocumentChunk.document_id == document.id)) is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Document has no chunks to reindex.")

    now = datetime.now(UTC)
    job = IngestionJob(
        workspace_id=workspace_id,
        document_id=document.id,
        job_type="embed_chunks",
        status="queued",
        attempt_count=1,
        config_snapshot={
            "source": "reindex",
            "embeddingProvider": settings.embedding_provider,
            "embeddingModel": settings.embedding_model,
            "embeddingDimensions": settings.embedding_dimensions,
            "embeddingVersion": settings.embedding_version,
        },
        requested_by_user_id=user.id,
        queued_at=now,
        created_at=now,
    )
    db.add(job)
    db.flush()
    document.latest_ingestion_job_id = job.id
    document.last_error_code = None
    document.last_error_message = None
    document.updated_at = now
    db.commit()
    db.refresh(document)
    db.refresh(job)
    return FinalizeUploadResponse(document=to_document_summary(document), job=to_job_status(job))


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    workspace_id: str,
    document_id: str,
    user_id: str = Depends(require_user_id),
    db: Session = Depends(get_db),
) -> Response:
    _workspace, role = get_accessible_workspace(db, user_id, workspace_id)
    if role != "owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners can delete documents.",
        )

    document = get_workspace_document(db, workspace_id, document_id)
    delete_object_if_exists(document.object_key)
    db.execute(delete(DocumentChunk).where(DocumentChunk.document_id == document.id))
    db.execute(delete(DocumentPage).where(DocumentPage.document_id == document.id))
    document.deleted_at = datetime.now(UTC)
    document.status = "deleted"
    document.updated_at = datetime.now(UTC)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
