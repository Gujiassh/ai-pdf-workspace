from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ai_pdf_api.models import ChatMessage, ChatThread, MessageCitation
from ai_pdf_api.services.providers import (
    EmbeddingProvider,
    GenerationProvider,
    ModelProviderError,
    get_embedding_provider,
    get_generation_provider,
)
from ai_pdf_api.services.retrieval import RetrievedChunk, retrieve_chunks


class ChatError(RuntimeError):
    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


@dataclass(frozen=True)
class CompletedChat:
    user_message: ChatMessage
    assistant_message: ChatMessage
    citations: list[MessageCitation]


@dataclass(frozen=True)
class PreparedChat:
    thread: ChatThread
    user_message: ChatMessage
    assistant_message: ChatMessage
    citations: list[MessageCitation]
    generation_messages: list[dict[str, str]]
    generation_provider: GenerationProvider


def prepare_chat(
    db: Session,
    *,
    workspace_id: str,
    user_id: str,
    thread: ChatThread,
    question: str,
    selection_text: str | None = None,
    parent_message_id: str | None = None,
    use_thread_active_parent: bool = True,
    embedding_provider: EmbeddingProvider | None = None,
    generation_provider: GenerationProvider | None = None,
) -> PreparedChat:
    del user_id
    question_text = question.strip()
    if not question_text:
        raise ChatError("question_required", "Question must not be empty.", 422)

    embedding = embedding_provider or get_embedding_provider()
    generation = generation_provider or get_generation_provider()
    parent_id = thread.active_message_id if parent_message_id is None and use_thread_active_parent else parent_message_id
    if parent_id is not None:
        parent = db.scalar(
            select(ChatMessage).where(
                ChatMessage.id == parent_id,
                ChatMessage.thread_id == thread.id,
                ChatMessage.workspace_id == workspace_id,
            )
        )
        if parent is None or parent.status != "completed":
            raise ChatError("invalid_parent_message", "The conversation parent is no longer available.", 422)

    try:
        query_embedding = embedding.embed_query(question_text)
        retrieved = retrieve_chunks(
            db,
            workspace_id,
            query_embedding,
            embedding_provider=embedding,
            limit=6,
        )
        if not retrieved:
            raise ChatError(
                "no_retrieval_results",
                "No ready document chunks matched this question in the workspace.",
                422,
            )

        prior_messages = _get_message_lineage(db, thread.id, parent_id)
        context = _build_retrieval_context(retrieved)
        user_prompt = _build_user_prompt(question_text, context, selection_text)
        generation_messages = [
            {
                "role": "system",
                "content": (
                    "You answer questions using only the supplied PDF context. "
                    "If the context does not support an answer, say that clearly. "
                    "Cite supporting sources inline as [1], [2], and do not invent source numbers. "
                    "Be concise and preserve important caveats."
                ),
            },
            *({"role": message.role, "content": message.content} for message in prior_messages),
            {"role": "user", "content": user_prompt},
        ]

        now = datetime.now(UTC)
        user_message = ChatMessage(
            id=str(uuid4()),
            workspace_id=workspace_id,
            thread_id=thread.id,
            parent_message_id=parent_id,
            role="user",
            content=question_text,
            status="completed",
            created_at=now,
        )
        assistant_message = ChatMessage(
            id=str(uuid4()),
            workspace_id=workspace_id,
            thread_id=thread.id,
            parent_message_id=user_message.id,
            role="assistant",
            content="",
            status="streaming",
            model_provider=generation.provider,
            model_name=generation.model,
            created_at=now,
        )
        db.add_all([user_message, assistant_message])
        db.flush()

        citations = [
            MessageCitation(
                id=str(uuid4()),
                workspace_id=workspace_id,
                message_id=assistant_message.id,
                citation_index=index,
                document_id=item.document.id,
                chunk_id=item.chunk.id,
                page_number_snapshot=item.page.page_number,
                document_title_snapshot=item.document.title,
                excerpt_snapshot=item.chunk.chunk_text[:800],
                index_version_snapshot=item.chunk.index_version,
                created_at=now,
            )
            for index, item in enumerate(retrieved)
        ]
        db.add_all(citations)
        thread.title = thread.title or question_text[:80]
        thread.last_message_at = now
        thread.updated_at = now
        db.commit()
        db.refresh(user_message)
        db.refresh(assistant_message)
        return PreparedChat(
            thread=thread,
            user_message=user_message,
            assistant_message=assistant_message,
            citations=citations,
            generation_messages=generation_messages,
            generation_provider=generation,
        )
    except ChatError:
        db.rollback()
        raise
    except ModelProviderError as error:
        db.rollback()
        raise ChatError(error.code, error.message, 502) from error
    except Exception:
        db.rollback()
        raise


