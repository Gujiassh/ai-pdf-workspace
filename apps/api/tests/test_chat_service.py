from datetime import UTC, datetime
from uuid import uuid4

import pytest
from ai_pdf_api.core.metrics import RETRIEVAL_REQUESTS
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
from ai_pdf_api.services.retrieval import (
    RetrievedChunk,
    _lexical_terms,
    _rrf_merge,
    retrieve_chunks,
    retrieve_lexical_chunks,
    retrieve_query_chunks,
)


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

    def __init__(self) -> None:
        self.messages: list[dict[str, str]] = []

    def generate(self, messages: list[dict[str, str]]) -> str:
        self.messages = messages
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


def test_lexical_and_hybrid_retrieval_preserve_workspace_scope() -> None:
    session, workspace_id, _thread = build_session()
    provider = FakeEmbeddingProvider()

    lexical = retrieve_lexical_chunks(session, workspace_id, "retrieval evidence")
    hybrid = retrieve_query_chunks(
        session,
        workspace_id,
        "retrieval evidence",
        [1.0, 0.0, 0.0],
        embedding_provider=provider,
        limit=3,
        strategy="hybrid",
    )

    assert [item.page.page_number for item in lexical] == [4]
    assert [item.page.page_number for item in hybrid] == [4]


def test_dense_strategy_does_not_execute_lexical_query(monkeypatch: pytest.MonkeyPatch) -> None:
    import ai_pdf_api.services.retrieval as retrieval_service

    session, workspace_id, _thread = build_session()

    def fail_lexical(*_args, **_kwargs):
        raise AssertionError("dense retrieval must not execute lexical retrieval")

    monkeypatch.setattr(retrieval_service, "retrieve_lexical_chunks", fail_lexical)

    results = retrieve_query_chunks(
        session,
        workspace_id,
        "retrieval evidence",
        [1.0, 0.0, 0.0],
        embedding_provider=FakeEmbeddingProvider(),
        strategy="dense",
    )

    assert [item.page.page_number for item in results] == [4]


def test_lexical_retrieval_ignores_stale_index_versions() -> None:
    session, workspace_id, _thread = build_session()
    document = session.query(Document).one()
    page = session.query(DocumentPage).one()
    session.add(
        DocumentChunk(
            id=str(uuid4()),
            workspace_id=workspace_id,
            document_id=document.id,
            page_id=page.id,
            chunk_index=1,
            chunk_text="stale-only-keyword",
            token_count=1,
            char_start=0,
            char_end=18,
            index_version=0,
            created_at=datetime.now(UTC),
        )
    )
    session.commit()

    assert retrieve_lexical_chunks(session, workspace_id, "stale-only-keyword") == []


def test_lexical_retrieval_expands_candidates_past_stale_chunks() -> None:
    session, workspace_id, _thread = build_session()
    document = session.query(Document).one()
    page = session.query(DocumentPage).one()
    current_chunk = session.query(DocumentChunk).one()
    current_chunk.chunk_text = "目标答案"
    for index in range(3):
        session.add(
            DocumentChunk(
                id=f"00000000-0000-0000-0000-00000000000{index}",
                workspace_id=workspace_id,
                document_id=document.id,
                page_id=page.id,
                chunk_index=index + 1,
                chunk_text="目标答案",
                token_count=1,
                char_start=0,
                char_end=4,
                index_version=0,
                created_at=datetime.now(UTC),
            )
        )
    session.commit()

    results = retrieve_lexical_chunks(session, workspace_id, "目标答案", limit=1)

    assert [item.chunk.id for item in results] == [current_chunk.id]


