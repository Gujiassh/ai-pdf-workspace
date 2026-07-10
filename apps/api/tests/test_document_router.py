from collections.abc import Generator
from datetime import UTC, datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ai_pdf_api.db.base import Base
from ai_pdf_api.db.session import get_db
from ai_pdf_api.models import Document, IngestionJob, User, Workspace, WorkspaceMembership
from ai_pdf_api.routers.documents import router as documents_router
from ai_pdf_api.routers.jobs import router as jobs_router


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

    monkeypatch.setattr("ai_pdf_api.routers.documents.upload_bytes", lambda *args, **kwargs: None)
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

    response = client.get(f"/v1/workspaces/{workspace.id}/documents", headers={"x-user-id": stranger.id})

    assert response.status_code == 404
    assert response.json()["detail"] == "Workspace not found."


def test_create_upload_session_persists_pending_document(client: TestClient, db_session: Session) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")

    response = client.post(
        f"/v1/workspaces/{workspace.id}/documents/upload-session",
        headers={"x-user-id": owner.id},
        json={
            "sourceFilename": "attention.pdf",
            "mimeType": "application/pdf",
            "byteSize": 4567,
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


def test_binary_upload_and_finalize_creates_queued_ingestion_job(client: TestClient, db_session: Session) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    upload_session = client.post(
        f"/v1/workspaces/{workspace.id}/documents/upload-session",
        headers={"x-user-id": owner.id},
        json={
            "sourceFilename": "attention.pdf",
            "mimeType": "application/pdf",
            "byteSize": 4567,
            "title": "Attention Is All You Need",
        },
    ).json()

    document_id = upload_session["document"]["id"]
    object_key = upload_session["upload"]["objectKey"]

    upload_response = client.put(
        f"/v1/workspaces/{workspace.id}/documents/{document_id}/upload",
        headers={"x-user-id": owner.id, "content-type": "application/pdf"},
        params={"objectKey": object_key},
        content=b"%PDF-1.7 fake pdf bytes",
    )
    assert upload_response.status_code == 204

    finalize_response = client.post(
        f"/v1/workspaces/{workspace.id}/documents/{document_id}/finalize-upload",
        headers={"x-user-id": owner.id},
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

    response = client.get(f"/v1/workspaces/{workspace.id}/jobs/{job.id}", headers={"x-user-id": owner.id})

    assert response.status_code == 200
    payload = response.json()
    assert payload["job"]["id"] == job.id
    assert payload["job"]["documentId"] == document.id


def test_delete_document_requires_owner_and_soft_deletes(client: TestClient, db_session: Session) -> None:
    owner = create_user(db_session, email="owner@example.com", name="Owner")
    member = create_user(db_session, email="member@example.com", name="Member")
    workspace = create_workspace_with_membership(db_session, user=owner, name="Docs")
    db_session.add(WorkspaceMembership(workspace_id=workspace.id, user_id=member.id, role="member"))
    db_session.commit()
    document = create_document(db_session, workspace=workspace, user=owner)

    forbidden = client.delete(f"/v1/workspaces/{workspace.id}/documents/{document.id}", headers={"x-user-id": member.id})
    assert forbidden.status_code == 403

    deleted = client.delete(f"/v1/workspaces/{workspace.id}/documents/{document.id}", headers={"x-user-id": owner.id})
    assert deleted.status_code == 204

    refreshed = db_session.get(Document, document.id)
    assert refreshed is not None
    assert refreshed.deleted_at is not None
    assert refreshed.status == "deleted"

    list_response = client.get(f"/v1/workspaces/{workspace.id}/documents", headers={"x-user-id": owner.id})
    assert list_response.status_code == 200
    assert list_response.json()["items"] == []
