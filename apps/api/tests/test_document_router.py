from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ai_pdf_api.db.base import Base
from ai_pdf_api.db.session import get_db
from ai_pdf_api.models import Document, DocumentChunk, DocumentPage, IngestionJob, User, Workspace, WorkspaceMembership
from ai_pdf_api.routers.documents import router as documents_router
from ai_pdf_api.routers.jobs import router as jobs_router
from ai_pdf_api.services.ingestion import (
    INGESTION_LEASE_TIMEOUT,
    PageTextResult,
    claim_next_ingestion_job,
    estimate_token_count,
    process_ingestion_job,
    process_embedding_job,
    split_page_text,
)


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    testing_session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)
    session = testing_session_local()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def client(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> Generator[TestClient, None, None]:
    app = FastAPI()
    app.include_router(documents_router)
    app.include_router(jobs_router)

    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    monkeypatch.setattr("ai_pdf_api.routers.documents.upload_stream", lambda *args, **kwargs: None)
    monkeypatch.setattr("ai_pdf_api.routers.documents.object_exists", lambda object_key: True)
    monkeypatch.setattr("ai_pdf_api.routers.documents.delete_object_if_exists", lambda object_key: None)

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def create_user(db_session: Session, *, email: str, name: str) -> User:
    user = User(
        email=email,
        name=name,
        password_hash="hashed",
        avatar_url=f"https://example.com/{name}.png",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def create_workspace_with_membership(
    db_session: Session,
    *,
    user: User,
    name: str,
    role: str = "owner",
) -> Workspace:
    now = datetime.now(UTC)
    workspace = Workspace(
        name=name,
        description=None,
        created_by_user_id=user.id,
        created_at=now,
        updated_at=now,
    )
    db_session.add(workspace)
    db_session.flush()
    db_session.add(
        WorkspaceMembership(
            workspace_id=workspace.id,
            user_id=user.id,
            role=role,
        ),
    )
    db_session.commit()
    db_session.refresh(workspace)
    return workspace


def create_document(
    db_session: Session,
    *,
    workspace: Workspace,
    user: User,
    source_filename: str = "attention.pdf",
    status: str = "uploaded",
) -> Document:
    now = datetime.now(UTC)
    document = Document(
        workspace_id=workspace.id,
        created_by_user_id=user.id,
        title="Attention Is All You Need",
        source_filename=source_filename,
        object_key=f"workspaces/{workspace.id}/documents/doc/original.pdf",
        mime_type="application/pdf",
        byte_size=1234,
        status=status,
        current_index_version=1,
        created_at=now,
        updated_at=now,
    )
    db_session.add(document)
    db_session.commit()
    db_session.refresh(document)
    return document


def test_list_documents_requires_membership(client: TestClient, db_session: Session) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    stranger = create_user(db_session, email="stranger@example.com", name="Stranger")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Private")
    create_document(db_session, workspace=workspace, user=owner)

    response = client.get(f"/v1/workspaces/{workspace.id}/documents", headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": stranger.id})

    assert response.status_code == 404
    assert response.json()["detail"] == "Workspace not found."


def test_get_document_file_streams_original_pdf_for_members(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    member = create_user(db_session, email="member@example.com", name="Member")
    stranger = create_user(db_session, email="stranger@example.com", name="Stranger")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Private")
    db_session.add(WorkspaceMembership(workspace_id=workspace.id, user_id=member.id, role="editor"))
    db_session.commit()
    document = create_document(db_session, workspace=workspace, user=owner, source_filename="原始资料.pdf")
    monkeypatch.setattr(
        "ai_pdf_api.routers.documents.stream_bytes",
        lambda object_key: iter((b"%PDF-1.7\n", b"original page bytes")),
    )

    for user_id in (owner.id, member.id):
        response = client.get(
            f"/v1/workspaces/{workspace.id}/documents/{document.id}/file",
            headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": user_id},
        )
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.headers["content-disposition"].startswith("inline; filename*=")
        assert response.content == b"%PDF-1.7\noriginal page bytes"

    forbidden_response = client.get(
        f"/v1/workspaces/{workspace.id}/documents/{document.id}/file",
        headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": stranger.id},
    )
    assert forbidden_response.status_code == 404
    assert forbidden_response.json()["detail"] == "Workspace not found."


def test_create_upload_session_persists_pending_document(client: TestClient, db_session: Session) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")

    response = client.post(
        f"/v1/workspaces/{workspace.id}/documents/upload-session",
        headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id},
        json={
            "sourceFilename": "attention.pdf",
            "mimeType": "application/pdf",
            "byteSize": len(b"%PDF-1.7 fake pdf bytes"),
            "title": "Attention Is All You Need",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["document"]["workspaceId"] == workspace.id
    assert payload["document"]["status"] == "pending_upload"
    assert payload["upload"]["method"] == "PUT"
    assert payload["upload"]["headers"]["Content-Type"] == "application/pdf"
    assert payload["upload"]["objectKey"].startswith(f"workspaces/{workspace.id}/documents/")

    document = db_session.get(Document, payload["document"]["id"])
    assert document is not None
    assert document.status == "pending_upload"
    assert document.object_key == payload["upload"]["objectKey"]


def test_create_upload_session_rejects_non_pdf(client: TestClient, db_session: Session) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")

    response = client.post(
        f"/v1/workspaces/{workspace.id}/documents/upload-session",
        headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id},
        json={
            "sourceFilename": "notes.txt",
            "mimeType": "text/plain",
            "byteSize": 12,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "Only PDF uploads are supported."


def test_binary_upload_and_finalize_creates_queued_ingestion_job(client: TestClient, db_session: Session) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    upload_session = client.post(
        f"/v1/workspaces/{workspace.id}/documents/upload-session",
        headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id},
        json={
            "sourceFilename": "attention.pdf",
            "mimeType": "application/pdf",
            "byteSize": len(b"%PDF-1.7 fake pdf bytes"),
            "title": "Attention Is All You Need",
        },
    ).json()

    document_id = upload_session["document"]["id"]
    object_key = upload_session["upload"]["objectKey"]

    upload_response = client.put(
        f"/v1/workspaces/{workspace.id}/documents/{document_id}/upload",
        headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id, "content-type": "application/pdf"},
        params={"objectKey": object_key},
        content=b"%PDF-1.7 fake pdf bytes",
    )
    assert upload_response.status_code == 204

    finalize_response = client.post(
        f"/v1/workspaces/{workspace.id}/documents/{document_id}/finalize-upload",
        headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id},
        json={"objectKey": object_key},
    )

    assert finalize_response.status_code == 200
    payload = finalize_response.json()
    assert payload["document"]["status"] == "uploaded"
    assert payload["job"]["jobType"] == "ingest"
    assert payload["job"]["status"] == "queued"

    document = db_session.get(Document, document_id)
    assert document is not None
    assert document.status == "uploaded"
    assert document.latest_ingestion_job_id == payload["job"]["id"]

    job = db_session.get(IngestionJob, payload["job"]["id"])
    assert job is not None
    assert job.document_id == document_id
    assert job.job_type == "ingest"


def test_binary_upload_rejects_size_mismatch(client: TestClient, db_session: Session) -> None:
    owner = create_user(db_session, email="size-owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    upload_session = client.post(
        f"/v1/workspaces/{workspace.id}/documents/upload-session",
        headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id},
        json={"sourceFilename": "attention.pdf", "mimeType": "application/pdf", "byteSize": 99},
    ).json()

    response = client.put(
        f"/v1/workspaces/{workspace.id}/documents/{upload_session['document']['id']}/upload",
        headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id, "content-type": "application/pdf"},
        params={"objectKey": upload_session["upload"]["objectKey"]},
        content=b"short",
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Upload size does not match the upload session."


def test_get_job_returns_persisted_job(client: TestClient, db_session: Session) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    document = create_document(db_session, workspace=workspace, user=owner, status="uploaded")
    job = IngestionJob(
        workspace_id=workspace.id,
        document_id=document.id,
        job_type="ingest",
        status="queued",
        attempt_count=1,
        config_snapshot={"source": "test"},
        requested_by_user_id=owner.id,
        queued_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
    )
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)

    response = client.get(f"/v1/workspaces/{workspace.id}/jobs/{job.id}", headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["job"]["id"] == job.id
    assert payload["job"]["documentId"] == document.id


def test_ingestion_worker_persists_pages_and_chunks(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    document = create_document(db_session, workspace=workspace, user=owner, status="uploaded")
    job = IngestionJob(
        workspace_id=workspace.id,
        document_id=document.id,
        job_type="ingest",
        status="queued",
        attempt_count=1,
        config_snapshot={"source": "test"},
        requested_by_user_id=owner.id,
        queued_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
    )
    db_session.add(job)
    db_session.commit()

    class FakePage:
        def __init__(self, text: str) -> None:
            self.text = text

        def extract_text(self) -> str:
            return self.text

    class FakeReader:
        pages = [FakePage("Page one heading\n" + "alpha " * 300), FakePage("Page two body")]

    monkeypatch.setattr("ai_pdf_api.services.ingestion.download_bytes", lambda object_key: b"pdf")
    monkeypatch.setattr("ai_pdf_api.services.ingestion.PdfReader", lambda payload: FakeReader())

    claimed_job_id = claim_next_ingestion_job(db_session)
    assert claimed_job_id == job.id
    assert db_session.get(Document, document.id).status == "parsing"

    process_ingestion_job(db_session, claimed_job_id)

    refreshed_document = db_session.get(Document, document.id)
    refreshed_job = db_session.get(IngestionJob, job.id)
    pages = db_session.scalars(select(DocumentPage).where(DocumentPage.document_id == document.id)).all()
    chunks = db_session.scalars(select(DocumentChunk).where(DocumentChunk.document_id == document.id)).all()
    assert refreshed_document is not None
    assert refreshed_document.status == "chunked"
    assert refreshed_document.page_count == 2
    assert refreshed_job is not None
    assert refreshed_job.status == "succeeded"
    assert len(pages) == 2
    assert len(chunks) >= 2
    assert {chunk.index_version for chunk in chunks} == {1}


def test_ingestion_worker_embeds_chunks_and_marks_document_ready(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    document = create_document(db_session, workspace=workspace, user=owner, status="uploaded")
    job = IngestionJob(
        workspace_id=workspace.id,
        document_id=document.id,
        job_type="ingest",
        status="queued",
        attempt_count=1,
        config_snapshot={"source": "test"},
        requested_by_user_id=owner.id,
        queued_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
    )
    db_session.add(job)
    db_session.flush()
    document.latest_ingestion_job_id = job.id
    db_session.commit()

    class FakePage:
        def extract_text(self) -> str:
            return "embedding regression text"

    class FakeReader:
        pages = [FakePage()]

    class FakeEmbeddingProvider:
        provider = "fake"
        model = "fake-embedding"
        dimensions = 3
        version = "fake-v1"

        def embed_documents(self, texts: list[str]) -> list[list[float]]:
            return [[1.0, 0.0, 0.0] for _ in texts]

        def embed_query(self, text: str) -> list[float]:
            return [1.0, 0.0, 0.0]

    monkeypatch.setattr("ai_pdf_api.services.ingestion.download_bytes", lambda object_key: b"pdf")
    monkeypatch.setattr("ai_pdf_api.services.ingestion.PdfReader", lambda payload: FakeReader())

    claimed_job_id = claim_next_ingestion_job(db_session)
    process_ingestion_job(db_session, claimed_job_id, embedding_provider=FakeEmbeddingProvider())

    refreshed_document = db_session.get(Document, document.id)
    refreshed_job = db_session.get(IngestionJob, job.id)
    chunks = db_session.scalars(select(DocumentChunk).where(DocumentChunk.document_id == document.id)).all()
    assert refreshed_document is not None
    assert refreshed_document.status == "ready"
    assert refreshed_job is not None
    assert refreshed_job.status == "succeeded"
    assert chunks and chunks[0].embedding == [1.0, 0.0, 0.0]
    assert chunks[0].embedding_provider == "fake"
    assert chunks[0].embedding_dimensions == 3


def test_ingestion_worker_rejects_embedding_config_drift(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    document = create_document(db_session, workspace=workspace, user=owner, status="uploaded")
    job = IngestionJob(
        workspace_id=workspace.id,
        document_id=document.id,
        job_type="ingest",
        status="queued",
        attempt_count=1,
        config_snapshot={
            "embeddingProvider": "ollama",
            "embeddingModel": "qwen3-embedding:0.6b",
            "embeddingDimensions": 1024,
            "embeddingVersion": "embedding-v1",
        },
        requested_by_user_id=owner.id,
        queued_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
    )
    db_session.add(job)
    db_session.flush()
    document.latest_ingestion_job_id = job.id
    db_session.commit()

    class DifferentEmbeddingProvider:
        provider = "fake"
        model = "fake-embedding"
        dimensions = 3
        version = "fake-v1"

        def embed_documents(self, texts: list[str]) -> list[list[float]]:
            return [[1.0, 0.0, 0.0] for _ in texts]

        def embed_query(self, text: str) -> list[float]:
            return [1.0, 0.0, 0.0]

    monkeypatch.setattr("ai_pdf_api.services.ingestion.download_bytes", lambda object_key: b"unreachable")
    claimed_job_id = claim_next_ingestion_job(db_session)
    process_ingestion_job(db_session, claimed_job_id, embedding_provider=DifferentEmbeddingProvider())

    refreshed_document = db_session.get(Document, document.id)
    refreshed_job = db_session.get(IngestionJob, job.id)
    assert refreshed_document is not None
    assert refreshed_document.status == "failed"
    assert refreshed_job is not None
    assert refreshed_job.status == "failed"
    assert refreshed_job.error_code == "embedding_configuration_mismatch"


def test_embedding_failure_does_not_mark_partial_index_ready(
    db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    document = create_document(db_session, workspace=workspace, user=owner, status="ready")
    now = datetime.now(UTC)
    pages = [
        DocumentPage(
            workspace_id=workspace.id,
            document_id=document.id,
            page_number=index,
            extracted_text=f"page {index}",
            char_count=6,
            created_at=now,
        )
        for index in (1, 2)
    ]
    db_session.add_all(pages)
    db_session.flush()
    chunks = [
        DocumentChunk(
            workspace_id=workspace.id,
            document_id=document.id,
            page_id=page.id,
            chunk_index=0,
            chunk_text=f"chunk {index}",
            token_count=2,
            char_start=0,
            char_end=7,
            index_version=1,
            created_at=now,
        )
        for index, page in enumerate(pages, start=1)
    ]
    chunks[0].embedding = [0.0, 1.0, 0.0]
    chunks[0].embedding_dimensions = 3
    chunks[0].embedding_provider = "fake"
    chunks[0].embedding_model = "fake-embedding"
    chunks[0].embedding_version = "fake-v1"
    db_session.add_all(chunks)
    db_session.flush()
    job = IngestionJob(
        workspace_id=workspace.id,
        document_id=document.id,
        job_type="embed_chunks",
        status="queued",
        attempt_count=1,
        config_snapshot={
            "embeddingProvider": "fake",
            "embeddingModel": "fake-embedding",
            "embeddingDimensions": 3,
            "embeddingVersion": "fake-v1",
        },
        requested_by_user_id=owner.id,
        queued_at=now,
        created_at=now,
    )
    db_session.add(job)
    db_session.flush()
    document.latest_ingestion_job_id = job.id
    db_session.commit()

    class FailingEmbeddingProvider:
        provider = "fake"
        model = "fake-embedding"
        dimensions = 3
        version = "fake-v1"

        def __init__(self) -> None:
            self.calls = 0

        def embed_documents(self, texts: list[str]) -> list[list[float]]:
            self.calls += 1
            if self.calls == 1:
                return [[1.0, 0.0, 0.0] for _ in texts]
            raise RuntimeError("provider stopped")

        def embed_query(self, text: str) -> list[float]:
            return [1.0, 0.0, 0.0]

    monkeypatch.setattr("ai_pdf_api.services.ingestion.settings.embedding_batch_size", 1)
    claimed_job_id = claim_next_ingestion_job(db_session)
    process_embedding_job(db_session, claimed_job_id, FailingEmbeddingProvider())

    refreshed_document = db_session.get(Document, document.id)
    refreshed_job = db_session.get(IngestionJob, job.id)
    assert refreshed_document is not None
    assert refreshed_document.status == "chunked"
    assert refreshed_job is not None
    assert refreshed_job.status == "failed"


def test_reindex_queues_embed_job_with_embedding_config_snapshot(
    client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    document = create_document(db_session, workspace=workspace, user=owner, status="ready")
    now = datetime.now(UTC)
    page = DocumentPage(
        workspace_id=workspace.id,
        document_id=document.id,
        page_number=1,
        extracted_text="reindex text",
        char_count=12,
        created_at=now,
    )
    db_session.add(page)
    db_session.flush()
    db_session.add(
        DocumentChunk(
            workspace_id=workspace.id,
            document_id=document.id,
            page_id=page.id,
            chunk_index=0,
            chunk_text="reindex text",
            token_count=2,
            char_start=0,
            char_end=12,
            index_version=1,
            created_at=now,
        )
    )
    db_session.commit()

    monkeypatch.setattr("ai_pdf_api.routers.documents.settings.embedding_provider", "fake")
    monkeypatch.setattr("ai_pdf_api.routers.documents.settings.embedding_model", "fake-embedding")
    monkeypatch.setattr("ai_pdf_api.routers.documents.settings.embedding_dimensions", 3)
    monkeypatch.setattr("ai_pdf_api.routers.documents.settings.embedding_version", "fake-v1")

    response = client.post(
        f"/v1/workspaces/{workspace.id}/documents/{document.id}/reindex",
        headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["job"]["jobType"] == "embed_chunks"
    job = db_session.get(IngestionJob, payload["job"]["id"])
    assert job is not None
    assert job.config_snapshot == {
        "source": "reindex",
        "embeddingProvider": "fake",
        "embeddingModel": "fake-embedding",
        "embeddingDimensions": 3,
        "embeddingVersion": "fake-v1",
        "chunkSize": 1200,
    }


def test_ingestion_worker_uses_ocr_for_image_only_pdf(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    document = create_document(db_session, workspace=workspace, user=owner, status="uploaded")
    job = IngestionJob(
        workspace_id=workspace.id,
        document_id=document.id,
        job_type="ingest",
        status="queued",
        attempt_count=1,
        config_snapshot={"source": "test"},
        requested_by_user_id=owner.id,
        queued_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
    )
    db_session.add(job)
    db_session.flush()
    document.latest_ingestion_job_id = job.id
    db_session.commit()

    class FakePage:
        def extract_text(self) -> str:
            return ""

    class FakeReader:
        pages = [FakePage(), FakePage()]

    monkeypatch.setattr("ai_pdf_api.services.ingestion.download_bytes", lambda object_key: b"image-pdf")
    monkeypatch.setattr("ai_pdf_api.services.ingestion.PdfReader", lambda payload: FakeReader())

    claimed_job_id = claim_next_ingestion_job(db_session)
    assert claimed_job_id == job.id
    process_ingestion_job(
        db_session,
        claimed_job_id,
        ocr_extract_page_texts=lambda payload: [
            PageTextResult(
                page_number=1,
                text="扫描件第一页",
                ocr_blocks=[{"text": "扫描件第一页", "x": 0.1, "y": 0.2, "width": 0.7, "height": 0.1}],
            ),
            PageTextResult(page_number=2, text="扫描件第二页"),
        ],
    )

    refreshed_document = db_session.get(Document, document.id)
    pages = db_session.scalars(select(DocumentPage).where(DocumentPage.document_id == document.id)).all()
    assert refreshed_document is not None
    assert refreshed_document.status == "chunked"
    assert [page.extracted_text for page in pages] == ["扫描件第一页", "扫描件第二页"]
    assert pages[0].ocr_blocks == [
        {"text": "扫描件第一页", "x": 0.1, "y": 0.2, "width": 0.7, "height": 0.1}
    ]
    assert pages[1].ocr_blocks == []


def test_ingestion_worker_reclaims_stale_job(db_session: Session) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    document = create_document(db_session, workspace=workspace, user=owner, status="parsing")
    job = IngestionJob(
        workspace_id=workspace.id,
        document_id=document.id,
        job_type="ingest",
        status="running",
        attempt_count=1,
        config_snapshot={"source": "test"},
        requested_by_user_id=owner.id,
        queued_at=datetime.now(UTC) - INGESTION_LEASE_TIMEOUT - timedelta(minutes=1),
        started_at=datetime.now(UTC) - INGESTION_LEASE_TIMEOUT - timedelta(minutes=1),
        created_at=datetime.now(UTC),
    )
    db_session.add(job)
    db_session.flush()
    document.latest_ingestion_job_id = job.id
    db_session.commit()

    claimed_job_id = claim_next_ingestion_job(db_session)

    refreshed_job = db_session.get(IngestionJob, job.id)
    assert claimed_job_id == job.id
    assert refreshed_job is not None
    assert refreshed_job.status == "running"
    assert refreshed_job.attempt_count == 2
    assert db_session.get(Document, document.id).status == "parsing"


def test_ingestion_worker_marks_invalid_pdf_failed(db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    document = create_document(db_session, workspace=workspace, user=owner, status="uploaded")
    job = IngestionJob(
        workspace_id=workspace.id,
        document_id=document.id,
        job_type="ingest",
        status="queued",
        attempt_count=1,
        config_snapshot={"source": "test"},
        requested_by_user_id=owner.id,
        queued_at=datetime.now(UTC),
        created_at=datetime.now(UTC),
    )
    db_session.add(job)
    db_session.flush()
    document.latest_ingestion_job_id = job.id
    db_session.commit()

    monkeypatch.setattr("ai_pdf_api.services.ingestion.download_bytes", lambda object_key: b"not a pdf")
    claimed_job_id = claim_next_ingestion_job(db_session)
    assert claimed_job_id == job.id

    process_ingestion_job(db_session, claimed_job_id)

    refreshed_document = db_session.get(Document, document.id)
    refreshed_job = db_session.get(IngestionJob, job.id)
    assert refreshed_document is not None
    assert refreshed_document.status == "failed"
    assert refreshed_job is not None
    assert refreshed_job.status == "failed"
    assert refreshed_job.error_code == "ingestion_failed"


def test_token_count_estimate_handles_cjk_and_words() -> None:
    assert estimate_token_count("中文文本") == 4
    assert estimate_token_count("hello world") == 2


def test_document_detail_returns_persisted_page_text(client: TestClient, db_session: Session) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    document = create_document(db_session, workspace=workspace, user=owner, status="chunked")
    db_session.add(
        DocumentPage(
            workspace_id=workspace.id,
            document_id=document.id,
            page_number=1,
            extracted_text="Extracted page text.",
            char_count=20,
        ),
    )
    db_session.commit()

    response = client.get(
        f"/v1/workspaces/{workspace.id}/documents/{document.id}",
        params={"pageNumber": 1},
        headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["document"]["id"] == document.id
    assert payload["pages"] == [
        {"pageNumber": 1, "text": "Extracted page text.", "charCount": 20, "ocrBlocks": []}
    ]

    missing_page = client.get(
        f"/v1/workspaces/{workspace.id}/documents/{document.id}",
        params={"pageNumber": 2},
        headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id},
    )
    assert missing_page.status_code == 404
    assert missing_page.json()["detail"] == "Document page not found."


def test_document_detail_returns_persisted_ocr_blocks(client: TestClient, db_session: Session) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    document = create_document(db_session, workspace=workspace, user=owner, status="chunked")
    db_session.add(
        DocumentPage(
            workspace_id=workspace.id,
            document_id=document.id,
            page_number=1,
            extracted_text="扫描文本",
            char_count=4,
            ocr_blocks=[{"text": "扫描文本", "x": 0.1, "y": 0.2, "width": 0.7, "height": 0.1}],
        )
    )
    db_session.commit()

    response = client.get(
        f"/v1/workspaces/{workspace.id}/documents/{document.id}",
        params={"pageNumber": 1},
        headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id},
    )

    assert response.status_code == 200
    assert response.json()["pages"][0]["ocrBlocks"] == [
        {"text": "扫描文本", "x": 0.1, "y": 0.2, "width": 0.7, "height": 0.1}
    ]


def test_delete_document_requires_owner_and_soft_deletes(client: TestClient, db_session: Session) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    member = create_user(db_session, email="member@example.com", name="Member")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    db_session.add(WorkspaceMembership(workspace_id=workspace.id, user_id=member.id, role="member"))
    db_session.commit()
    document = create_document(db_session, workspace=workspace, user=owner)
    page = DocumentPage(
        workspace_id=workspace.id,
        document_id=document.id,
        page_number=1,
        extracted_text="Delete me.",
        char_count=10,
    )
    db_session.add(page)
    db_session.flush()
    db_session.add(
        DocumentChunk(
            workspace_id=workspace.id,
            document_id=document.id,
            page_id=page.id,
            chunk_index=0,
            chunk_text="Delete me.",
            token_count=2,
            char_start=0,
            char_end=10,
            index_version=1,
        ),
    )
    db_session.commit()

    forbidden = client.delete(f"/v1/workspaces/{workspace.id}/documents/{document.id}", headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": member.id})
    assert forbidden.status_code == 403

    deleted = client.delete(f"/v1/workspaces/{workspace.id}/documents/{document.id}", headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id})
    assert deleted.status_code == 204

    refreshed = db_session.get(Document, document.id)
    assert refreshed is not None
    assert refreshed.deleted_at is not None
    assert refreshed.status == "deleted"
    assert db_session.scalars(select(DocumentPage).where(DocumentPage.document_id == document.id)).all() == []
    assert db_session.scalars(select(DocumentChunk).where(DocumentChunk.document_id == document.id)).all() == []

    list_response = client.get(f"/v1/workspaces/{workspace.id}/documents", headers={"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": owner.id})
    assert list_response.status_code == 200
    assert list_response.json()["items"] == []


def test_split_page_text_honors_workspace_chunk_size() -> None:
    chunks = split_page_text("word " * 300, chunk_size=200)

    assert len(chunks) > 1
    assert all(len(chunk_text) <= 200 for _start, _end, chunk_text in chunks)