def test_rrf_merges_by_document_page_and_keeps_stable_page_order() -> None:
    session, _workspace_id, _thread = build_session()
    document = session.query(Document).one()
    page_one = session.query(DocumentPage).one()
    chunk_one = session.query(DocumentChunk).one()
    page_two = DocumentPage(
        id=str(uuid4()),
        workspace_id=document.workspace_id,
        document_id=document.id,
        page_number=5,
        extracted_text="second page",
        char_count=11,
        created_at=datetime.now(UTC),
    )
    duplicate_chunk = DocumentChunk(
        id=str(uuid4()),
        workspace_id=document.workspace_id,
        document_id=document.id,
        page_id=page_one.id,
        chunk_index=1,
        chunk_text="duplicate page chunk",
        token_count=3,
        char_start=0,
        char_end=20,
        index_version=1,
        created_at=datetime.now(UTC),
    )
    second_page_chunk = DocumentChunk(
        id=str(uuid4()),
        workspace_id=document.workspace_id,
        document_id=document.id,
        page_id=page_two.id,
        chunk_index=0,
        chunk_text="second page",
        token_count=2,
        char_start=0,
        char_end=11,
        index_version=1,
        created_at=datetime.now(UTC),
    )
    dense = [
        RetrievedChunk(chunk_one, document, page_one, 0.1),
        RetrievedChunk(duplicate_chunk, document, page_one, 0.2),
        RetrievedChunk(second_page_chunk, document, page_two, 0.3),
    ]
    lexical = [
        RetrievedChunk(second_page_chunk, document, page_two, 0.1),
        RetrievedChunk(chunk_one, document, page_one, 0.2),
    ]

    merged = _rrf_merge(dense, lexical, limit=3, constant=60)

    assert [item.page.page_number for item in merged] == [4, 5]


def test_mixed_language_lexical_terms_use_exact_latin_terms() -> None:
    assert _lexical_terms("Shape Up 为什么不使用 backlog？") == ["shape", "up", "backlog"]


def test_retrieval_logs_flat_strategy_counts_and_stage_timings(
    caplog: pytest.LogCaptureFixture,
) -> None:
    session, workspace_id, _thread = build_session()

    before = RETRIEVAL_REQUESTS.labels(strategy="hybrid", outcome="success")._value.get()
    with caplog.at_level("INFO", logger="ai_pdf_api.services.retrieval"):
        retrieve_query_chunks(
            session,
            workspace_id,
            "retrieval evidence",
            [1.0, 0.0, 0.0],
            embedding_provider=FakeEmbeddingProvider(),
            strategy="hybrid",
        )

    message = caplog.messages[-1]
    assert "strategy=hybrid" in message
    assert "dense_count=1 lexical_count=1 result_count=1" in message
    assert "dense_ms=" in message
    assert "lexical_ms=" in message
    assert "merge_ms=" in message
    assert "total_ms=" in message
    assert RETRIEVAL_REQUESTS.labels(strategy="hybrid", outcome="success")._value.get() == before + 1


def test_retrieval_records_error_outcome(monkeypatch: pytest.MonkeyPatch) -> None:
    session, workspace_id, _thread = build_session()
    errors = RETRIEVAL_REQUESTS.labels(strategy="hybrid", outcome="error")
    before = errors._value.get()

    def fail_dense(*_args, **_kwargs):
        raise RuntimeError("database unavailable")

    monkeypatch.setattr("ai_pdf_api.services.retrieval.retrieve_chunks", fail_dense)

    with pytest.raises(RuntimeError, match="database unavailable"):
        retrieve_query_chunks(
            session,
            workspace_id,
            "retrieval evidence",
            [1.0, 0.0, 0.0],
            embedding_provider=FakeEmbeddingProvider(),
            strategy="hybrid",
        )

    assert errors._value.get() == before + 1


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


def test_chat_uses_persisted_workspace_prompt_and_top_k(monkeypatch: pytest.MonkeyPatch) -> None:
    import ai_pdf_api.services.chat as chat_service

    session, workspace_id, thread = build_session()
    workspace = session.get(Workspace, workspace_id)
    assert workspace is not None
    workspace.system_prompt = "Use the workspace review policy."
    workspace.retrieval_top_k = 3
    session.commit()

    captured: dict[str, int] = {}
    original_retrieve = chat_service.retrieve_query_chunks

    def capture_limit(*args, **kwargs):
        captured["limit"] = kwargs["limit"]
        return original_retrieve(*args, **kwargs)

    monkeypatch.setattr(chat_service, "retrieve_query_chunks", capture_limit)
    generation = FakeGenerationProvider()
    complete_chat(
        session,
        workspace_id=workspace_id,
        user_id="owner",
        thread=thread,
        question="What is the evidence?",
        embedding_provider=FakeEmbeddingProvider(),
        generation_provider=generation,
    )

    assert captured["limit"] == 3
    assert generation.messages[0] == {
        "role": "system",
        "content": "Use the workspace review policy.",
    }
