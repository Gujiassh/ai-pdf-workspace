from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from ai_pdf_api.core.settings import settings
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


def complete_chat(
    db: Session,
    *,
    workspace_id: str,
    user_id: str,
    thread: ChatThread,
    question: str,
    selection_text: str | None = None,
    embedding_provider: EmbeddingProvider | None = None,
    generation_provider: GenerationProvider | None = None,
) -> CompletedChat:
    embedding = embedding_provider or get_embedding_provider()
    generation = generation_provider or get_generation_provider()
    question_text = question.strip()
    if not question_text:
        raise ChatError("question_required", "Question must not be empty.", 422)

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

        prior_messages = db.scalars(
            select(ChatMessage)
            .where(ChatMessage.thread_id == thread.id, ChatMessage.status == "completed")
            .order_by(ChatMessage.created_at.desc())
            .limit(8),
        ).all()
        prior_messages.reverse()
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
        answer = generation.generate(generation_messages)
        if not answer:
            raise ModelProviderError("generation_empty", "Generation provider returned an empty answer.")

        now = datetime.now(UTC)
        user_message = ChatMessage(
            id=str(uuid4()),
            workspace_id=workspace_id,
            thread_id=thread.id,
            role="user",
            content=question_text,
            status="completed",
            created_at=now,
        )
        assistant_message = ChatMessage(
            id=str(uuid4()),
            workspace_id=workspace_id,
            thread_id=thread.id,
            role="assistant",
            content=answer,
            status="completed",
            model_provider=generation.provider,
            model_name=generation.model,
            created_at=now,
        )
        db.add_all([user_message, assistant_message])
        thread.title = thread.title or question_text[:80]
        thread.last_message_at = now
        thread.updated_at = now
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
        db.commit()
        db.refresh(user_message)
        db.refresh(assistant_message)
        return CompletedChat(user_message=user_message, assistant_message=assistant_message, citations=citations)
    except ChatError:
        db.rollback()
        raise
    except ModelProviderError as error:
        db.rollback()
        raise ChatError(error.code, error.message, 502) from error
    except Exception:
        db.rollback()
        raise


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
