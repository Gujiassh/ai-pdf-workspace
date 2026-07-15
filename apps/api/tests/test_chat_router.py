from collections.abc import Generator
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ai_pdf_api.db.base import Base
from ai_pdf_api.db.session import get_db
from ai_pdf_api.models import ChatMessage, ChatThread, User, Workspace, WorkspaceMembership
from ai_pdf_api.routers.chat import router


def setup_client() -> tuple[TestClient, Session, User, Workspace]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(bind=engine)
    session = sessionmaker(bind=engine, autoflush=False, future=True)()
    now = datetime.now(UTC)
    user = User(
        id=str(uuid4()),
        email="chat-owner@example.com",
        name="Owner",
        password_hash="hash",
        avatar_url="https://example.com/avatar.svg",
    )
    workspace = Workspace(
        id=str(uuid4()),
        name="Chat workspace",
        created_by_user_id=user.id,
        created_at=now,
        updated_at=now,
    )
    session.add_all([user, workspace])
    session.flush()
    session.add(WorkspaceMembership(workspace_id=workspace.id, user_id=user.id, role="owner"))
    session.commit()

    app = FastAPI()

    def override_get_db() -> Generator[Session, None, None]:
        yield session

    app.include_router(router)
    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), session, user, workspace


def test_thread_routes_persist_and_archive_threads() -> None:
    client, session, user, workspace = setup_client()
    headers = {"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": user.id}
    try:
        created = client.post(
            f"/v1/workspaces/{workspace.id}/threads",
            headers=headers,
            json={"title": "Review"},
        )
        assert created.status_code == 201
        thread_id = created.json()["thread"]["id"]

        listed = client.get(f"/v1/workspaces/{workspace.id}/threads", headers=headers)
        assert listed.status_code == 200
        assert [item["id"] for item in listed.json()["items"]] == [thread_id]

        messages = client.get(
            f"/v1/workspaces/{workspace.id}/threads/{thread_id}/messages",
            headers=headers,
        )
        assert messages.status_code == 200
        assert messages.json()["messages"] == []

        deleted = client.delete(f"/v1/workspaces/{workspace.id}/threads/{thread_id}", headers=headers)
        assert deleted.status_code == 204
        assert client.get(f"/v1/workspaces/{workspace.id}/threads", headers=headers).json()["items"] == []
    finally:
        session.close()


def test_thread_messages_returns_active_branch_in_parent_order() -> None:
    client, session, user, workspace = setup_client()
    headers = {"x-ai-pdf-internal-token": "local-development-internal-token", "x-user-id": user.id}
    now = datetime.now(UTC)
    thread = ChatThread(
        id=str(uuid4()),
        workspace_id=workspace.id,
        created_by_user_id=user.id,
        title="Branching",
        last_message_at=now,
        created_at=now,
        updated_at=now,
    )
    first_user = ChatMessage(
        id=str(uuid4()),
        workspace_id=workspace.id,
        thread_id=thread.id,
        parent_message_id=None,
        role="user",
        content="First question",
        status="completed",
        created_at=now,
    )
    first_answer = ChatMessage(
        id=str(uuid4()),
        workspace_id=workspace.id,
        thread_id=thread.id,
        parent_message_id=first_user.id,
        role="assistant",
        content="First answer",
        status="completed",
        created_at=now,
    )
    active_user = ChatMessage(
        id=str(uuid4()),
        workspace_id=workspace.id,
        thread_id=thread.id,
        parent_message_id=first_answer.id,
        role="user",
        content="Active question",
        status="completed",
        created_at=now,
    )
    active_answer = ChatMessage(
        id=str(uuid4()),
        workspace_id=workspace.id,
        thread_id=thread.id,
        parent_message_id=active_user.id,
        role="assistant",
        content="Active answer",
        status="completed",
        created_at=now,
    )
    hidden_user = ChatMessage(
        id=str(uuid4()),
        workspace_id=workspace.id,
        thread_id=thread.id,
        parent_message_id=first_answer.id,
        role="user",
        content="Hidden question",
        status="completed",
        created_at=now,
    )
    hidden_answer = ChatMessage(
        id=str(uuid4()),
        workspace_id=workspace.id,
        thread_id=thread.id,
        parent_message_id=hidden_user.id,
        role="assistant",
        content="Hidden answer",
        status="completed",
        created_at=now,
    )
    thread.active_message_id = active_answer.id
    session.add_all([thread, first_user, first_answer, active_user, active_answer, hidden_user, hidden_answer])
    session.commit()

    try:
        response = client.get(
            f"/v1/workspaces/{workspace.id}/threads/{thread.id}/messages",
            headers=headers,
        )

        assert response.status_code == 200
        messages = response.json()["messages"]
        assert [message["content"] for message in messages] == [
            "First question",
            "First answer",
            "Active question",
            "Active answer",
        ]
        assert messages[2]["parentMessageId"] == first_answer.id
        assert messages[3]["parentMessageId"] == active_user.id
    finally:
        session.close()
