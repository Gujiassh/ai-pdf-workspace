from collections.abc import Generator
from datetime import UTC, datetime
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ai_pdf_api.db.base import Base
from ai_pdf_api.db.session import get_db
from ai_pdf_api.models import (
    ChatMessage,
    ChatThread,
    Document,
    DocumentTag,
    MessageCitation,
    Note,
    NoteSource,
    NoteTag,
    User,
    Workspace,
    WorkspaceMembership,
)
from ai_pdf_api.routers.notes import router


@pytest.fixture()
def notes_app() -> Generator[tuple[TestClient, Session, User, Workspace, User, Workspace], None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False, future=True)()
    now = datetime.now(UTC)

    owner = User(
        id=str(uuid4()),
        email="notes-owner@example.com",
        name="Notes owner",
        password_hash="hash",
        avatar_url="https://example.com/owner.svg",
    )
    other = User(
        id=str(uuid4()),
        email="notes-other@example.com",
        name="Other owner",
        password_hash="hash",
        avatar_url="https://example.com/other.svg",
    )
    workspace = Workspace(
        id=str(uuid4()),
        name="Notes workspace",
        created_by_user_id=owner.id,
        created_at=now,
        updated_at=now,
    )
    other_workspace = Workspace(
        id=str(uuid4()),
        name="Other workspace",
        created_by_user_id=other.id,
        created_at=now,
        updated_at=now,
    )
    session.add_all([owner, other, workspace, other_workspace])
    session.flush()
    session.add_all(
        [
            WorkspaceMembership(workspace_id=workspace.id, user_id=owner.id, role="owner"),
            WorkspaceMembership(workspace_id=other_workspace.id, user_id=other.id, role="owner"),
        ]
    )
    session.commit()

    app = FastAPI()
    app.include_router(router)

    def override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client, session, owner, workspace, other, other_workspace
    app.dependency_overrides.clear()
    session.close()


