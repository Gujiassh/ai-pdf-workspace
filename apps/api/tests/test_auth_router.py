from collections.abc import Generator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ai_pdf_api.db.base import Base
from ai_pdf_api.db.session import get_db
from ai_pdf_api.models import User
from ai_pdf_api.routers.auth import router as auth_router


@pytest.fixture()
def db_session() -> Generator[Session, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def client(db_session: Session) -> Generator[TestClient, None, None]:
    app = FastAPI()
    app.include_router(auth_router)

    def override_get_db() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_register_creates_user_and_hashes_password(client: TestClient, db_session: Session) -> None:
    response = client.post(
        "/v1/auth/register",
        json={
            "email": "demo@example.com",
            "name": "Demo",
            "password": "secret123",
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["user"]["email"] == "demo@example.com"
    assert payload["user"]["name"] == "Demo"
    assert payload["user"]["avatarUrl"].endswith("seed=demo@example.com")

    user = db_session.scalar(select(User).where(User.email == "demo@example.com"))
    assert user is not None
    assert user.password_hash != "secret123"
    assert user.password_hash


def test_register_rejects_duplicate_email(client: TestClient) -> None:
    payload = {
        "email": "demo@example.com",
        "name": "Demo",
        "password": "secret123",
    }

    first = client.post("/v1/auth/register", json=payload)
    second = client.post("/v1/auth/register", json=payload)

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()["detail"] == "Email already registered."


def test_login_returns_user_after_successful_registration(client: TestClient) -> None:
    client.post(
        "/v1/auth/register",
        json={
            "email": "demo@example.com",
            "name": "Demo",
            "password": "secret123",
        },
    )

    response = client.post(
        "/v1/auth/login",
        json={
            "email": "demo@example.com",
            "password": "secret123",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"] == {
        "id": payload["user"]["id"],
        "email": "demo@example.com",
        "name": "Demo",
        "avatarUrl": "https://api.dicebear.com/7.x/bottts/svg?seed=demo@example.com",
    }


def test_login_rejects_wrong_password(client: TestClient) -> None:
    client.post(
        "/v1/auth/register",
        json={
            "email": "demo@example.com",
            "name": "Demo",
            "password": "secret123",
        },
    )

    response = client.post(
        "/v1/auth/login",
        json={
            "email": "demo@example.com",
            "password": "wrongpass",
        },
    )

    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid email or password."