def finalize_chat(db: Session, prepared: PreparedChat, answer: str) -> CompletedChat:
    if not answer.strip():
        fail_chat(db, prepared, "generation_empty", "Generation provider returned an empty answer.")
        raise ModelProviderError("generation_empty", "Generation provider returned an empty answer.")

    prepared.assistant_message.content = answer.strip()
    prepared.assistant_message.status = "completed"
    prepared.thread.active_message_id = prepared.assistant_message.id
    prepared.thread.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(prepared.user_message)
    db.refresh(prepared.assistant_message)
    return CompletedChat(
        user_message=prepared.user_message,
        assistant_message=prepared.assistant_message,
        citations=prepared.citations,
    )


def fail_chat(db: Session, prepared: PreparedChat, code: str, message: str) -> None:
    db.rollback()
    assistant = db.get(ChatMessage, prepared.assistant_message.id)
    thread = db.get(ChatThread, prepared.thread.id)
    db.execute(delete(MessageCitation).where(MessageCitation.message_id == prepared.assistant_message.id))
    if assistant is not None:
        assistant.status = "failed"
        assistant.content = message
    if thread is not None:
        thread.updated_at = datetime.now(UTC)
    db.commit()


def complete_chat(
    db: Session,
    *,
    workspace_id: str,
    user_id: str,
    thread: ChatThread,
    question: str,
    selection_text: str | None = None,
    parent_message_id: str | None = None,
    use_thread_active_parent: bool = True,
    embedding_provider: EmbeddingProvider | None = None,
    generation_provider: GenerationProvider | None = None,
) -> CompletedChat:
    prepared = prepare_chat(
        db,
        workspace_id=workspace_id,
        user_id=user_id,
        thread=thread,
        question=question,
        selection_text=selection_text,
        parent_message_id=parent_message_id,
        use_thread_active_parent=use_thread_active_parent,
        embedding_provider=embedding_provider,
        generation_provider=generation_provider,
    )
    try:
        answer = prepared.generation_provider.generate(prepared.generation_messages)
        return finalize_chat(db, prepared, answer)
    except ModelProviderError as error:
        fail_chat(db, prepared, error.code, error.message)
        raise
    except Exception as error:
        fail_chat(db, prepared, "generation_failed", str(error))
        raise


def _get_message_lineage(db: Session, thread_id: str, leaf_id: str | None) -> list[ChatMessage]:
    if leaf_id is None:
        return []
    messages = db.scalars(select(ChatMessage).where(ChatMessage.thread_id == thread_id)).all()
    by_id = {message.id: message for message in messages}
    lineage: list[ChatMessage] = []
    current_id: str | None = leaf_id
    visited: set[str] = set()
    while current_id is not None:
        if current_id in visited:
            raise ChatError("invalid_message_graph", "The conversation message graph contains a cycle.", 500)
        visited.add(current_id)
        current = by_id.get(current_id)
        if current is None:
            raise ChatError("invalid_parent_message", "The conversation parent is no longer available.", 422)
        if current.status == "completed":
            lineage.append(current)
        current_id = current.parent_message_id
    lineage.reverse()
    return lineage


def active_message_path(db: Session, thread: ChatThread) -> list[ChatMessage]:
    messages = db.scalars(
        select(ChatMessage).where(ChatMessage.thread_id == thread.id).order_by(ChatMessage.created_at, ChatMessage.id)
    ).all()
    if not messages:
        return []
    leaf_id = thread.active_message_id
    if leaf_id is None:
        raise ChatError("invalid_message_graph", "The conversation has messages but no active leaf.", 500)
    by_id = {message.id: message for message in messages}
    path: list[ChatMessage] = []
    visited: set[str] = set()
    current_id: str | None = leaf_id
    while current_id is not None:
        if current_id in visited:
            raise ChatError("invalid_message_graph", "The conversation message graph contains a cycle.", 500)
        visited.add(current_id)
        current = by_id.get(current_id)
        if current is None:
            raise ChatError("invalid_message_graph", "The active conversation leaf is missing.", 500)
        path.append(current)
        current_id = current.parent_message_id
    path.reverse()
    return path


def _build_retrieval_context(items: list[RetrievedChunk]) -> str:
    sections = []
    for index, item in enumerate(items, start=1):
        sections.append(
            f"[{index}] {item.document.title}, page {item.page.page_number}\n{item.chunk.chunk_text[:4000]}"
        )
    return "\n\n".join(sections)


def _build_user_prompt(question: str, context: str, selection_text: str | None) -> str:
    selected = ""
    if selection_text and selection_text.strip():
        selected = f"\n\nSelected text from the PDF:\n{selection_text.strip()[:12000]}"
    return f"Question:\n{question}{selected}\n\nPDF context:\n{context}"