def create_document(session: Session, *, workspace: Workspace, user: User) -> Document:
    document = Document(
        id=str(uuid4()),
        workspace_id=workspace.id,
        created_by_user_id=user.id,
        title="Source paper",
        source_filename="source.pdf",
        object_key=f"workspaces/{workspace.id}/documents/source.pdf",
        mime_type="application/pdf",
        byte_size=100,
        status="ready",
        current_index_version=1,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(document)
    session.commit()
    return document


def create_citation(session: Session, *, workspace: Workspace, user: User, document: Document) -> MessageCitation:
    now = datetime.now(UTC)
    thread = ChatThread(
        id=str(uuid4()),
        workspace_id=workspace.id,
        created_by_user_id=user.id,
        title="Research",
        last_message_at=now,
        created_at=now,
        updated_at=now,
    )
    message = ChatMessage(
        id=str(uuid4()),
        workspace_id=workspace.id,
        thread_id=thread.id,
        role="assistant",
        content="An answer with a source.",
        status="completed",
        created_at=now,
    )
    citation = MessageCitation(
        id=str(uuid4()),
        workspace_id=workspace.id,
        message_id=message.id,
        citation_index=0,
        document_id=document.id,
        chunk_id=None,
        page_number_snapshot=8,
        document_title_snapshot=document.title,
        excerpt_snapshot="A persisted source excerpt.",
        index_version_snapshot=1,
        created_at=now,
    )
    session.add_all([thread, message, citation])
    session.commit()
    return citation


def headers(user: User) -> dict[str, str]:
    return {"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": user.id}


def test_create_note_persists_citation_snapshot(notes_app) -> None:
    client, session, owner, workspace, _other, _other_workspace = notes_app
    document = create_document(session, workspace=workspace, user=owner)
    citation = create_citation(session, workspace=workspace, user=owner, document=document)

    response = client.post(
        f"/v1/workspaces/{workspace.id}/notes",
        headers=headers(owner),
        json={
            "title": "Method notes",
            "bodyMd": "The method is useful.",
            "sourceCitationIds": [citation.id],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    note = payload["note"]
    source = payload["sources"][0]
    assert note["workspaceId"] == workspace.id
    assert note["tagIds"] == []
    assert note["tags"] == []
    assert source == note["sources"][0]
    assert source["messageCitationId"] == citation.id
    assert source["documentId"] == document.id
    assert source["documentTitle"] == "Source paper"
    assert source["pageNumber"] == 8
    assert source["excerpt"] == "A persisted source excerpt."

    persisted = session.scalar(select(Note).where(Note.id == note["id"]))
    assert persisted is not None
    source_row = session.scalar(select(NoteSource).where(NoteSource.note_id == persisted.id))
    assert source_row is not None
    assert source_row.message_citation_id == citation.id
    assert source_row.document_title_snapshot == "Source paper"


@pytest.mark.parametrize("citation_kind", ["missing", "cross_workspace"])
def test_create_note_rejects_invalid_citation_without_partial_note(notes_app, citation_kind: str) -> None:
    client, session, owner, workspace, other, other_workspace = notes_app
    citation_id = str(uuid4())
    if citation_kind == "cross_workspace":
        other_document = create_document(session, workspace=other_workspace, user=other)
        citation_id = create_citation(
            session,
            workspace=other_workspace,
            user=other,
            document=other_document,
        ).id

    response = client.post(
        f"/v1/workspaces/{workspace.id}/notes",
        headers=headers(owner),
        json={"bodyMd": "Should not be saved.", "sourceCitationIds": [citation_id]},
    )

    assert response.status_code == 404
    assert session.scalar(select(func.count()).select_from(Note).where(Note.workspace_id == workspace.id)) == 0


def test_tags_and_bindings_return_refreshable_snapshots_and_replace_relations(notes_app) -> None:
    client, session, owner, workspace, _other, _other_workspace = notes_app
    document = create_document(session, workspace=workspace, user=owner)
    note_response = client.post(
        f"/v1/workspaces/{workspace.id}/notes",
        headers=headers(owner),
        json={"bodyMd": "A free note."},
    )
    note_id = note_response.json()["note"]["id"]
    tag_one = client.post(
        f"/v1/workspaces/{workspace.id}/tags",
        headers=headers(owner),
        json={"name": "Important", "slug": "important", "color": "#f97316"},
    ).json()["tag"]
    tag_two = client.post(
        f"/v1/workspaces/{workspace.id}/tags",
        headers=headers(owner),
        json={"name": "Review", "slug": "review"},
    ).json()["tag"]

    document_binding = client.post(
        f"/v1/workspaces/{workspace.id}/documents/{document.id}/tags",
        headers=headers(owner),
        json={"tagIds": [tag_one["id"], tag_two["id"]]},
    )
    assert document_binding.status_code == 200
    assert document_binding.json()["tagIds"] == [tag_one["id"], tag_two["id"]]

    note_binding = client.post(
        f"/v1/workspaces/{workspace.id}/notes/{note_id}/tags",
        headers=headers(owner),
        json={"tagIds": [tag_one["id"]]},
    )
    assert note_binding.status_code == 200
    assert note_binding.json()["tagIds"] == [tag_one["id"]]

    tags = client.get(f"/v1/workspaces/{workspace.id}/tags", headers=headers(owner)).json()["items"]
    by_id = {tag["id"]: tag for tag in tags}
    assert by_id[tag_one["id"]]["documentIds"] == [document.id]
    assert by_id[tag_one["id"]]["noteIds"] == [note_id]
    assert by_id[tag_two["id"]]["documentIds"] == [document.id]
    assert by_id[tag_two["id"]]["noteIds"] == []

    notes = client.get(f"/v1/workspaces/{workspace.id}/notes", headers=headers(owner)).json()["items"]
    note = next(item for item in notes if item["id"] == note_id)
    assert note["tagIds"] == [tag_one["id"]]
    assert note["tags"][0]["name"] == "Important"

    cleared_note = client.post(
        f"/v1/workspaces/{workspace.id}/notes/{note_id}/tags",
        headers=headers(owner),
        json={"tagIds": []},
    )
    assert cleared_note.status_code == 200
    assert cleared_note.json()["tagIds"] == []
    assert session.scalar(select(NoteTag).where(NoteTag.note_id == note_id)) is None

    cleared_document = client.post(
        f"/v1/workspaces/{workspace.id}/documents/{document.id}/tags",
        headers=headers(owner),
        json={"tagIds": []},
    )
    assert cleared_document.status_code == 200
    assert cleared_document.json()["tagIds"] == []
    assert session.scalar(select(DocumentTag).where(DocumentTag.document_id == document.id)) is None


def test_workspace_isolation_rejects_foreign_resources_and_tag_ids(notes_app) -> None:
    client, session, owner, workspace, other, other_workspace = notes_app
    document = create_document(session, workspace=workspace, user=owner)
    foreign_tag_response = client.post(
        f"/v1/workspaces/{other_workspace.id}/tags",
        headers=headers(other),
        json={"name": "Private", "slug": "private"},
    )
    assert foreign_tag_response.status_code == 201
    foreign_tag_id = foreign_tag_response.json()["tag"]["id"]

    denied_workspace = client.get(f"/v1/workspaces/{other_workspace.id}/tags", headers=headers(owner))
    assert denied_workspace.status_code == 404
    denied_binding = client.post(
        f"/v1/workspaces/{workspace.id}/documents/{document.id}/tags",
        headers=headers(owner),
        json={"tagIds": [foreign_tag_id]},
    )
    assert denied_binding.status_code == 404
    assert session.scalar(select(DocumentTag).where(DocumentTag.document_id == document.id)) is None


def test_deleting_tag_cleans_document_and_note_relations(notes_app) -> None:
    client, session, owner, workspace, _other, _other_workspace = notes_app
    document = create_document(session, workspace=workspace, user=owner)
    note_id = client.post(
        f"/v1/workspaces/{workspace.id}/notes",
        headers=headers(owner),
        json={"bodyMd": "A note."},
    ).json()["note"]["id"]
    tag_id = client.post(
        f"/v1/workspaces/{workspace.id}/tags",
        headers=headers(owner),
        json={"name": "Delete me", "slug": "delete-me"},
    ).json()["tag"]["id"]
    client.post(
        f"/v1/workspaces/{workspace.id}/documents/{document.id}/tags",
        headers=headers(owner),
        json={"tagIds": [tag_id]},
    )
    client.post(
        f"/v1/workspaces/{workspace.id}/notes/{note_id}/tags",
        headers=headers(owner),
        json={"tagIds": [tag_id]},
    )

    deleted = client.delete(f"/v1/workspaces/{workspace.id}/tags/{tag_id}", headers=headers(owner))

    assert deleted.status_code == 204
    assert session.scalar(select(DocumentTag).where(DocumentTag.tag_id == tag_id)) is None
    assert session.scalar(select(NoteTag).where(NoteTag.tag_id == tag_id)) is None
    assert client.get(f"/v1/workspaces/{workspace.id}/tags/{tag_id}", headers=headers(owner)).status_code == 404
