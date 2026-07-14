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
from ai_pdf_api.models import User, Workspace, WorkspaceMembership
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
    headers = {"x-user-id": user.id}
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
