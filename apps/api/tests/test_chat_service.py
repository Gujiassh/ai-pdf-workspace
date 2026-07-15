from datetime import UTC, datetime
from uuid import uuid4

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ai_pdf_api.db.base import Base
from ai_pdf_api.models import (
    ChatMessage,
    ChatThread,
    Document,
    DocumentChunk,
    DocumentPage,
    User,
    Workspace,
    WorkspaceMembership,
)
from ai_pdf_api.services.chat import ChatError, active_message_path, complete_chat
from ai_pdf_api.services.retrieval import retrieve_chunks


class FakeEmbeddingProvider:
    provider = "fake"
    model = "fake-embedding"
    dimensions = 3
    version = "fake-v1"

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [[1.0, 0.0, 0.0] for _ in texts]

    def embed_query(self, _text: str) -> list[float]:
        return [1.0, 0.0, 0.0]


class FakeGenerationProvider:
    provider = "fake"
    model = "fake-generation"

    def generate(self, messages: list[dict[str, str]]) -> str:
        assert any("PDF context" in message["content"] for message in messages)
        return "The answer is supported by [1]."


def build_session() -> tuple[Session, str, ChatThread]:
    engine = create_engine("sqlite://", future=True)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, future=True)()
    now = datetime.now(UTC)
    user = User(
        id=str(uuid4()),
        email="owner@example.com",
        name="Owner",
        password_hash="hash",
        avatar_url="https://example.com/avatar.svg",
    )
    workspace = Workspace(id=str(uuid4()), name="Research", created_by_user_id=user.id, created_at=now, updated_at=now)
    session.add_all([user, workspace])
    session.flush()
    session.add(WorkspaceMembership(workspace_id=workspace.id, user_id=user.id, role="owner"))
    document = Document(
        id=str(uuid4()),
        workspace_id=workspace.id,
        created_by_user_id=user.id,
        title="Source PDF",
        source_filename="source.pdf",
        object_key="source.pdf",
        mime_type="application/pdf",
        byte_size=10,
        page_count=1,
        status="ready",
        current_index_version=1,
        created_at=now,
        updated_at=now,
    )
    session.add(document)
    session.flush()
    page = DocumentPage(
        id=str(uuid4()),
        workspace_id=workspace.id,
        document_id=document.id,
        page_number=4,
        extracted_text="retrieval evidence",
        char_count=19,
        created_at=now,
    )
    session.add(page)
    session.flush()
    session.add(
        DocumentChunk(
            id=str(uuid4()),
            workspace_id=workspace.id,
            document_id=document.id,
            page_id=page.id,
            chunk_index=0,
            chunk_text="retrieval evidence",
            token_count=2,
            char_start=0,
            char_end=19,
            index_version=1,
            embedding=[1.0, 0.0, 0.0],
            embedding_dimensions=3,
            embedding_provider="fake",
            embedding_model="fake-embedding",
            embedding_version="fake-v1",
            created_at=now,
        )
    )
    thread = ChatThread(
        id=str(uuid4()),
        workspace_id=workspace.id,
        created_by_user_id=user.id,
        title=None,
        last_message_at=now,
        created_at=now,
        updated_at=now,
    )
    session.add(thread)
    session.commit()
    return session, workspace.id, thread


def test_retrieval_is_workspace_and_provider_scoped() -> None:
    session, workspace_id, _thread = build_session()
    provider = FakeEmbeddingProvider()

    results = retrieve_chunks(session, workspace_id, [1.0, 0.0, 0.0], embedding_provider=provider)

    assert len(results) == 1
    assert results[0].page.page_number == 4
    assert results[0].document.title == "Source PDF"


def test_retrieval_rejects_cross_workspace_document_links() -> None:
    session, workspace_id, _thread = build_session()
    document = session.query(Document).one()
    document.workspace_id = str(uuid4())
    session.flush()

    results = retrieve_chunks(
        session,
        workspace_id,
        [1.0, 0.0, 0.0],
        embedding_provider=FakeEmbeddingProvider(),
    )

    assert results == []


def test_complete_chat_persists_messages_and_citation_snapshot() -> None:
    session, workspace_id, thread = build_session()

    result = complete_chat(
        session,
        workspace_id=workspace_id,
        user_id="owner",
        thread=thread,
        question="What is the evidence?",
        embedding_provider=FakeEmbeddingProvider(),
        generation_provider=FakeGenerationProvider(),
    )

    assert result.assistant_message.content == "The answer is supported by [1]."
    assert len(result.citations) == 1
    assert result.citations[0].page_number_snapshot == 4
    assert result.citations[0].document_title_snapshot == "Source PDF"
    assert thread.title == "What is the evidence?"
    assert session.query(DocumentChunk).count() == 1


def test_chat_messages_form_ordered_branches_and_active_path() -> None:
    session, workspace_id, thread = build_session()

    first = complete_chat(
        session,
        workspace_id=workspace_id,
        user_id="owner",
        thread=thread,
        question="First question",
        embedding_provider=FakeEmbeddingProvider(),
        generation_provider=FakeGenerationProvider(),
    )
    second = complete_chat(
        session,
        workspace_id=workspace_id,
        user_id="owner",
        thread=thread,
        question="Follow-up question",
        parent_message_id=first.assistant_message.id,
        embedding_provider=FakeEmbeddingProvider(),
        generation_provider=FakeGenerationProvider(),
    )

    assert first.user_message.parent_message_id is None
    assert first.assistant_message.parent_message_id == first.user_message.id
    assert second.user_message.parent_message_id == first.assistant_message.id
    assert thread.active_message_id == second.assistant_message.id
    assert [message.id for message in active_message_path(session, thread)] == [
        first.user_message.id,
        first.assistant_message.id,
        second.user_message.id,
        second.assistant_message.id,
    ]

    edited = complete_chat(
        session,
        workspace_id=workspace_id,
        user_id="owner",
        thread=thread,
        question="Edited first question",
        parent_message_id=None,
        use_thread_active_parent=False,
        embedding_provider=FakeEmbeddingProvider(),
        generation_provider=FakeGenerationProvider(),
    )

    assert edited.user_message.parent_message_id is None
    assert [message.id for message in active_message_path(session, thread)] == [
        edited.user_message.id,
        edited.assistant_message.id,
    ]


def test_active_message_path_rejects_a_missing_active_leaf() -> None:
    session, _workspace_id, thread = build_session()
    message = ChatMessage(
        id=str(uuid4()),
        workspace_id=thread.workspace_id,
        thread_id=thread.id,
        parent_message_id=None,
        role="user",
        content="orphaned message",
        status="completed",
        created_at=datetime.now(UTC),
    )
    session.add(message)
    session.commit()

    try:
        with pytest.raises(ChatError, match="no active leaf"):
            active_message_path(session, thread)
    finally:
        session.close()
